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
