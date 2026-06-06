const { ethers } = require("hardhat");

async function main() {
  console.log("Testing Chainlink Price Feeds on Fuji testnet...");
  
  const provider = ethers.provider;
  
  // Price feed addresses to test
  const priceFeeds = {
    BTC: "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a", // BTC/USD - Confirmed Fuji address
    ETH: "0x86d67BFb4082A76c816F9D6D3c575C4B3b4A7b4b", // ETH/USD - Placeholder (needs verification)
    AVAX: "0x5498BB8619417C5305E954524553E60A08785D71", // AVAX/USD - Placeholder (needs verification)
    SOL: "0x0a77230d17318075983913bc2145db16c7366156", // SOL/USD - Mainnet address (may not work on Fuji)
    XRP: "0x9326BFA02ADD2366b30bacB125260Af641031331"  // XRP/USD - Mainnet address (may not work on Fuji)
  };

  // ABI for Chainlink price feed
  const aggregatorV3InterfaceABI = [
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() external view returns (uint8)",
    "function description() external view returns (string memory)"
  ];

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
      console.log(`   Latest Price: ${ethers.utils.formatUnits(roundData.answer, decimals)}`);
      console.log(`   Updated: ${new Date(roundData.updatedAt.toNumber() * 1000).toLocaleString()}`);
      
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
