const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const privateKey = process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const relayer = new ethers.Wallet(privateKey, provider);

  const market = new ethers.Contract(
    contractAddress,
    [
      'function buyPositionFor(address buyer,uint256 roundId,bool isUp,uint256 amountIn) returns (uint256)',
      'function collateralToken() view returns (address)',
      'function getAssetCount() external view returns (uint256)',
      'function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)',
      'function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)',
    ],
    relayer
  );

  const buyer = '0x6734738d6ab16dff858ffca33d31918370d482e0';
  const collateralAddr = await market.collateralToken();
  const token = new ethers.Contract(collateralAddr, [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
  ], provider);

  const [bal, allowance] = await Promise.all([
    token.balanceOf(buyer),
    token.allowance(buyer, contractAddress),
  ]);

  console.log('Buyer Bal:', ethers.formatUnits(bal, 6), 'TUSDC');
  console.log('Buyer Allowance:', ethers.formatUnits(allowance, 6), 'TUSDC');

  const count = Number(await market.getAssetCount());
  for (let assetId = 0; assetId < count; assetId++) {
    const asset = await market.getAsset(assetId);
    if (!asset.enabled) continue;
    const roundId = Number(asset.currentRoundId);
    console.log(`Asset ${asset.symbol} Round ID: ${roundId}`);

    const round = await market.getRoundInfo(roundId);
    console.log(`Round endTime: ${round.endTime.toString()} (now: ${Math.floor(Date.now() / 1000)})`);

    const amountIn = ethers.parseUnits('25', 6);
    try {
      console.log(`Simulating buyPositionFor(${buyer}, ${roundId}, true, ${amountIn.toString()})`);
      await market.buyPositionFor.staticCall(buyer, roundId, true, amountIn);
      console.log('Simulation SUCCEEDED!');
    } catch (e) {
      console.error('Simulation FAILED:', e.message || e);
    }
  }
}

main().catch(console.error);
