const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Tusdc with the same Fuji account Hardhat uses from .env (PRIVATE_KEY, or SETTLEMENT_PRIVATE_KEY if PRIVATE_KEY is unset).");
  console.log("Deployer address:", deployer.address);

  const Tusdc = await hre.ethers.getContractFactory("Tusdc");
  const token = await Tusdc.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  const name = await token.name();
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  const supply = await token.totalSupply();

  console.log("\n--- Tusdc deployed (Avalanche Fuji C-Chain) ---");
  console.log("Contract address:", address);
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals.toString());
  console.log("Total supply (raw):", supply.toString());
  console.log("\nAdd to MetaMask:");
  console.log("  Network: Avalanche Fuji (chainId 43113)");
  console.log("  Token contract address:", address);
  console.log("  Token symbol:", symbol);
  console.log("  Token decimal:", decimals.toString());
  console.log("\nSnowtrace:", `https://testnet.snowtrace.io/token/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
