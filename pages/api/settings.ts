import type { NextApiRequest, NextApiResponse } from 'next';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ethers } from 'ethers';
import { getUserSettings, saveUserSettings } from '../../utils/agents/settings';
import { settingsSignatureMessage } from '../../utils/agents/settingsSignature';

const PROVIDERS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
  },
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  custom: { baseUrl: null, defaultModel: '' },
} as const;

function privateAddress(address: string) {
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) {
    return true;
  }
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

async function validateCustomBaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Custom base URL must be a public HTTPS URL without embedded credentials');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Private LLM endpoints are not supported');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new Error('Custom base URL resolves to a private or invalid address');
  }
  return url.toString().replace(/\/$/, '');
}

async function verifyLlmKey(baseUrl: string, apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Reply OK' }],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Provider rejected the key (${response.status}): ${body.slice(0, 160)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const wallet = String(req.query.wallet || '');
    if (!ethers.isAddress(wallet)) return res.status(400).json({ error: 'Valid wallet query required' });
    try {
      const settings = await getUserSettings(wallet);
      return res.status(200).json({
        settings: settings || {
          wallet: ethers.getAddress(wallet),
          provider: 'gemini',
          model: PROVIDERS.gemini.defaultModel,
          baseUrl: PROVIDERS.gemini.baseUrl,
          cooldownSec: 180,
          keyVerified: false,
          keyMasked: null,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Could not load settings' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet, provider, model, baseUrl: requestedBaseUrl, apiKey, cooldownSec, signature } = req.body || {};
    if (!ethers.isAddress(wallet)) return res.status(400).json({ error: 'Valid wallet required' });
    if (!(provider in PROVIDERS)) return res.status(400).json({ error: 'Unsupported LLM provider' });
    if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 512) {
      return res.status(400).json({ error: 'API key must be between 8 and 512 characters' });
    }
    const selectedModel = String(model || PROVIDERS[provider as keyof typeof PROVIDERS].defaultModel).trim();
    if (!/^[a-zA-Z0-9._:/-]{2,120}$/.test(selectedModel)) {
      return res.status(400).json({ error: 'Invalid model name' });
    }
    const cooldown = Math.min(3_600, Math.max(10, Number(cooldownSec) || 180));
    const baseUrl =
      provider === 'custom'
        ? await validateCustomBaseUrl(String(requestedBaseUrl || ''))
        : PROVIDERS[provider as keyof typeof PROVIDERS].baseUrl!;
    const user = ethers.getAddress(wallet);
    const message = settingsSignatureMessage({
      wallet: user,
      provider,
      model: selectedModel,
      baseUrl,
      apiKey,
      cooldownSec: cooldown,
    });
    const signer = ethers.verifyMessage(message, String(signature || ''));
    if (signer.toLowerCase() !== user.toLowerCase()) {
      return res.status(401).json({ error: 'Settings signature does not match wallet' });
    }

    await verifyLlmKey(baseUrl, apiKey, selectedModel);
    const settings = await saveUserSettings(user, {
      provider,
      model: selectedModel,
      baseUrl,
      apiKey,
      cooldownSec: cooldown,
      keyVerified: true,
    });
    return res.status(200).json({ saved: true, verified: true, settings });
  } catch (error: any) {
    const message =
      error?.name === 'AbortError' ? 'Provider verification timed out' : error.message || 'Could not save settings';
    return res.status(400).json({ error: message });
  }
}
