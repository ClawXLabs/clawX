import { BrowserProvider, Contract } from 'ethers';
import { buildTradeAuthMessage, buildBatchClaimAuthMessage } from './tradeAuth';

interface RelayClaimParams {
  provider: BrowserProvider;
  account: string;
  contract: Contract;
  roundId: number;
}

export interface BatchClaimResult {
  roundId: number;
  ok: boolean;
  hash?: string;
  error?: string;
}

interface RelayClaimAllParams {
  provider: BrowserProvider;
  account: string;
  contract: Contract;
  roundIds: number[];
  onProgress?: (done: number, total: number, roundId: number, ok: boolean) => void;
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

/**
 * User signs one message; relayer executes claimWinningsFor for every roundId sequentially.
 * onProgress fires after each round resolves so the UI can show progress.
 */
export async function relayClaimAll({
  provider,
  account,
  contract,
  roundIds,
  onProgress,
}: RelayClaimAllParams): Promise<BatchClaimResult[]> {
  if (!provider || !account || !contract) throw new Error('Wallet not connected');
  if (!roundIds.length) return [];

  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const marketAddress = await contract.getAddress();
  const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const authMessage = buildBatchClaimAuthMessage({
    chainId,
    contractAddress: marketAddress,
    trader: account,
    roundIds,
    nonce,
    deadline,
  });

  const signature = await signer.signMessage(authMessage);

  const res = await fetch('/api/claim-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trader: account, roundIds, deadline, nonce, signature }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Batch claim failed');

  const results: BatchClaimResult[] = data.results || [];

  // Wait for confirmations in parallel and report progress
  const settled = await Promise.allSettled(
    results.map(async (r, i) => {
      if (r.ok && r.hash) {
        await provider.waitForTransaction(r.hash);
      }
      onProgress?.(i + 1, results.length, r.roundId, r.ok);
      return r;
    })
  );

  return settled.map((s) => (s.status === 'fulfilled' ? s.value : { roundId: 0, ok: false, error: 'Unknown' }));
}
