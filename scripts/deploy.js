const { ethers } = require("hardhat");
const { fetchFastPrice } = require("../utils/fastPrice");

function normalizePrivateKey(value) {
  if (!value) return "";
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : "";
}

async function main() {
  console.log("Deploying AVAX Claw contracts...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const TestTradeToken = await ethers.getContractFactory("TestTradeToken");
  const tradeToken = await TestTradeToken.deploy();
  await tradeToken.waitForDeployment();
  const tradeTokenAddress = await tradeToken.getAddress();
  console.log("TestTradeToken deployed to:", tradeTokenAddress);

  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy(
    tradeTokenAddress,
    ethers.parseEther("1000")
  );
  await predictionMarket.waitForDeployment();
  const predictionMarketAddress = await predictionMarket.getAddress();

  console.log("PredictionMarket deployed to:", predictionMarketAddress);

  const assets = ["AVAX", "BNB", "BTC", "ETH", "NEAR"];
  const FastPriceOracle = await ethers.getContractFactory("FastPriceOracle");
  const oracleAddresses = {};
  const settlementKey = normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY);
  const settlementAddress = settlementKey ? new ethers.Wallet(settlementKey).address : "";

  if (settlementAddress && settlementAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    const operatorTx = await predictionMarket.setSettlementOperator(settlementAddress);
    await operatorTx.wait();
    console.log("Settlement operator set to:", settlementAddress);
  }

  for (const asset of assets) {
    console.log(`Fetching initial ${asset} median price...`);
    const initialPrice = await fetchFastPrice(asset);
    console.log(`${asset} initial median: $${initialPrice.price}`);

    const oracle = await FastPriceOracle.deploy(`${asset} / USD Fast Median`, initialPrice.price8);
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    oracleAddresses[asset] = oracleAddress;

    if (settlementAddress && settlementAddress.toLowerCase() !== deployer.address.toLowerCase()) {
      const updaterTx = await oracle.setUpdater(settlementAddress);
      await updaterTx.wait();
      console.log(`${asset} oracle updater set to ${settlementAddress}`);
    }

    console.log(`Adding ${asset} fast oracle and starting first round...`);
    const tx = await predictionMarket.addAsset(asset, oracleAddress);
    await tx.wait();
    console.log(`${asset} ready at oracle ${oracleAddress}`);
  }

  console.log("\nDeployment Summary:");
  console.log("PredictionMarket:", predictionMarketAddress);
  console.log("TestTradeToken:", tradeTokenAddress);
  console.log("FastPriceOracles:", oracleAddresses);
  console.log("Owner:", deployer.address);
  console.log("Network:", await ethers.provider.getNetwork());
  console.log("\nAdd these to .env:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${predictionMarketAddress}`);
  console.log(`NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS=${tradeTokenAddress}`);
  console.log(`FAST_ORACLE_ADDRESSES=${JSON.stringify(oracleAddresses)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
