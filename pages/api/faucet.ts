const { ethers } = require('ethers');
const { query } = require('../../utils/db/postgres');

const TUSDC_ABI = [
  'function mint(address to, uint256 amount) external',
  'function owner() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
];

const CLAIM_AMOUNT = 300n * 10n ** 6n;

/** Seconds between claims per address. Env FAUCET_COOLDOWN_SEC: use 0 for frictionless local testing, 86400 for production-like demo. */
function cooldownSeconds() {
  const raw = process.env.FAUCET_COOLDOWN_SEC;
  if (raw === undefined || raw === '') return 24 * 60 * 60;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 24 * 60 * 60;
  return Math.floor(n);
}

function normalizePrivateKey(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : '';
}

function faucetKeyCandidates() {
  const list = [
    normalizePrivateKey(process.env.FAUCET_PRIVATE_KEY),
    normalizePrivateKey(process.env.PRIVATE_KEY),
    normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY),
  ].filter(Boolean);
  return [...new Set(list)];
}

async function readLastClaim(wallet) {
  const result = await query('SELECT last_claim FROM faucet_claims WHERE wallet = $1', [wallet]);
  const value = result.rows[0]?.last_claim;
  return value ? Math.floor(new Date(value).getTime() / 1000) : 0;
}

async function recordClaim(wallet, claimedAt) {
  await query(
    `INSERT INTO faucet_claims (wallet, last_claim, claim_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (wallet) DO UPDATE SET
       last_claim = EXCLUDED.last_claim,
       claim_count = faucet_claims.claim_count + 1`,
    [wallet, new Date(claimedAt * 1000)]
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tokenAddress =
    process.env.NEXT_PUBLIC_TUSDC_ADDRESS || '0xd27D2AB610714E262E64c7BFA789769A98A5DeB1';
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

  const addressRaw = req.body?.address;
  if (!addressRaw || !ethers.isAddress(addressRaw)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }
  const recipient = ethers.getAddress(addressRaw);

  const keys = faucetKeyCandidates();
  if (keys.length === 0) {
    return res.status(503).json({
      error: 'Faucet key not configured. Set FAUCET_PRIVATE_KEY (Tusdc owner) or PRIVATE_KEY in .env.',
    });
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const code = await provider.getCode(tokenAddress);
  if (!code || code === '0x') {
    return res.status(500).json({
      error: `No contract at NEXT_PUBLIC_TUSDC_ADDRESS (${tokenAddress}). Check .env.`,
    });
  }

  const tusdcRead = new ethers.Contract(tokenAddress, TUSDC_ABI, provider);
  let onChainOwner;
  try {
    onChainOwner = await tusdcRead.owner();
  } catch (e) {
    return res.status(500).json({
      error: `Could not read TUSDC owner() at ${tokenAddress}. Wrong contract?`,
    });
  }

  const ownerLower = onChainOwner.toLowerCase();
  const signerKeys = keys.filter((key) => {
    try {
      return new ethers.Wallet(key).address.toLowerCase() === ownerLower;
    } catch {
      return false;
    }
  });

  if (signerKeys.length === 0) {
    return res.status(503).json({
      error:
        'No private key in .env matches the TUSDC contract owner, so mint cannot run. ' +
        `On-chain owner is ${onChainOwner}. Set FAUCET_PRIVATE_KEY (recommended) or PRIVATE_KEY to that wallet's key — the same one used to deploy Tusdc.`,
      tusdcOwner: onChainOwner,
    });
  }

  const cooldownSec = cooldownSeconds();
  const now = Math.floor(Date.now() / 1000);
  let last = await readLastClaim(recipient.toLowerCase());
  // Corrupt / clock-skew entries (e.g. timestamp in the future) would block forever — ignore them.
  if (last > now) last = 0;

  if (cooldownSec > 0 && last && now - last < cooldownSec) {
    const waitSec = cooldownSec - (now - last);
    return res.status(429).json({
      error: `Already claimed. Try again in ${Math.ceil(waitSec / 3600)}h or wait ${waitSec}s.`,
    });
  }

  const readBal = new ethers.Contract(tokenAddress, TUSDC_ABI, provider);
  let balanceBefore;
  try {
    balanceBefore = await readBal.balanceOf(recipient);
  } catch {
    balanceBefore = 0n;
  }

  let lastError = null;
  for (const key of signerKeys) {
    try {
      const wallet = new ethers.Wallet(key, provider);
      const tusdc = new ethers.Contract(tokenAddress, TUSDC_ABI, wallet);

      const tx = await tusdc.mint(recipient, CLAIM_AMOUNT);
      await tx.wait();

      const balanceAfter = await readBal.balanceOf(recipient);
      if (balanceAfter < balanceBefore + CLAIM_AMOUNT) {
        console.error('Faucet: balance did not increase after mint', {
          recipient,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        });
        return res.status(500).json({
          error:
            'Mint appeared to complete but your TUSDC balance did not increase. Check NEXT_PUBLIC_TUSDC_ADDRESS matches the Tusdc contract on Fuji.',
        });
      }

      await recordClaim(recipient.toLowerCase(), now);

      return res.status(200).json({
        ok: true,
        hash: tx.hash,
        amount: CLAIM_AMOUNT.toString(),
        recipient,
        balance: balanceAfter.toString(),
      });
    } catch (e) {
      lastError = e;
    }
  }

  console.error('Faucet mint failed:', lastError);
  return res.status(500).json({
    error:
      lastError?.shortMessage ||
      lastError?.message ||
      'Mint failed. Ensure the owner wallet has Fuji AVAX for gas and try again.',
  });
}
