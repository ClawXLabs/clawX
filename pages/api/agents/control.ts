import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import {
  clearPendingControl,
  getEnrollment,
  retireEnrollment,
  setPendingControl,
} from '../../../utils/agents/store';
import { getAgentById } from '../../../utils/agents/config';

function newAgentPath(agentId: string, tradeSizeTusdc?: number | null) {
  const q = new URLSearchParams({ agent: String(agentId) });
  if (tradeSizeTusdc != null && Number(tradeSizeTusdc) > 0) {
    q.set('tradeSize', String(Number(tradeSizeTusdc)));
  }
  return `/agents/new?${q.toString()}`;
}

/**
 * Kill or schedule a switch.
 * body: {
 *   wallet,
 *   action: 'kill' | 'switch' | 'cancel_pending' | 'complete_switch',
 *   timing?: 'immediate' | 'next_market',
 *   targetAgentId?: string,
 *   tradeSizeTusdc?: number
 * }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, action, timing, targetAgentId, tradeSizeTusdc } = req.body || {};
  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }

  const user = ethers.getAddress(String(wallet));
  const enrollment = await getEnrollment(user);
  const sizeNum =
    tradeSizeTusdc != null && Number(tradeSizeTusdc) > 0
      ? Number(tradeSizeTusdc)
      : enrollment?.tradeSizeTusdc != null && Number(enrollment.tradeSizeTusdc) > 0
        ? Number(enrollment.tradeSizeTusdc)
        : null;

  if (action === 'cancel_pending') {
    if (!enrollment || enrollment.status !== 'active') {
      return res.status(404).json({ error: 'No active enrollment' });
    }
    const row = await clearPendingControl(user);
    return res.status(200).json({
      ok: true,
      cancelled: true,
      pendingControl: null,
      message: 'Pending kill/switch cancelled. Agent can trade again when not paused.',
      enrollment: row,
    });
  }

  if (action === 'complete_switch') {
    if (!enrollment || enrollment.status !== 'active') {
      return res.status(404).json({ error: 'No active enrollment' });
    }
    const pending = enrollment.pendingControl;
    const target = targetAgentId || pending?.targetAgentId;
    if (!target || !getAgentById(String(target))) {
      return res.status(400).json({ error: 'Valid targetAgentId required' });
    }
    const size =
      tradeSizeTusdc != null && Number(tradeSizeTusdc) > 0
        ? Number(tradeSizeTusdc)
        : pending?.tradeSizeTusdc != null
          ? Number(pending.tradeSizeTusdc)
          : enrollment.tradeSizeTusdc != null
            ? Number(enrollment.tradeSizeTusdc)
            : null;
    await retireEnrollment(user);
    return res.status(200).json({
      ok: true,
      applied: true,
      action: 'switch',
      targetAgentId: target,
      tradeSizeTusdc: size,
      message: 'Agent cleared. Deploy the selected agent to continue.',
      redirectTo: newAgentPath(String(target), size),
    });
  }

  if (action !== 'kill' && action !== 'switch') {
    return res.status(400).json({ error: 'action must be kill, switch, cancel_pending, or complete_switch' });
  }

  if (!enrollment || enrollment.status !== 'active') {
    return res.status(404).json({ error: 'No active enrollment' });
  }

  if (action === 'switch') {
    if (!targetAgentId || !getAgentById(String(targetAgentId))) {
      return res.status(400).json({ error: 'Valid targetAgentId required to switch' });
    }
    if (String(targetAgentId) === String(enrollment.agentId)) {
      return res.status(400).json({ error: 'Already running that agent' });
    }
  }

  const when = timing === 'next_market' ? 'next_market' : 'immediate';
  const result = await setPendingControl(user, {
    action,
    timing: when,
    targetAgentId: action === 'switch' ? String(targetAgentId) : null,
    tradeSizeTusdc: action === 'switch' ? sizeNum : null,
  });

  if (when === 'immediate') {
    return res.status(200).json({
      ok: true,
      applied: true,
      action,
      timing: when,
      targetAgentId: action === 'switch' ? String(targetAgentId) : null,
      tradeSizeTusdc: action === 'switch' ? sizeNum : null,
      message:
        action === 'kill'
          ? 'Agent killed. No further trades. History is kept on this wallet.'
          : 'Agent cleared. Deploy the selected agent to continue.',
      redirectTo:
        action === 'switch' ? newAgentPath(String(targetAgentId), sizeNum) : '/agents',
    });
  }

  const target = getAgentById(String(targetAgentId || ''));
  return res.status(200).json({
    ok: true,
    applied: false,
    action,
    timing: when,
    pendingControl: result?.pendingControl || null,
    targetAgentId: action === 'switch' ? String(targetAgentId) : null,
    tradeSizeTusdc: action === 'switch' ? sizeNum : null,
    message:
      action === 'kill'
        ? 'Kill scheduled. Current open markets will finish; no new trades after that.'
        : `Switch to ${target?.name || 'new agent'} scheduled after current markets finish.`,
  });
}
