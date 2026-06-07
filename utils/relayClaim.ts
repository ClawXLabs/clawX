import { BrowserProvider, Contract } from 'ethers';
import { buildTradeAuthMessage } from './tradeAuth';

interface RelayClaimParams {
  provider: BrowserProvider;
  account: string;
  contract: Contract;
  roundId: number;
}

/** User signs; relayer (SETTLEMENT_PRIVATE_KEY) pays AVAX gas via claimWinningsFor. */
export async function relayClaimWinnings({
  provider,
  account,
  contract,
  roundId,
}: RelayClaimParams): Promise<{ hash: string; blockNumber?: number }> {
  if (!provider || !account || !contract) {
    throw new Error('Wallet not connected');
  }
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const marketAddress = await contract.getAddress();
  const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const authMessage = buildTradeAuthMessage({
    chainId,
    contractAddress: marketAddress,
    trader: account,
    action: 'claim',
    roundId: Number(roundId),
    isUp: false,
    amount: '0',
    nonce,
    deadline,
  });
  const signature = await signer.signMessage(authMessage);
  const res = await fetch('/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claim',
      trader: account,
      roundId: Number(roundId),
      deadline,
      nonce,
      signature,
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(result.error || 'Relayer claim failed');
  }
  const receipt = await provider.waitForTransaction(result.hash);
  return { hash: result.hash, blockNumber: receipt?.blockNumber };
}
