import { ethers } from 'ethers';
import { buildTradeAuthMessage } from '../../utils/tradeAuth';
import { acquireRedisLock } from '../../utils/db/redisLock';

const MARKET_ABI = [
  'function owner() view returns (address)',
  'function settlementOperator() view returns (address)',
  'function buyPositionFor(address buyer,uint256 roundId,bool isUp,uint256 amountIn) returns (uint256)',
  'function sellPositionFor(address seller,uint256 roundId,bool isUp,uint256 sharesIn) returns (uint256)',
  'function claimWinningsFor(address claimer,uint256 roundId) returns (uint256)',
  'function collateralToken() view returns (address)',
];

const ERC20_PERMIT_ABI = [
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s) external',
  'function allowance(address owner,address spender) view returns (uint256)',
];

function normalizePrivateKey(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : '';
}

function relayerAuthError(relayer, owner, operator) {
  return `Relayer wallet ${relayer} is not allowed to submit trades for this contract. On-chain owner is ${owner} and settlementOperator is ${operator}. Set SETTLEMENT_PRIVATE_KEY (or PRIVATE_KEY) in .env to one of those addresses — usually the same account that deployed the market.`;
}

/** OpenZeppelin v5 + market-style errors so RPC "unknown custom error" becomes readable. */
const DECODE_ERROR_IFACE = new ethers.Interface([
  'error Error(string message)',
  'error Panic(uint256 code)',
  'error OwnableUnauthorizedAccount(address account)',
  'error OwnableInvalidOwner(address owner)',
  'error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)',
  'error ERC20InsufficientAllowance(address spender,uint256 allowance,uint256 needed)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidReceiver(address receiver)',
  'error SafeERC20FailedOperation(address token)',
  'error ERC2612ExpiredSignature(uint256 deadline)',
  'error ERC2612InvalidSigner(address signer,address owner)',
  'error ReentrancyGuardReentrantCall()',
]);

function getRevertData(error) {
  const d = error?.data;
  if (typeof d === 'string' && d.startsWith('0x') && d.length >= 10) return d;
  const inner = error?.error?.data ?? error?.info?.error?.data;
  if (typeof inner === 'string' && inner.startsWith('0x') && inner.length >= 10) return inner;
  return null;
}

function describeParsedError(parsed) {
  const { name, args } = parsed;
  switch (name) {
    case 'Error':
      return String(args[0]);
    case 'Panic':
      return `Solidity panic (code ${args[0].toString()}).`;
    case 'OwnableUnauthorizedAccount':
      return `Caller ${args[0]} is not the contract owner. For relayer trades, SETTLEMENT_PRIVATE_KEY must be owner() or settlementOperator() on this market (see 503 response when the pre-check fails).`;
    case 'OwnableInvalidOwner':
      return `Invalid owner reference: ${args[0]}.`;
    case 'ERC20InsufficientAllowance': {
      const [spender, allowance, needed] = args;
      return `TUSDC allowance too low (spender ${spender}, have ${allowance.toString()}, need ${needed.toString()}). Sign a fresh permit or approve the market contract.`;
    }
    case 'ERC20InsufficientBalance': {
      const [sender, bal, needed] = args;
      return `Collateral balance too low for wallet ${sender}: have ${bal.toString()} smallest units, need ${needed.toString()}. (Fuji Tusdc uses 6 decimals — e.g. 1000000 = 1 token.) If MetaMask shows a large "TUSDC" balance, confirm network is Avalanche Fuji and the token contract is the same Tusdc the market uses (collateral from the market contract), not Avalanche mainnet USDC or another address.`;
    }
    case 'ERC20InvalidSender':
      return `Invalid TUSDC transfer sender: ${args[0]}.`;
    case 'ERC20InvalidReceiver':
      return `Invalid TUSDC transfer receiver: ${args[0]}.`;
    case 'SafeERC20FailedOperation':
      return `TUSDC transfer failed (token ${args[0]}). Usually insufficient balance or allowance for the amount pulled from the buyer.`;
    case 'ERC2612ExpiredSignature':
      return `Permit deadline expired (${args[0].toString()}). Sign a new permit.`;
    case 'ERC2612InvalidSigner':
      return `Permit signer ${args[0]} does not match declared owner ${args[1]}.`;
    case 'ReentrancyGuardReentrantCall':
      return 'Reentrancy guard triggered (unexpected in normal use). Retry the trade.';
    default:
      return `${name}(${args.map((a) => (typeof a === 'bigint' ? a.toString() : String(a))).join(', ')})`;
  }
}

