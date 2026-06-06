const { ethers } = require("ethers");

async function main() {
  console.log("Testing Chainlink Price Feeds on Fuji testnet...");
  
  // Connect to Fuji testnet
  const provider = new ethers.JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc");
  
  // Price feed addresses to test - Fuji testnet addresses
  const priceFeeds = {
    BTC: "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a", // BTC/USD - Working Fuji address
    ETH: "0x86d67c3D38D2bCeE722E601025C25a575021c6EA", // ETH/USD - Fuji testnet
    AVAX: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD", // AVAX/USD - Fuji testnet
    BNB: "0x5576815a38A3706f37bf815b261cCc7cCA77e975", // BNB/USD - Fuji testnet
    NEAR: "0xf988e4374165a081cd4647a5A9f46F158B10cF3D"  // NEAR/USD - Fuji testnet
  };

  // Fix address checksums
  const fixedAddresses = {};
  for (const [asset, address] of Object.entries(priceFeeds)) {
    try {
      // Skip ENS resolution for addresses that start with 0x000...
      if (address.startsWith('0x000')) {
        fixedAddresses[asset] = address;
      } else {
        fixedAddresses[asset] = ethers.getAddress(address);
      }
    } catch (error) {
      console.log(`⚠️  Invalid address format for ${asset}: ${address}`);
      fixedAddresses[asset] = address; // Keep original if getAddress fails
    }
  }

  // ABI for Chainlink price feed
  const aggregatorV3InterfaceABI = [
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() external view returns (uint8)",
    "function description() external view returns (string memory)"
  ];

  console.log(`Connected to network: ${(await provider.getNetwork()).name} (Chain ID: ${(await provider.getNetwork()).chainId})`);

  for (const [asset, address] of Object.entries(priceFeeds)) {
    try {
      console.log(`\nTesting ${asset}/USD price feed at ${address}...`);
      
      const priceFeed = new ethers.Contract(address, aggregatorV3InterfaceABI, provider);
      
      // Test basic functions
      const decimals = await priceFeed.decimals();
      const description = await priceFeed.description();
      const roundData = await priceFeed.latestRoundData();
      
      console.log(`✅ ${asset} Price Feed Working:`);
      console.log(`   Description: ${description}`);
      console.log(`   Decimals: ${decimals}`);
      console.log(`   Latest Price: ${ethers.formatUnits(roundData.answer, decimals)}`);
      console.log(`   Updated: ${new Date(Number(roundData.updatedAt) * 1000).toLocaleString()}`);
      console.log(`   Round ID: ${roundData.roundId}`);
      
    } catch (error) {
      console.log(`❌ ${asset} Price Feed Failed: ${error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
