import { ethers } from 'ethers';

interface TradeAuthParams {
  chainId: number;
  contractAddress: string;
  trader: string;
  action: string;
  roundId: number;
  isUp: boolean;
  amount: string;
  nonce: string;
  deadline: number;
}

interface BatchClaimAuthParams {
  chainId: number;
  contractAddress: string;
  trader: string;
  roundIds: number[];
  nonce: string;
  deadline: number;
}

/**
 * Canonical text users sign for relayer-submitted trades (gas paid by settlement key).
 * Must match server verification in pages/api/trade exactly.
 */
export function buildTradeAuthMessage({
  chainId,
  contractAddress,
  trader,
  action,
  roundId,
  isUp,
  amount,
  nonce,
  deadline,
}: TradeAuthParams): string {
  const market = ethers.getAddress(contractAddress).toLowerCase();
  const user = ethers.getAddress(trader).toLowerCase();
  const upStr = action === 'claim' ? '' : String(Boolean(isUp));
  const amtStr = action === 'claim' ? '0' : String(amount);
  return [
    'AvaxClawTrade',
    String(chainId),
    market,
    user,
    action,
    String(roundId),
    upStr,
    amtStr,
    nonce,
    String(deadline),
  ].join('\n');
}

/**
 * Single signature authorising the relayer to claim all listed rounds on behalf of the user.
 * roundIds must be sorted ascending to keep the message deterministic.
 */
export function buildBatchClaimAuthMessage({
  chainId,
  contractAddress,
  trader,
  roundIds,
  nonce,
  deadline,
}: BatchClaimAuthParams): string {
  const market = ethers.getAddress(contractAddress).toLowerCase();
  const user = ethers.getAddress(trader).toLowerCase();
  const sorted = [...roundIds].sort((a, b) => a - b);
  return [
    'AvaxClawBatchClaim',
    String(chainId),
    market,
    user,
    sorted.join(','),
    nonce,
    String(deadline),
  ].join('\n');
}