/**
 * @param {unknown} error
 * @param {'permit' | 'market' | 'tx'} stage — only used when revert data cannot be decoded.
 */
function humanizeContractError(error, stage = 'market') {
  const base = error?.shortMessage || error?.message || 'Transaction failed';
  const reason = error?.reason || error?.revert?.args?.[0];
  if (typeof reason === 'string' && reason.length > 0 && !String(reason).includes('unknown custom error')) {
    return `${base}: ${reason}`;
  }

  const data = getRevertData(error);
  if (data) {
    try {
      const parsed = DECODE_ERROR_IFACE.parseError(data);
      return describeParsedError(parsed);
    } catch {
      try {
        const iface = new ethers.Interface(['error Error(string message)']);
        const parsed = iface.parseError(data);
        if (parsed?.name === 'Error') return String(parsed.args[0]);
      } catch {
        /* ignore */
      }
    }
  }

  const fallback =
    stage === 'permit'
      ? 'Permit simulation failed: sign again (fresh nonce/deadline), confirm spender is the market and value matches the trade, or approve TUSDC manually.'
      : stage === 'tx'
        ? 'Broadcast transaction failed after simulation succeeded; retry or inspect the tx on a block explorer.'
        : 'Simulated trade failed: round may be missing/ended/resolved, trade size may yield zero shares, you may lack UP/DOWN shares to sell, or TUSDC balance/allowance may be insufficient.';

  if (base.includes('custom error') || base.includes('execution reverted')) {
    return `${base}. ${fallback}`;
  }
  return base;
}

/** Successful authorizations only — prevents signature replay after a confirmed relayer tx. */
const consumedNonces = new Map();

function pruneNonces() {
  const now = Date.now();
  for (const [k, exp] of consumedNonces.entries()) {
    if (exp < now) consumedNonces.delete(k);
  }
}

function isNonceUsed(trader, nonce) {
  pruneNonces();
  const key = `${ethers.getAddress(trader).toLowerCase()}:${nonce}`;
  return consumedNonces.has(key);
}

