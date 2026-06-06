export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x378FBf873fF77a44ae9aac0B5427804A9Ec1Bf1d";
/** Collateral token — TUSDC (6 decimals) since the new market deploy */
export const COLLATERAL_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "0xd27D2AB610714E262E64c7BFA789769A98A5DeB1";
/** Test ERC-20 (Tusdc / TUSDC, 6 decimals) */
export const TUSDC_ADDRESS =
  process.env.NEXT_PUBLIC_TUSDC_ADDRESS || "0xd27D2AB610714E262E64c7BFA789769A98A5DeB1";
/** Public Fuji RPC for read-only client pages (leaderboard) */
export const FUJI_RPC_PUBLIC =
  process.env.NEXT_PUBLIC_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

export const CONTRACT_ABI = [
  "function MARKET_DURATION() external view returns (uint256)",
  "function collateralToken() external view returns (address)",
  "function virtualLiquidityPerSide() external view returns (uint256)",
  "function getAssetCount() external view returns (uint256)",
  "function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)",
  "function getAssetRoundIds(uint256 assetId) external view returns (uint256[] memory)",
  "function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)",
  "function getUserPosition(uint256 roundId, address user) external view returns (uint256 upShares, uint256 downShares, bool claimed)",
  "function getCurrentPrice(uint256 assetId) external view returns (uint256)",
  "function quoteBuy(uint256 roundId, bool isUp, uint256 amountIn) external view returns (uint256)",
  "function quoteSell(uint256 roundId, bool isUp, uint256 sharesIn) external view returns (uint256)",
  "function buyPosition(uint256 roundId, bool isUp, uint256 amountIn) external returns (uint256 sharesOut)",
  "function buyPositionFor(address buyer,uint256 roundId,bool isUp,uint256 amountIn) external returns (uint256 sharesOut)",
  "function sellPosition(uint256 roundId, bool isUp, uint256 sharesIn) external returns (uint256 amountOut)",
  "function sellPositionFor(address seller,uint256 roundId,bool isUp,uint256 sharesIn) external returns (uint256 amountOut)",
  "function resolveRound(uint256 roundId) external returns (uint256 nextRoundId)",
  "function resolveCurrentRound(uint256 assetId) external returns (uint256 nextRoundId)",
  "function resolveExpiredRounds() external",
  "function resolveExpiredRoundsWithPrices(uint256[] calldata assetIds, uint256[] calldata endPrices) external",
  "function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData)",
  "function performUpkeep(bytes calldata) external",
  "function claimWinnings(uint256 roundId) external returns (uint256 winnings)",
  "function claimWinningsFor(address claimer,uint256 roundId) external returns (uint256 winnings)"
] as const;

export const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function nonces(address owner) external view returns (uint256)"
] as const;

// Fuji testnet Chainlink Price Feed addresses
// Verified working addresses on Fuji testnet
export const PRICE_FEEDS: Record<string, string> = {
  BTC: "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a", // BTC/USD - ✅ Working on Fuji
  ETH: "0x86d67c3D38D2bCeE722E601025C25a575021c6EA", // ETH/USD - Fuji testnet
  AVAX: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD", // AVAX/USD - Fuji testnet
  BNB: "0x5576815a38A3706f37bf815b261cCc7cCA77e975", // BNB/USD - Fuji testnet
  NEAR: "0xf988e4374165a081cd4647a5A9f46F158B10cF3D"  // NEAR/USD - Fuji testnet
};
