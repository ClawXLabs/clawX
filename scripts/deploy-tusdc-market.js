/**
 * Deploy a new PredictionMarket that uses TUSDC (6 decimals) as collateral.
 *
 * Prerequisites:
 *   - TUSDC already deployed at NEXT_PUBLIC_TUSDC_ADDRESS (or pass via TUSDC_ADDRESS env var)
 *   - PRIVATE_KEY / SETTLEMENT_PRIVATE_KEY set in .env
 *
 * Usage:
 *   npx hardhat run scripts/deploy-tusdc-market.js --network fuji
 *
 * After running, copy the printed env vars into your .env file.
 */

const { ethers } = require("hardhat");
const { fetchFastPrice } = require("../utils/fastPrice");

function normalizePrivateKey(value) {
  if (!value) return "";
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : "";
}

async function main() {
  console.log("Deploying PredictionMarket with TUSDC collateral...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "AVAX"
  );

  // TUSDC address — prefer env var, fall back to known Fuji deploy
  const tusdcAddress =
    process.env.TUSDC_ADDRESS ||
    process.env.NEXT_PUBLIC_TUSDC_ADDRESS ||
    "0xd27D2AB610714E262E64c7BFA789769A98A5DeB1";

  console.log("TUSDC collateral address:", tusdcAddress);

  // TUSDC has 6 decimals — virtual liquidity = 1000 TUSDC per side
  const virtualLiquidity = ethers.parseUnits("1000", 6);

  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy(tusdcAddress, virtualLiquidity);
  await predictionMarket.waitForDeployment();
  const predictionMarketAddress = await predictionMarket.getAddress();
  console.log("\nPredictionMarket deployed to:", predictionMarketAddress);

  // Set up settlement operator if a separate relayer key is configured
  const settlementKey = normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY);
  const settlementAddress = settlementKey
    ? new ethers.Wallet(settlementKey).address
    : "";

  if (
    settlementAddress &&
    settlementAddress.toLowerCase() !== deployer.address.toLowerCase()
  ) {
    const opTx = await predictionMarket.setSettlementOperator(settlementAddress);
    await opTx.wait();
    console.log("Settlement operator set to:", settlementAddress);
  }

  // Deploy a FastPriceOracle for each asset
  const assets = ["AVAX", "BNB", "BTC", "ETH", "NEAR"];
  const FastPriceOracle = await ethers.getContractFactory("FastPriceOracle");
  const oracleAddresses = {};

  for (const asset of assets) {
    console.log(`\nFetching initial ${asset} median price...`);
    const initialPrice = await fetchFastPrice(asset);
    console.log(`  ${asset} = $${initialPrice.price}`);

    const oracle = await FastPriceOracle.deploy(
      `${asset} / USD Fast Median`,
      initialPrice.price8
    );
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    oracleAddresses[asset] = oracleAddress;

    // Grant update role to the settlement key if different from deployer
    if (
      settlementAddress &&
      settlementAddress.toLowerCase() !== deployer.address.toLowerCase()
    ) {
      const updTx = await oracle.setUpdater(settlementAddress);
      await updTx.wait();
      console.log(`  ${asset} oracle updater → ${settlementAddress}`);
    }

    // Register asset + start first round
    const addTx = await predictionMarket.addAsset(asset, oracleAddress);
    await addTx.wait();
    console.log(`  ${asset} ready at oracle ${oracleAddress}`);
  }

  console.log("\n=== Deployment complete ===");
  console.log("PredictionMarket :", predictionMarketAddress);
  console.log("TUSDC collateral :", tusdcAddress);
  console.log("FastPriceOracles :", oracleAddresses);
  console.log("Network          :", (await ethers.provider.getNetwork()).name);

  console.log("\n=== Copy these lines into your .env ===");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${predictionMarketAddress}`);
  console.log(`NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS=${tusdcAddress}`);
  console.log(`NEXT_PUBLIC_TUSDC_ADDRESS=${tusdcAddress}`);
  console.log(`FAST_ORACLE_ADDRESSES=${JSON.stringify(oracleAddresses)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
