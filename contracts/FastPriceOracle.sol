// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FastPriceOracle is Ownable {
    uint8 public constant decimals = 8;

    string public description;
    uint256 public version = 1;
    address public updater;

    uint80 private latestRoundId;
    int256 private latestAnswer;
    uint256 private latestUpdatedAt;

    event UpdaterSet(address indexed updater);
    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    constructor(string memory _description, int256 initialAnswer) Ownable(msg.sender) {
        require(initialAnswer > 0, "Invalid initial answer");
        description = _description;
        updater = msg.sender;
        emit UpdaterSet(msg.sender);
        _updateAnswer(initialAnswer);
    }

    modifier onlyUpdaterOrOwner() {
        require(msg.sender == owner() || msg.sender == updater, "Not oracle updater");
        _;
    }

    function setUpdater(address newUpdater) external onlyOwner {
        require(newUpdater != address(0), "Invalid updater");
        updater = newUpdater;
        emit UpdaterSet(newUpdater);
    }

    function updateAnswer(int256 newAnswer) external onlyUpdaterOrOwner {
        require(newAnswer > 0, "Invalid answer");
        _updateAnswer(newAnswer);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (latestRoundId, latestAnswer, latestUpdatedAt, latestUpdatedAt, latestRoundId);
    }

    function getRoundData(uint80 requestedRoundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        require(requestedRoundId == latestRoundId, "Round not available");
        return (latestRoundId, latestAnswer, latestUpdatedAt, latestUpdatedAt, latestRoundId);
    }

    function _updateAnswer(int256 newAnswer) private {
        latestRoundId++;
        latestAnswer = newAnswer;
        latestUpdatedAt = block.timestamp;
        emit AnswerUpdated(newAnswer, latestRoundId, block.timestamp);
    }
}
