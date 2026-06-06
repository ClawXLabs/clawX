import { ethers } from 'ethers';

/** One-time delegation users sign when starting an agent (runner submits trades with this proof). */
export function buildAgentDelegateMessage({
  chainId,
  contractAddress,
  trader,
  deadline,
  maxAmountRaw,
}) {
  const market = ethers.getAddress(contractAddress).toLowerCase();
  const user = ethers.getAddress(trader).toLowerCase();
  return [
    'AvaxClawAgentDelegate',
    String(chainId),
    market,
    user,
    String(deadline),
    String(maxAmountRaw),
  ].join('\n');
}

export function verifyAgentDelegate({
  chainId,
  contractAddress,
  trader,
  deadline,
  maxAmountRaw,
  signature,
}) {
  if (!signature || !Number.isFinite(deadline) || deadline < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'Delegation expired or missing' };
  }
  const message = buildAgentDelegateMessage({
    chainId,
    contractAddress,
    trader,
    deadline,
    maxAmountRaw,
  });
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return { ok: false, error: 'Invalid delegation signature' };
  }
  if (recovered.toLowerCase() !== ethers.getAddress(trader).toLowerCase()) {
    return { ok: false, error: 'Delegation signer mismatch' };
  }
  return { ok: true };
}
