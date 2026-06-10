/**
 * Verify that a given Twitter/X handle is following the ClawX account.
 *
 * Required env vars:
 *   TWITTER_BEARER_TOKEN       — Twitter API v1.1/v2 app-only Bearer Token
 *   TWITTER_CLAWX_HANDLE       — ClawX Twitter handle WITHOUT @  (e.g. "ClawXAvax")
 *
 * Flow:
 *   POST { wallet, twitterHandle }
 *   → checks GET /1.1/friendships/show.json?source_screen_name=<handle>&target_screen_name=<ClawX>
 *   → if following=true  → saves socialLinks.twitter = { handle, verified: true }
 *   → if following=false → saves { handle, verified: false, pendingVerify: true }
 *   → if no TWITTER_BEARER_TOKEN → saves as self-attested (pendingSocialCheck: true)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { setSocialLink } from '../../../utils/agents/store';

const CLAWX_HANDLE = process.env.TWITTER_CLAWX_HANDLE || 'clawxlabs';

function cleanHandle(h: string) {
  return h.replace(/^@/, '').trim().toLowerCase();
}

async function checkTwitterFollow(userHandle: string): Promise<{ following: boolean; error?: string }> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return { following: false, error: 'no_credentials' };
  }

  try {
    const url = `https://api.twitter.com/1.1/friendships/show.json?source_screen_name=${encodeURIComponent(userHandle)}&target_screen_name=${encodeURIComponent(CLAWX_HANDLE)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const code = (body as { errors?: Array<{ code: number }> }).errors?.[0]?.code;
      if (code === 34) return { following: false, error: 'user_not_found' };
      if (resp.status === 401 || resp.status === 403) return { following: false, error: 'invalid_credentials' };
      return { following: false, error: `api_error_${resp.status}` };
    }

    const data = await resp.json() as {
      relationship: { source: { following: boolean } };
    };
    return { following: Boolean(data.relationship?.source?.following) };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { following: false, error: err.message || 'network_error' };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, twitterHandle } = req.body || {};

  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet required' });
  }
  if (!twitterHandle || typeof twitterHandle !== 'string' || twitterHandle.trim().length < 1) {
    return res.status(400).json({ error: 'twitterHandle required' });
  }

  const user = ethers.getAddress(String(wallet));
  const handle = cleanHandle(twitterHandle);

  if (!/^[a-zA-Z0-9_]{1,50}$/.test(handle)) {
    return res.status(400).json({ error: 'Invalid Twitter handle format' });
  }

  const { following, error: apiError } = await checkTwitterFollow(handle);

  const noCredentials = apiError === 'no_credentials';
  const userNotFound = apiError === 'user_not_found';
  const invalidCreds = apiError === 'invalid_credentials';

  if (userNotFound) {
    return res.status(404).json({ error: `Twitter user @${handle} not found` });
  }

  const linkData: Record<string, unknown> = {
    handle,
    clawxHandle: CLAWX_HANDLE,
    verified: following,
    selfAttested: noCredentials,
    pendingVerify: !following && !noCredentials && !userNotFound,
    linkedAt: Math.floor(Date.now() / 1000),
  };

  if (invalidCreds) linkData.credentialError = true;

  setSocialLink(user, 'twitter', linkData);

  if (following) {
    return res.status(200).json({ ok: true, following: true, handle, message: `Verified — @${handle} is following @${CLAWX_HANDLE}` });
  }
  if (noCredentials) {
    return res.status(200).json({
      ok: true, following: false, handle, selfAttested: true,
      message: `@${handle} saved. Follow verification will be done manually — go follow @${CLAWX_HANDLE} on Twitter/X.`,
      followUrl: `https://twitter.com/intent/follow?screen_name=${CLAWX_HANDLE}`,
    });
  }
  return res.status(200).json({
    ok: true, following: false, handle,
    message: `@${handle} is not yet following @${CLAWX_HANDLE}. Follow on Twitter/X and verify again.`,
    followUrl: `https://twitter.com/intent/follow?screen_name=${CLAWX_HANDLE}`,
  });
}
