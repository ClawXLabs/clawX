// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MARKET_DURATION = 5 minutes;
    uint256 public constant BPS = 10_000;
    uint256 public constant SELL_FEE_BPS = 30;

    IERC20 public immutable collateralToken;
    uint256 public immutable virtualLiquidityPerSide;
    address public settlementOperator;

    struct Asset {
        string symbol;
        AggregatorV3Interface priceFeed;
        uint256 currentRoundId;
        bool enabled;
    }

    struct Position {
        uint256 upShares;
        uint256 downShares;
        bool claimed;
    }

    struct Round {
        uint256 assetId;
        uint256 roundNumber;
        uint256 startTime;
        uint256 endTime;
        uint256 startPrice;
        uint256 endPrice;
        bool resolved;
        bool upWins;
        uint256 upPool;
        uint256 downPool;
        uint256 upShares;
        uint256 downShares;
        uint256 collateralPool;
        mapping(address => Position) positions;
    }

    Asset[] private assets;
    mapping(uint256 => Round) private rounds;
    mapping(uint256 => uint256[]) private assetRoundIds;

    uint256 public roundCounter;

    event AssetAdded(uint256 indexed assetId, string symbol, address indexed priceFeed);
    event RoundStarted(
        uint256 indexed roundId,
        uint256 indexed assetId,
        string symbol,
        uint256 startPrice,
        uint256 startTime,
        uint256 endTime
    );
    event PositionBought(
        uint256 indexed roundId,
        address indexed user,
        bool isUp,
        uint256 amountIn,
        uint256 sharesOut
    );
    event PositionSold(
        uint256 indexed roundId,
        address indexed user,
        bool isUp,
        uint256 sharesIn,
        uint256 amountOut
    );
    event RoundResolved(
        uint256 indexed roundId,
        uint256 indexed assetId,
        uint256 startPrice,
        uint256 endPrice,
        bool upWins
    );
    event SettlementOperatorSet(address indexed settlementOperator);
    event WinningsClaimed(uint256 indexed roundId, address indexed user, uint256 amount);

    constructor(IERC20 _collateralToken, uint256 _virtualLiquidityPerSide) Ownable(msg.sender) {
        require(address(_collateralToken) != address(0), "Invalid collateral");
        require(_virtualLiquidityPerSide > 0, "Invalid liquidity");
        collateralToken = _collateralToken;
        virtualLiquidityPerSide = _virtualLiquidityPerSide;
        settlementOperator = msg.sender;
        emit SettlementOperatorSet(msg.sender);
    }

    modifier onlySettlementOperator() {
        require(msg.sender == owner() || msg.sender == settlementOperator, "Not settlement operator");
        _;
    }

    function setSettlementOperator(address newSettlementOperator) external onlyOwner {
        require(newSettlementOperator != address(0), "Invalid settlement operator");
        settlementOperator = newSettlementOperator;
        emit SettlementOperatorSet(newSettlementOperator);
    }

    function addAsset(string calldata symbol, address priceFeedAddress) external onlyOwner returns (uint256 assetId) {
        require(bytes(symbol).length > 0, "Invalid symbol");
        require(priceFeedAddress != address(0), "Invalid feed");

        assets.push(
            Asset({
                symbol: symbol,
                priceFeed: AggregatorV3Interface(priceFeedAddress),
                currentRoundId: 0,
                enabled: true
            })
        );

        assetId = assets.length - 1;
        emit AssetAdded(assetId, symbol, priceFeedAddress);
        _startRound(assetId, _readPrice(AggregatorV3Interface(priceFeedAddress)));
    }

    function buyPosition(uint256 roundId, bool isUp, uint256 amountIn) external nonReentrant returns (uint256 sharesOut) {
        return _buyPosition(msg.sender, roundId, isUp, amountIn);
    }

    /// @notice Same as buyPosition but collateral is pulled from `buyer`; only settlement operator or owner may call (relayer pays gas).
    function buyPositionFor(address buyer, uint256 roundId, bool isUp, uint256 amountIn)
        external
        nonReentrant
        onlySettlementOperator
        returns (uint256 sharesOut)
    {
        require(buyer != address(0), "Invalid buyer");
        return _buyPosition(buyer, roundId, isUp, amountIn);
    }

    function _buyPosition(address buyer, uint256 roundId, bool isUp, uint256 amountIn) private returns (uint256 sharesOut) {
        Round storage round = rounds[roundId];
        require(round.startTime != 0, "Round missing");
        require(!round.resolved, "Round resolved");
        require(block.timestamp < round.endTime, "Round ended");
        require(amountIn > 0, "Amount required");

        sharesOut = quoteBuy(roundId, isUp, amountIn);
        require(sharesOut > 0, "No shares");

        collateralToken.safeTransferFrom(buyer, address(this), amountIn);

        Position storage position = round.positions[buyer];
        if (isUp) {
            position.upShares += sharesOut;
            round.upShares += sharesOut;
            round.upPool += amountIn;
        } else {
            position.downShares += sharesOut;
            round.downShares += sharesOut;
            round.downPool += amountIn;
        }

        round.collateralPool += amountIn;
        emit PositionBought(roundId, buyer, isUp, amountIn, sharesOut);
    }

    function sellPosition(uint256 roundId, bool isUp, uint256 sharesIn) external nonReentrant returns (uint256 amountOut) {
        return _sellPosition(msg.sender, roundId, isUp, sharesIn);
    }

    function sellPositionFor(address seller, uint256 roundId, bool isUp, uint256 sharesIn)
        external
        nonReentrant
        onlySettlementOperator
        returns (uint256 amountOut)
    {
        require(seller != address(0), "Invalid seller");
        return _sellPosition(seller, roundId, isUp, sharesIn);
    }

    function _sellPosition(address seller, uint256 roundId, bool isUp, uint256 sharesIn) private returns (uint256 amountOut) {
        Round storage round = rounds[roundId];
        require(round.startTime != 0, "Round missing");
        require(!round.resolved, "Round resolved");
        require(block.timestamp < round.endTime, "Round ended");
        require(sharesIn > 0, "Shares required");

        Position storage position = round.positions[seller];
        if (isUp) {
            require(position.upShares >= sharesIn, "Not enough UP");
            amountOut = quoteSell(roundId, true, sharesIn);
            position.upShares -= sharesIn;
            round.upShares -= sharesIn;
            round.upPool = amountOut >= round.upPool ? 0 : round.upPool - amountOut;
        } else {
            require(position.downShares >= sharesIn, "Not enough DOWN");
            amountOut = quoteSell(roundId, false, sharesIn);
            position.downShares -= sharesIn;
            round.downShares -= sharesIn;
            round.downPool = amountOut >= round.downPool ? 0 : round.downPool - amountOut;
        }

        require(amountOut <= round.collateralPool, "Insufficient liquidity");
        round.collateralPool -= amountOut;
        collateralToken.safeTransfer(seller, amountOut);

        emit PositionSold(roundId, seller, isUp, sharesIn, amountOut);
    }

    function resolveRound(uint256 roundId) public returns (uint256 nextRoundId) {
        Round storage round = rounds[roundId];
        require(round.startTime != 0, "Round missing");
        require(block.timestamp >= round.endTime, "Round live");
        require(!round.resolved, "Already resolved");

        uint256 endPrice = _readPrice(assets[round.assetId].priceFeed);
        nextRoundId = _resolveRound(roundId, endPrice);
    }

    function _resolveRound(uint256 roundId, uint256 endPrice) private returns (uint256 nextRoundId) {
        Round storage round = rounds[roundId];
        require(round.startTime != 0, "Round missing");
        require(block.timestamp >= round.endTime, "Round live");
        require(!round.resolved, "Already resolved");
        require(endPrice > 0, "Invalid end price");

        round.endPrice = endPrice;
        round.upWins = endPrice > round.startPrice;
        round.resolved = true;

        emit RoundResolved(roundId, round.assetId, round.startPrice, endPrice, round.upWins);
        nextRoundId = _startRound(round.assetId, endPrice);
    }

    function resolveCurrentRound(uint256 assetId) external returns (uint256 nextRoundId) {
        require(assetId < assets.length, "Invalid asset");
        nextRoundId = resolveRound(assets[assetId].currentRoundId);
    }

    function resolveExpiredRounds() external {
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 roundId = assets[i].currentRoundId;
            if (roundId != 0 && !rounds[roundId].resolved && block.timestamp >= rounds[roundId].endTime) {
                resolveRound(roundId);
            }
        }
    }

    function resolveExpiredRoundsWithPrices(
        uint256[] calldata assetIds,
        uint256[] calldata endPrices
    ) external onlySettlementOperator {
        require(assetIds.length == endPrices.length, "Length mismatch");

        bool resolvedAny = false;
        for (uint256 i = 0; i < assetIds.length; i++) {
            uint256 assetId = assetIds[i];
            require(assetId < assets.length, "Invalid asset");

            uint256 roundId = assets[assetId].currentRoundId;
            if (roundId != 0 && !rounds[roundId].resolved && block.timestamp >= rounds[roundId].endTime) {
                _resolveRound(roundId, endPrices[i]);
                resolvedAny = true;
            }
        }

        require(resolvedAny, "No expired rounds");
    }

    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData) {
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 roundId = assets[i].currentRoundId;
            if (roundId != 0 && !rounds[roundId].resolved && block.timestamp >= rounds[roundId].endTime) {
                return (true, "");
            }
        }

        return (false, "");
    }

    function performUpkeep(bytes calldata) external {
        bool resolvedAny = false;

        for (uint256 i = 0; i < assets.length; i++) {
            uint256 roundId = assets[i].currentRoundId;
            if (roundId != 0 && !rounds[roundId].resolved && block.timestamp >= rounds[roundId].endTime) {
                resolveRound(roundId);
                resolvedAny = true;
            }
        }

        require(resolvedAny, "No expired rounds");
    }

    function claimWinnings(uint256 roundId) external nonReentrant returns (uint256 winnings) {
        return _claimWinnings(msg.sender, roundId);
    }

    function claimWinningsFor(address claimer, uint256 roundId) external nonReentrant onlySettlementOperator returns (uint256 winnings) {
        require(claimer != address(0), "Invalid claimer");
        return _claimWinnings(claimer, roundId);
    }

    function _claimWinnings(address claimer, uint256 roundId) private returns (uint256 winnings) {
        Round storage round = rounds[roundId];
        require(round.resolved, "Not resolved");

        Position storage position = round.positions[claimer];
        require(!position.claimed, "Already claimed");

        uint256 winningShares = round.upWins ? position.upShares : position.downShares;
        uint256 totalWinningShares = round.upWins ? round.upShares : round.downShares;
        require(winningShares > 0, "No winning shares");
        require(totalWinningShares > 0, "No winners");

        position.claimed = true;
        winnings = (round.collateralPool * winningShares) / totalWinningShares;
        require(winnings > 0, "No winnings");

        collateralToken.safeTransfer(claimer, winnings);
        emit WinningsClaimed(roundId, claimer, winnings);
    }

    function quoteBuy(uint256 roundId, bool isUp, uint256 amountIn) public view returns (uint256) {
        Round storage round = rounds[roundId];
        uint256 oddsBps = _oddsBps(round, isUp);
        return (amountIn * BPS) / oddsBps;
    }

    function quoteSell(uint256 roundId, bool isUp, uint256 sharesIn) public view returns (uint256) {
        Round storage round = rounds[roundId];
        uint256 oddsBps = _oddsBps(round, isUp);
        uint256 gross = (sharesIn * oddsBps) / BPS;
        return (gross * (BPS - SELL_FEE_BPS)) / BPS;
    }

    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    function getAsset(uint256 assetId) external view returns (
        string memory symbol,
        address priceFeed,
        uint256 currentRoundId,
        bool enabled
    ) {
        Asset storage asset = assets[assetId];
        return (asset.symbol, address(asset.priceFeed), asset.currentRoundId, asset.enabled);
    }

    function getAssetRoundIds(uint256 assetId) external view returns (uint256[] memory) {
        return assetRoundIds[assetId];
    }

    function getRoundInfo(uint256 roundId) external view returns (
        uint256 assetId,
        string memory asset,
        uint256 roundNumber,
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        uint256 endPrice,
        bool resolved,
        bool upWins,
        uint256 upPool,
        uint256 downPool,
        uint256 upShares,
        uint256 downShares,
        uint256 collateralPool,
        uint256 currentPrice,
        address priceFeed
    ) {
        Round storage round = rounds[roundId];
        Asset storage assetConfig = assets[round.assetId];
        uint256 livePrice = round.resolved ? round.endPrice : _readPrice(assetConfig.priceFeed);
        return (
            round.assetId,
            assetConfig.symbol,
            round.roundNumber,
            round.startTime,
            round.endTime,
            round.startPrice,
            round.endPrice,
            round.resolved,
            round.upWins,
            round.upPool,
            round.downPool,
            round.upShares,
            round.downShares,
            round.collateralPool,
            livePrice,
            address(assetConfig.priceFeed)
        );
    }

    function getUserPosition(uint256 roundId, address user) external view returns (
        uint256 upShares,
        uint256 downShares,
        bool claimed
    ) {
        Position storage position = rounds[roundId].positions[user];
        return (position.upShares, position.downShares, position.claimed);
    }

    function getCurrentPrice(uint256 assetId) external view returns (uint256) {
        return _readPrice(assets[assetId].priceFeed);
    }

    function _startRound(uint256 assetId, uint256 startPrice) private returns (uint256 roundId) {
        Asset storage asset = assets[assetId];
        require(asset.enabled, "Asset disabled");
        require(startPrice > 0, "Invalid start price");

        roundCounter++;
        roundId = roundCounter;

        Round storage round = rounds[roundId];
        round.assetId = assetId;
        round.roundNumber = assetRoundIds[assetId].length + 1;
        round.startTime = block.timestamp;
        round.endTime = block.timestamp + MARKET_DURATION;
        round.startPrice = startPrice;

        asset.currentRoundId = roundId;
        assetRoundIds[assetId].push(roundId);

        emit RoundStarted(roundId, assetId, asset.symbol, startPrice, round.startTime, round.endTime);
    }

    function _readPrice(AggregatorV3Interface priceFeed) private view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(answer > 0, "Invalid oracle price");
        require(updatedAt > 0, "Stale oracle");
        return uint256(answer);
    }

    function _oddsBps(Round storage round, bool isUp) private view returns (uint256) {
        uint256 upWeight = virtualLiquidityPerSide + round.upPool;
        uint256 downWeight = virtualLiquidityPerSide + round.downPool;
        uint256 total = upWeight + downWeight;
        uint256 odds = ((isUp ? upWeight : downWeight) * BPS) / total;
        if (odds == 0) return 1;
        if (odds >= BPS) return BPS - 1;
        return odds;
    }
}
