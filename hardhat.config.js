require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

function normalizePrivateKey(value) {
  if (!value) return "";
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) return "";
  if (/^0x0{64}$/.test(prefixed)) return "";
  return prefixed;
}

// Same wallet for all Fuji deploys: prefer PRIVATE_KEY, else SETTLEMENT_PRIVATE_KEY (one key in .env is enough).
const PRIVATE_KEY =
  normalizePrivateKey(process.env.PRIVATE_KEY) ||
  normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY) ||
  "0x" + "0".repeat(64);
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    fuji: {
      url: FUJI_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 43113
    }
  },
  etherscan: {
    apiKey: {
      avalancheFuji: process.env.AVALANCHE_API_KEY || ""
    }
  }
};
