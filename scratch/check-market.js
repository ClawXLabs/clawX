const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const privateKey = process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log('Wallet Address:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('AVAX Balance:', ethers.formatEther(balance));
}

main().catch(console.error);
