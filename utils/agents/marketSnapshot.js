import { ethers } from 'ethers';
import { getRedis } from '../db/redis.js';

const CONTRACT_ABI = [
  'function getAssetCount() external view returns (uint256)',
  'function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)',
  'function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)',
];

const SNAPSHOT_KEY = 'agent:markets:snapshot';

function serializeBig(value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function reviveAsset(asset) {
  return {
    ...asset,
    round: {
      ...asset.round,
      startPrice: BigInt(asset.round.startPrice),
      currentPrice: BigInt(asset.round.currentPrice),
      upPool: BigInt(asset.round.upPool),
      downPool: BigInt(asset.round.downPool),
    },
  };
}

export async function loadMarketAssets(contract) {
  const count = Number(await contract.getAssetCount());
  const rows = await Promise.all(
    Array.from({ length: count }, async (_, assetId) => {
      const asset = await contract.getAsset(assetId);
      if (!asset.enabled) return null;
      const roundId = Number(asset.currentRoundId);
      if (!roundId) return null;
      const round = await contract.getRoundInfo(roundId);
      const endTime = Number(round.endTime);
      if (round.resolved || endTime <= Math.floor(Date.now() / 1_000) + 25) return null;
      return {
        assetId,
        symbol: String(asset.symbol).trim(),
        roundId,
        round: {
          assetId,
          startPrice: serializeBig(round.startPrice),
          currentPrice: serializeBig(round.currentPrice),
          upPool: serializeBig(round.upPool),
          downPool: serializeBig(round.downPool),
          endTime,
          upWins: round.upWins,
          resolved: round.resolved,
        },
      };
    })
  );
  return rows.filter(Boolean);
}

export async function refreshMarketSnapshot(options = {}) {
  const contractAddress = options.contractAddress || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is required');
  const rpcUrl = options.rpcUrl || process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const ttlSec = Math.max(5, Number(options.ttlSec || process.env.AGENT_MARKET_SNAPSHOT_TTL_SEC || 10));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
  const assets = await loadMarketAssets(contract);
  if (process.env.REDIS_URL) {
    const redis = getRedis();
    if (redis.status !== 'ready') await redis.connect().catch(() => {});
    await redis.set(SNAPSHOT_KEY, JSON.stringify({ updatedAt: Date.now(), assets }), 'EX', ttlSec);
  }
  return assets.map(reviveAsset);
}

export async function getMarketSnapshot(options = {}) {
  if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      if (redis.status !== 'ready') await redis.connect().catch(() => {});
      const cached = await redis.get(SNAPSHOT_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.assets)) return parsed.assets.map(reviveAsset);
      }
    } catch {
      // Fall through to a direct RPC load.
    }
  }
  return refreshMarketSnapshot(options);
}
