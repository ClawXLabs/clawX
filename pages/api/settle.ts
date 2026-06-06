import { ethers } from 'ethers';
import { fetchFastPrices } from '../../utils/fastPrice';
import type { NextApiRequest, NextApiResponse } from 'next';

const CONTRACT_ABI = [
  'function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData)',
  'function resolveExpiredRounds() external',
  'function resolveExpiredRoundsWithPrices(uint256[] calldata assetIds, uint256[] calldata endPrices) external',
  'function getAssetCount() external view returns (uint256)',
  'function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)',
  'function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)',
];

async function getExpiredMarkets(contract: ethers.Contract, blockTimestamp: number) {
  const assetCount = Number(await contract.getAssetCount());
  const assets = await Promise.all(
    Array.from({ length: assetCount }, (_, assetId) => contract.getAsset(assetId))
  );

  const rounds = await Promise.all(
    assets.map(async (asset: any, assetId: number) => {
      const currentRoundId = Number(asset.currentRoundId);
      if (currentRoundId === 0) return null;
      const round = await contract.getRoundInfo(currentRoundId);
      if (!round.resolved && Number(round.endTime) <= blockTimestamp) {
        return {
          assetId,
          symbol: asset.symbol,
          priceFeed: asset.priceFeed,
          roundId: currentRoundId,
          roundNumber: Number(round.roundNumber),
          startPrice: round.startPrice.toString(),
          oraclePriceBeforeSettlement: round.currentPrice.toString(),
        };
      }
      return null;
    })
  );

  return rounds.filter(Boolean) as any[];
}

function normalizePrivateKey(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : '';
}

function isConfiguredPrivateKey(value?: string): boolean {
  const normalized = normalizePrivateKey(value);
  return Boolean(normalized && !/^0x0+$/.test(normalized));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  if (!isConfiguredPrivateKey(privateKey)) {
    return res.status(503).json({
      error: 'Server settlement key is not configured. Add SETTLEMENT_PRIVATE_KEY to .env for automatic settlement.',
      needsSettlementKey: true,
    });
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);
    const block = await provider.getBlock('latest');
    
    if (!block) throw new Error("Could not fetch latest block");
    
    const expired = await getExpiredMarkets(contract, block.timestamp);

    if (expired.length === 0) {
      return res.status(200).json({
        settled: false,
        submitted: false,
        expired: [],
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
      });
    }

    const symbols = [...new Set(expired.map((market) => market.symbol))];
    const fastPrices = await fetchFastPrices(symbols, {
      requestTimeoutMs: 500,
      settleQuick: true,
    });
    
    for (const market of expired) {
      if (!fastPrices[market.symbol]) {
        return res.status(500).json({
          error: `Missing median price for symbol "${market.symbol}". Check FAST_ORACLE / asset symbols match ASSET_CONFIG.`,
        });
      }
    }
    
    const settlements = expired.map((market) => {
      const fastPrice = fastPrices[market.symbol];
      return {
        ...market,
        price: fastPrice.price,
        price8: fastPrice.price8.toString(),
        sources: fastPrice.sources,
      };
    });

    const fee = await provider.getFeeData();
    const gasPrice = fee.gasPrice ? (fee.gasPrice * 150n) / 100n : undefined;
    const tx = await contract.resolveExpiredRoundsWithPrices(
      settlements.map((market) => market.assetId),
      settlements.map((market) => fastPrices[market.symbol].price8),
      gasPrice ? { gasPrice } : {}
    );

    return res.status(200).json({
      settled: false,
      submitted: true,
      hash: tx.hash,
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
      expired: settlements,
      settledBy: wallet.address,
    });
  } catch (error: any) {
    console.error('Server settlement failed:', error);
    return res.status(500).json({
      error: error.shortMessage || error.message || 'Server settlement failed',
    });
  }
}
