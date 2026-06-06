import { ethers } from 'ethers';

export interface PermitResult {
  owner: string;
  spender: string;
  value: string;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

/** EIP-2612 permit signature for OpenZeppelin ERC20Permit (version "1"). */
export async function signErc2612Permit(
  signer: ethers.Signer,
  tokenAddress: string,
  spender: string,
  valueWei: bigint,
  chainId: number
): Promise<PermitResult> {
  const token = new ethers.Contract(
    tokenAddress,
    ['function name() view returns (string)', 'function nonces(address owner) view returns (uint256)'],
    signer
  );
  const name: string = await token.name();
  const owner: string = await signer.getAddress();
  const nonce: bigint = await token.nonces(owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const domain = {
    name,
    version: '1',
    chainId,
    verifyingContract: tokenAddress,
  };
  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };
  const message = {
    owner,
    spender,
    value: valueWei,
    nonce,
    deadline,
  };
  const raw = await signer.signTypedData(domain, types, message);
  const sig = ethers.Signature.from(raw);
  return {
    owner,
    spender,
    value: valueWei.toString(),
    deadline,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}
