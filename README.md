# AVAX Prediction Markets:

A short-term prediction market platform built on Avalanche Fuji testnet, allowing users to predict whether cryptocurrency prices will go up or down in 5-minute intervals.

## Features

- **5 Markets**: BTC, ETH, AVAX, SOL, XRP up/down predictions
- **5-minute intervals**: Short-term prediction markets
- **Chainlink Oracle Integration**: Real-time price feeds
- **AMM Model**: Automated market making for liquidity
- **Trading Charts**: Interactive price charts similar to Polymarket
- **Smart Contract Based**: Secure and transparent on-chain resolution

## Architecture

### Smart Contracts
- `PredictionMarket.sol`: Main contract handling market creation, position taking, and resolution
- Chainlink Price Feed integration for real-time price data
- AMM-based pool system for UP/DOWN positions

### Frontend
- Next.js with Tailwind CSS
- Interactive trading charts using Recharts
- Real-time market updates
- Wallet connectivity via MetaMask

## Setup Instructions

### 1. Environment Setup
```bash
# Clone the repository
git clone <repository-url>
cd avax-prediction-market

# Install dependencies
npm install
```

### 2. Environment Configuration
```bash
# Copy environment file
cp .env.example .env

# Edit .env with your configuration
PRIVATE_KEY=your_private_key_here
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
AVALANCHE_API_KEY=your_snowtrace_api_key_here
```

### 3. Deploy Smart Contracts
```bash
# Compile contracts
npm run compile

# Deploy to Fuji testnet
npm run deploy
```

### 4. Update Contract Address
After deployment, update the contract address in `utils/contract.js`:
```javascript
export const CONTRACT_ADDRESS = "0xYourDeployedContractAddress";
```

### 5. Update Chainlink Price Feeds
Update the Chainlink price feed addresses in `utils/contract.js` with actual Fuji testnet addresses.

### 6. Run Frontend
```bash
npm run dev
```

Visit `http://localhost:3000` to access the application.

## How It Works

1. **Market Creation**: Each market runs for exactly 5 minutes
2. **Position Taking**: Users can bet UP or DOWN with AVAX tokens
3. **Price Determination**: Starting price is captured at market creation, ending price at resolution
4. **Resolution**: Markets resolve automatically after 5 minutes based on price change
5. **Winnings**: Winners can claim their share of the total pool

## Smart Contract Functions

### Core Functions
- `createMarket(string _asset, address _priceFeedAddress)`: Creates a new 5-minute market
- `takePosition(uint256 _marketId, bool _isUp, uint256 _amount)`: Takes a position in a market
- `resolveMarket(uint256 _marketId)`: Resolves a market after time expires
- `claimWinnings(uint256 _marketId)`: Claims winnings for winning positions

### View Functions
- `getMarketInfo(uint256 _marketId)`: Returns market information
- `getUserPosition(uint256 _marketId, address _user)`: Returns user's positions
- `getCurrentPrice(address _priceFeedAddress)`: Returns current price from Chainlink

## Market Mechanics

- **Duration**: Exactly 5 minutes per market
- **Resolution**: UP wins if price increases, DOWN wins if price decreases or stays same
- **Payout**: Winners share the total pool proportionally to their position size
- **Fees**: No fees in this simple AMM model

## Technical Stack

- **Blockchain**: Avalanche Fuji Testnet (C-Chain)
- **Smart Contracts**: Solidity 0.8.19, Hardhat
- **Price Feeds**: Chainlink Network
- **Frontend**: Next.js, React, Tailwind CSS
- **Charts**: Recharts
- **Web3**: Ethers.js

## Future Enhancements

- Multiple time frame markets (1m, 15m, 1h)
- Liquidity provider rewards
- Market creator fees
- Advanced charting features
- Mobile app
- Mainnet deployment

## Security Considerations

- All contracts use OpenZeppelin libraries for security
- Reentrancy protection on critical functions
- Proper access control for market creation
- Price feed validation and fallback mechanisms

## License

MIT License
