import { keccak256, toUtf8Bytes } from 'ethers';

export function settingsSignatureMessage({ wallet, provider, model, baseUrl, apiKey, cooldownSec }) {
  return [
    'ClawX agent settings',
    `Wallet: ${String(wallet).toLowerCase()}`,
    `Provider: ${provider}`,
    `Model: ${model}`,
    `Base URL: ${baseUrl || ''}`,
    `Cooldown: ${cooldownSec}`,
    `API key hash: ${keccak256(toUtf8Bytes(String(apiKey)))}`,
  ].join('\n');
}
