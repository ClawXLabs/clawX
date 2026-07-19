/**
 * Verify a Telegram Login Widget authentication and check group membership.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN          — Your Telegram Bot token (from @BotFather)
 *   TELEGRAM_GROUP_CHAT_ID      — Chat ID of the ClawX Telegram group (e.g. "-1001234567890")
 *
 * Optional env:
 *   TELEGRAM_GROUP_INVITE_LINK  — e.g. "https://t.me/ClawXCommunity"
 *
 * Flow:
 *   POST { wallet, telegramUser: { id, username, first_name, auth_date, hash, ... } }
 *   → Validates Telegram HMAC auth hash (proves data is genuine from Telegram)
 *   → Calls getChatMember to check if user is in the group
 *   → Saves result to wallet profile
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createHmac, createHash } from 'crypto';
import { ethers } from 'ethers';
import { setSocialLink } from '../../../utils/agents/store';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** Verify Telegram Login Widget data per the official spec. */
function verifyTelegramAuth(data: TelegramUser, botToken: string): boolean {
  const { hash, ...fields } = data;
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret_key = SHA256(bot_token)  (for Login Widget, NOT for Web App)
  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return expectedHash === hash;
}

/** Check if user is member/admin/creator of the group. */
async function checkGroupMembership(
  userId: number,
  botToken: string,
  groupChatId: string
): Promise<{ isMember: boolean; status?: string; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(groupChatId)}&user_id=${userId}`;
    const resp = await fetch(url);
    const data = await resp.json() as { ok: boolean; result?: { status: string }; description?: string };
    if (!data.ok) {
      return { isMember: false, error: data.description || 'api_error' };
    }
    const status = data.result?.status || '';
    const isMember = ['member', 'administrator', 'creator'].includes(status);
    return { isMember, status };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { isMember: false, error: err.message || 'network_error' };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, telegramUser } = req.body || {};

  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet required' });
  }
  if (!telegramUser || typeof telegramUser !== 'object' || !telegramUser.id || !telegramUser.hash) {
    return res.status(400).json({ error: 'telegramUser data required' });
  }

  const user = ethers.getAddress(String(wallet));
  const tgUser = telegramUser as TelegramUser;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const inviteLink = process.env.TELEGRAM_GROUP_INVITE_LINK || 'https://t.me/+qyCCGAanSrYxYmI1';

  if (!botToken) {
    // No bot configured — save the Telegram user data as self-attested
    await setSocialLink(user, 'telegram', {
      telegramId: tgUser.id,
      username: tgUser.username || null,
      firstName: tgUser.first_name || null,
      inGroup: false,
      selfAttested: true,
      linkedAt: Math.floor(Date.now() / 1000),
    });
    return res.status(200).json({
      ok: true, verified: false, selfAttested: true,
      username: tgUser.username || null,
      message: 'Telegram connected (group check not configured). Join the group and re-verify once the bot is set up.',
      inviteLink,
    });
  }

  // Validate the Telegram auth hash
  const authValid = verifyTelegramAuth(tgUser, botToken);
  if (!authValid) {
    return res.status(401).json({ error: 'Invalid Telegram authentication data' });
  }

  // Check auth_date is within the last hour to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (now - tgUser.auth_date > 3600) {
    return res.status(401).json({ error: 'Telegram auth data is too old. Please log in again.' });
  }

  if (!groupChatId) {
    await setSocialLink(user, 'telegram', {
      telegramId: tgUser.id,
      username: tgUser.username || null,
      firstName: tgUser.first_name || null,
      inGroup: false,
      authVerified: true,
      linkedAt: Math.floor(Date.now() / 1000),
    });
    return res.status(200).json({
      ok: true, authVerified: true, inGroup: false,
      username: tgUser.username || null,
      message: 'Telegram identity verified. Group membership check not configured.',
      inviteLink,
    });
  }

  const { isMember, status, error: memberError } = await checkGroupMembership(tgUser.id, botToken, groupChatId);

  await setSocialLink(user, 'telegram', {
    telegramId: tgUser.id,
    username: tgUser.username || null,
    firstName: tgUser.first_name || null,
    inGroup: isMember,
    memberStatus: status || null,
    authVerified: true,
    linkedAt: Math.floor(Date.now() / 1000),
  });

  if (memberError) {
    return res.status(200).json({
      ok: true, authVerified: true, inGroup: false,
      username: tgUser.username || null,
      message: 'Telegram connected but group check failed — join the group and verify again.',
      inviteLink,
    });
  }

  if (isMember) {
    return res.status(200).json({
      ok: true, authVerified: true, inGroup: true,
      username: tgUser.username || null,
      message: `✓ You are in the ClawX Telegram group.`,
    });
  }

  return res.status(200).json({
    ok: true, authVerified: true, inGroup: false,
    username: tgUser.username || null,
    message: `Connected as @${tgUser.username || tgUser.id} but not in the ClawX group. Join first.`,
    inviteLink,
  });
}
