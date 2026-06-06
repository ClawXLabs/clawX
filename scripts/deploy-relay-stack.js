/**
 * One-shot Fuji deploy: Tusdc (EIP-2612 permit) + PredictionMarket + FastPriceOracle per asset.
 * Relayer gas for trades: set NEXT_PUBLIC_TRADE_RELAY=true after; SETTLEMENT_PRIVATE_KEY pays gas.
 *
 *   npx hardhat run scripts/deploy-relay-stack.js --network fuji
 *
 * Requires PRIVATE_KEY (or SETTLEMENT_PRIVATE_KEY) with Fuji AVAX for gas.
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
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("AVAX:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const virtualLiquidity = ethers.parseUnits("1000", 6);

  const Tusdc = await ethers.getContractFactory("Tusdc");
  const tusdc = await Tusdc.deploy();
  await tusdc.waitForDeployment();
  const tusdcAddress = await tusdc.getAddress();
  console.log("\nTusdc (permit):", tusdcAddress);

  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy(tusdcAddress, virtualLiquidity);
  await predictionMarket.waitForDeployment();
  const predictionMarketAddress = await predictionMarket.getAddress();
  console.log("PredictionMarket:", predictionMarketAddress);

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
    console.log("Settlement operator:", settlementAddress);
  } else {
    console.log("Settlement operator: deployer (same key)");
  }

  const assets = ["AVAX", "BNB", "BTC", "ETH", "NEAR"];
  const FastPriceOracle = await ethers.getContractFactory("FastPriceOracle");
  const oracleAddresses = {};

  for (const asset of assets) {
    const initialPrice = await fetchFastPrice(asset);
    const oracle = await FastPriceOracle.deploy(
      `${asset} / USD Fast Median`,
      initialPrice.price8
    );
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    oracleAddresses[asset] = oracleAddress;

    if (
      settlementAddress &&
      settlementAddress.toLowerCase() !== deployer.address.toLowerCase()
    ) {
      const updTx = await oracle.setUpdater(settlementAddress);
      await updTx.wait();
    }

    const addTx = await predictionMarket.addAsset(asset, oracleAddress);
    await addTx.wait();
    console.log(`  ${asset} -> ${oracleAddress}`);
  }

  console.log("\n=== .env (copy) ===");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${predictionMarketAddress}`);
  console.log(`NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS=${tusdcAddress}`);
  console.log(`NEXT_PUBLIC_TUSDC_ADDRESS=${tusdcAddress}`);
  console.log(`FAST_ORACLE_ADDRESSES=${JSON.stringify(oracleAddresses)}`);
  console.log(`NEXT_PUBLIC_TRADE_RELAY=true`);
  console.log("\nFaucet: Tusdc owner is deployer — use FAUCET_PRIVATE_KEY or same key to mint test TUSDC.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
