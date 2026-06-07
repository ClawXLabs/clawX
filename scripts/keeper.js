const { ethers } = require("ethers");
require("dotenv").config();
const { fetchFastPrices } = require("../utils/fastPrice");

const CONTRACT_ABI = [
  "function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData)",
  "function resolveExpiredRounds() external",
  "function resolveExpiredRoundsWithPrices(uint256[] calldata assetIds, uint256[] calldata endPrices) external",
  "function getAssetCount() external view returns (uint256)",
  "function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)",
  "function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)",
];

const POLL_MS = Number(process.env.KEEPER_POLL_MS || 1000);
const RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY;

function isConfiguredPrivateKey(value) {
  const normalized = normalizePrivateKey(value);
  return Boolean(normalized && !/^0x0+$/.test(normalized));
}

function normalizePrivateKey(value) {
  if (!value) return "";
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExpiredMarkets(contract) {
  const now = Math.floor(Date.now() / 1000);
  const assetCount = Number(await contract.getAssetCount());
  const assets = await Promise.all(
    Array.from({ length: assetCount }, (_, assetId) => contract.getAsset(assetId))
  );

  const rounds = await Promise.all(
    assets.map(async (asset, assetId) => {
      const currentRoundId = Number(asset.currentRoundId);
      if (currentRoundId === 0) return null;

      const round = await contract.getRoundInfo(currentRoundId);
      const endTime = Number(round.endTime);
      if (!round.resolved && endTime <= now) {
        return {
          assetId,
          symbol: asset.symbol,
          priceFeed: asset.priceFeed,
          roundId: currentRoundId,
          endTime,
        };
      }
      return null;
    })
  );

  return rounds.filter(Boolean);
}

async function settleExpired(contract) {
  const expired = await getExpiredMarkets(contract);
  if (expired.length === 0) return;

  console.log(
    `[keeper] Settling ${expired.length} expired market(s): ${expired
      .map((market) => `${market.symbol}#${market.roundId}`)
      .join(", ")}`
  );

  const fastPrices = await fetchFastPrices(expired.map((market) => market.symbol), {
    requestTimeoutMs: 3000,
    settleQuick: true,
  });
  for (const market of expired) {
    if (!fastPrices[market.symbol]) {
      throw new Error(`Missing fast price for ${market.symbol}`);
    }
  }
  const feeData = await contract.runner.provider.getFeeData();
  const gasOverrides = {};
  if (feeData.maxFeePerGas) {
    gasOverrides.maxFeePerGas = (feeData.maxFeePerGas * 300n) / 100n;
    if (feeData.maxPriorityFeePerGas) {
      gasOverrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 300n) / 100n;
    }
  } else if (feeData.gasPrice) {
    gasOverrides.gasPrice = (feeData.gasPrice * 300n) / 100n;
  }
  const tx = await contract.resolveExpiredRoundsWithPrices(
    expired.map((market) => market.assetId),
    expired.map((market) => fastPrices[market.symbol].price8),
    gasOverrides
  );
  console.log(`[keeper] Submitted ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[keeper] Confirmed in block ${receipt.blockNumber}`);
}

async function main() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is required");
  }

  if (!isConfiguredPrivateKey(PRIVATE_KEY)) {
    throw new Error("SETTLEMENT_PRIVATE_KEY is required for the keeper signer");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(normalizePrivateKey(PRIVATE_KEY), provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  const network = await provider.getNetwork();

  console.log(`[keeper] Network chainId: ${network.chainId}`);
  console.log(`[keeper] Signer: ${wallet.address}`);
  console.log(`[keeper] Contract: ${CONTRACT_ADDRESS}`);
  console.log(`[keeper] Polling every ${POLL_MS}ms`);

  while (true) {
    try {
      const [upkeepNeeded] = await contract.checkUpkeep("0x");
      if (upkeepNeeded) {
        await settleExpired(contract);
      }
    } catch (error) {
      const msg = error.shortMessage || error.message || String(error);
      if (msg.includes("No expired rounds")) {
        /* UI or a prior keeper pass already settled */
      } else {
        console.error("[keeper] Settlement check failed:", msg);
      }
    }

    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error("[keeper] Fatal:", error.message || error);
  process.exit(1);
});