function markNonceUsed(trader, nonce) {
  const key = `${ethers.getAddress(trader).toLowerCase()}:${nonce}`;
  consumedNonces.set(key, Date.now() + 15 * 60_000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const privateKey = normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY);

  if (!contractAddress) {
    return res.status(500).json({ error: 'NEXT_PUBLIC_CONTRACT_ADDRESS is not configured' });
  }
  if (!privateKey) {
    return res.status(503).json({
      error: 'Relayer key missing. Set SETTLEMENT_PRIVATE_KEY (same wallet that is settlement operator on the market contract).',
    });
  }

  const body = req.body || {};
  const action = body.action;
  const trader = body.trader;
  const roundId = body.roundId;
  const isUp = body.isUp;
  const amountRaw = body.amountRaw;
  const deadline = Number(body.deadline);
  const nonce = body.nonce;
  const signature = body.signature;
  const permit = body.permit;

  if (!['buy', 'sell', 'claim'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  if (!trader || !ethers.isAddress(trader)) {
    return res.status(400).json({ error: 'Invalid trader' });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing signature' });
  }
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'Missing nonce' });
  }
  if (!Number.isFinite(deadline) || deadline < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Expired or invalid deadline' });
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  let amountForAuth = '0';
  if (action === 'buy' || action === 'sell') {
    if (!Number.isFinite(Number(roundId))) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
    if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw) || amountRaw === '0') {
      return res.status(400).json({ error: 'Invalid amountRaw' });
    }
    amountForAuth = amountRaw;
  } else if (action === 'claim') {
    if (!Number.isFinite(Number(roundId))) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
  }

  const authMessage = buildTradeAuthMessage({
    chainId,
    contractAddress,
    trader,
    action,
    roundId: Number(roundId),
    isUp: action === 'claim' ? false : Boolean(isUp),
    amount: amountForAuth,
    nonce,
    deadline,
  });

  let recovered;
  try {
    recovered = ethers.verifyMessage(authMessage, signature);
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (recovered.toLowerCase() !== ethers.getAddress(trader).toLowerCase()) {
    return res.status(400).json({ error: 'Signature does not match trader' });
  }

  if (isNonceUsed(trader, nonce)) {
    return res.status(400).json({ error: 'Authorization nonce already used' });
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const market = new ethers.Contract(contractAddress, MARKET_ABI, wallet);

  let ownerAddr;
  let operatorAddr;
  try {
    [ownerAddr, operatorAddr] = await Promise.all([market.owner(), market.settlementOperator()]);
  } catch {
    return res.status(500).json({
      error:
        'Could not read market contract (owner/settlementOperator). Check NEXT_PUBLIC_CONTRACT_ADDRESS points to a PredictionMarket with buyPositionFor.',
    });
  }

  const relayer = wallet.address.toLowerCase();
  if (relayer !== ownerAddr.toLowerCase() && relayer !== operatorAddr.toLowerCase()) {
    return res.status(503).json({ error: relayerAuthError(wallet.address, ownerAddr, operatorAddr) });
  }

  // Keeper, /api/settle, /api/claim-all, and agent workers share this relayer
  // wallet; serialize sends so concurrent txs never collide on a nonce.
  let releaseNonceLock = null;
  try {
    const collateralAddr = await market.collateralToken();
    const token = new ethers.Contract(collateralAddr, ERC20_PERMIT_ABI, wallet);

    releaseNonceLock = await acquireRedisLock(`lock:relayer-nonce:${relayer}`);

    if (permit && typeof permit === 'object') {
      const pDeadline = Number(permit.deadline);
      if (!Number.isFinite(pDeadline) || pDeadline < Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ error: 'Invalid permit deadline' });
      }
      const v = Number(permit.v);
      const r = permit.r;
      const s = permit.s;
      const value = BigInt(permit.value || '0');
      const owner = ethers.getAddress(permit.owner || trader);
      const spender = ethers.getAddress(permit.spender || contractAddress);
      if (value <= 0n) {
        return res.status(400).json({ error: 'Invalid permit value' });
      }
      try {
        await token.permit.staticCall(owner, spender, value, pDeadline, v, r, s);
      } catch (e) {
        return res.status(400).json({ error: humanizeContractError(e, 'permit') });
      }
      const permitTx = await token.permit(owner, spender, value, pDeadline, v, r, s);
      await permitTx.wait();
    }

    if (action === 'buy') {
      const amountIn = BigInt(amountRaw);
      const allowance = await token.allowance(trader, contractAddress);
      if (allowance < amountIn) {
        return res.status(400).json({
          error:
            'Insufficient TUSDC allowance for the market contract. Sign the permit when prompted, or approve the market from a wallet that has a little Fuji AVAX.',
        });
      }
      try {
        await market.buyPositionFor.staticCall(trader, BigInt(roundId), Boolean(isUp), amountIn);
      } catch (e) {
        return res.status(400).json({ error: humanizeContractError(e, 'market') });
      }
      const tx = await market.buyPositionFor(trader, BigInt(roundId), Boolean(isUp), amountIn);
      const receipt = await tx.wait();
      markNonceUsed(trader, nonce);
      return res.status(200).json({ hash: tx.hash, blockNumber: receipt.blockNumber });
    }

    if (action === 'sell') {
      const sharesIn = BigInt(amountRaw);
      try {
        await market.sellPositionFor.staticCall(trader, BigInt(roundId), Boolean(isUp), sharesIn);
      } catch (e) {
        return res.status(400).json({ error: humanizeContractError(e, 'market') });
      }
      const tx = await market.sellPositionFor(trader, BigInt(roundId), Boolean(isUp), sharesIn);
      const receipt = await tx.wait();
      markNonceUsed(trader, nonce);
      return res.status(200).json({ hash: tx.hash, blockNumber: receipt.blockNumber });
    }

    try {
      await market.claimWinningsFor.staticCall(trader, BigInt(roundId));
    } catch (e) {
      return res.status(400).json({ error: humanizeContractError(e, 'market') });
    }
    const tx = await market.claimWinningsFor(trader, BigInt(roundId));
    const receipt = await tx.wait();
    markNonceUsed(trader, nonce);
    return res.status(200).json({ hash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    console.error('Relayer trade failed:', error);
    return res.status(500).json({
      error: humanizeContractError(error, 'tx'),
    });
  } finally {
    if (releaseNonceLock) {
      await releaseNonceLock().catch(() => {});
    }
  }
}
