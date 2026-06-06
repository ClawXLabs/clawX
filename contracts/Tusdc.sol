// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Tusdc — test ERC-20 on Avalanche Fuji (C-Chain)
/// @notice Fixed supply 5,000,000. Name "Tusdc", symbol TUSDC, 6 decimals (USDC-style). EIP-2612 permit for gasless approve flows.
contract Tusdc is ERC20, ERC20Permit, Ownable {
    constructor() ERC20("Tusdc", "TUSDC") ERC20Permit("Tusdc") Ownable(msg.sender) {
        _mint(msg.sender, 5_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Optional faucet-style mint for testnet; remove in production.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
