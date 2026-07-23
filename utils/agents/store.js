import { query, withTransaction } from '../db/postgres.js';
import { getRedis } from '../db/redis.js';

const TRADE_LOG_DISPLAY_CAP = 200;

function walletKey(wallet) {
  return wallet?.toLowerCase() || '';
}

function epochSeconds(value) {
  if (!value) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function hydrateEnrollment(dbRow) {
  if (!dbRow) return null;
  return {
    ...(dbRow.payload || {}),
    wallet: dbRow.wallet,
    agentId: dbRow.agent_id,
    agentName: dbRow.agent_name || dbRow.payload?.agentName,
    status: dbRow.status,
    paused: dbRow.paused,
    tradeSizeTusdc: dbRow.trade_size_tusdc == null
      ? dbRow.payload?.tradeSizeTusdc
      : Number(dbRow.trade_size_tusdc),
    agentMemory: dbRow.agent_memory,
    pendingOutcomes: dbRow.pending_outcomes || [],
    lifetimeTxCount: Number(dbRow.lifetime_tx_count) || 0,
    startedAt: dbRow.payload?.startedAt || epochSeconds(dbRow.created_at),
    updatedAt: epochSeconds(dbRow.updated_at),
    lastTradeAt: dbRow.payload?.lastTradeAt || epochSeconds(dbRow.last_trade_at),
  };
}

async function selectEnrollment(client, wallet, forUpdate = false) {
  const result = await client.query(
    `SELECT * FROM enrollments WHERE wallet = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [wallet]
  );
  return hydrateEnrollment(result.rows[0]);
}

async function upsertEnrollment(client, row) {
  const key = walletKey(row.wallet);
  const now = Math.floor(Date.now() / 1000);
  const normalized = {
    ...row,
    wallet: key,
    pendingOutcomes: row.pendingOutcomes || [],
    tradeLog: row.tradeLog || [],
    delegateSpentRaw: row.delegateSpentRaw || '0',
    lifetimeTxCount: Number(row.lifetimeTxCount) || 0,
    updatedAt: now,
  };

  await client.query(
    `INSERT INTO enrollments (
       wallet, agent_id, agent_name, status, paused, trade_size_tusdc,
       agent_memory, pending_outcomes, lifetime_tx_count, payload,
       created_at, updated_at, last_trade_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb,
       COALESCE($11, NOW()), NOW(), $12
     )
     ON CONFLICT (wallet) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       agent_name = EXCLUDED.agent_name,
       status = EXCLUDED.status,
       paused = EXCLUDED.paused,
       trade_size_tusdc = EXCLUDED.trade_size_tusdc,
       agent_memory = EXCLUDED.agent_memory,
       pending_outcomes = EXCLUDED.pending_outcomes,
       lifetime_tx_count = EXCLUDED.lifetime_tx_count,
       payload = EXCLUDED.payload,
       updated_at = NOW(),
       last_trade_at = EXCLUDED.last_trade_at`,
    [
      key,
      normalized.agentId,
      normalized.agentName || null,
      normalized.status || 'active',
      Boolean(normalized.paused),
      normalized.tradeSizeTusdc ?? null,
      JSON.stringify(normalized.agentMemory ?? null),
      JSON.stringify(normalized.pendingOutcomes),
      normalized.lifetimeTxCount,
      JSON.stringify(normalized),
      toDate(normalized.startedAt),
      toDate(normalized.lastTradeAt),
    ]
  );
  return normalized;
}

export async function readEnrollments() {
  const result = await query('SELECT * FROM enrollments ORDER BY created_at ASC');
  return Object.fromEntries(result.rows.map((row) => [row.wallet, hydrateEnrollment(row)]));
}

export async function writeEnrollments(data) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM enrollments');
    for (const [wallet, row] of Object.entries(data || {})) {
      await upsertEnrollment(client, { ...row, wallet });
    }
  });
}

export async function getEnrollment(wallet) {
  const key = walletKey(wallet);
  if (!key) return null;
  const result = await query('SELECT * FROM enrollments WHERE wallet = $1', [key]);
  return hydrateEnrollment(result.rows[0]);
}

/** True lifetime BUY count from the uncapped trade_log table. */
export async function countBuysInTable(wallet) {
  const key = walletKey(wallet);
  if (!key) return 0;
  const result = await query(
    "SELECT COUNT(*)::int AS cnt FROM trade_log WHERE wallet = $1 AND action = 'BUY'",
    [key]
  );
  return Number(result.rows[0]?.cnt) || 0;
}

/** Unique confirmed BUY count for leaderboard (never capped by tradeLog slice). */
export function countLeaderboardTxs(row) {
  if (!row) return 0;
  const seen = new Set();
  for (const trade of row.tradeLog || []) {
    if (trade.action !== 'BUY') continue;
    seen.add((trade.hash || `${trade.roundId}-${trade.side}`).toLowerCase());
  }
  for (const pending of row.pendingOutcomes || []) {
    const side = pending.isUp ? 'UP' : 'DOWN';
    seen.add((pending.hash || `${pending.roundId}-${side}`).toLowerCase());
  }
  return Math.max(seen.size, Number(row.lifetimeTxCount) || 0);
}

export async function setEnrollment(wallet, payload) {
  const key = walletKey(wallet);
  if (!key) return null;
  return withTransaction(async (client) => {
    const existing = (await selectEnrollment(client, key, true)) || {};
    const previousLog = existing.tradeLog || [];
    const incomingLog = payload.tradeLog;
    const tradeLog =
      incomingLog === undefined || (incomingLog.length === 0 && previousLog.length > 0)
        ? previousLog
        : incomingLog;
    const merged = {
      ...existing,
      ...payload,
      wallet: key,
      tradeLog,
      pendingOutcomes:
        payload.pendingOutcomes !== undefined ? payload.pendingOutcomes : existing.pendingOutcomes || [],
      delegateSpentRaw:
        payload.delegateSpentRaw !== undefined ? payload.delegateSpentRaw : existing.delegateSpentRaw || '0',
    };
    merged.lifetimeTxCount =
      payload.lifetimeTxCount !== undefined
        ? payload.lifetimeTxCount
        : existing.lifetimeTxCount !== undefined
          ? existing.lifetimeTxCount
          : countLeaderboardTxs(merged);
    return upsertEnrollment(client, merged);
  });
}

export async function removeEnrollment(wallet) {
  const key = walletKey(wallet);
  if (!key) return false;
  const result = await query('DELETE FROM enrollments WHERE wallet = $1', [key]);
  return result.rowCount > 0;
}

export async function setAgentPaused(wallet, paused) {
  const row = await getEnrollment(wallet);
  if (!row || row.status !== 'active') return null;
  return setEnrollment(wallet, {
    ...row,
    paused: Boolean(paused),
    pausedAt: paused ? Math.floor(Date.now() / 1000) : null,
    // Clear pending kill/switch if user manually resumes
    ...(paused === false ? { pendingControl: null } : {}),
  });
}

/**
 * Schedule or apply kill / switch.
 * timing: 'immediate' | 'next_market'
 * - immediate kill → retire now
 * - next_market → stop new trades; apply when open positions + pending outcomes clear
 * - immediate switch → retire now (caller navigates to deploy)
 * - next_market switch → stop new trades; when clear, pause + ready=true for UI to finish deploy
 */
export async function setPendingControl(wallet, control) {
  const row = await getEnrollment(wallet);
  if (!row || row.status !== 'active') return null;
  const now = Math.floor(Date.now() / 1000);
  const timing = control?.timing === 'next_market' ? 'next_market' : 'immediate';
  const action = control?.action === 'switch' ? 'switch' : 'kill';

  if (timing === 'immediate' && action === 'kill') {
    await retireEnrollment(wallet);
    return { applied: true, action: 'kill', timing, enrollment: null };
  }

  if (timing === 'immediate' && action === 'switch') {
    await retireEnrollment(wallet);
    return {
      applied: true,
      action: 'switch',
      timing,
      targetAgentId: control?.targetAgentId || null,
      tradeSizeTusdc: control?.tradeSizeTusdc ?? null,
      enrollment: null,
    };
  }

  const pendingControl = {
    action,
    timing: 'next_market',
    targetAgentId: action === 'switch' ? control?.targetAgentId || null : null,
    tradeSizeTusdc:
      action === 'switch' && control?.tradeSizeTusdc != null && Number(control.tradeSizeTusdc) > 0
        ? Number(control.tradeSizeTusdc)
        : null,
    requestedAt: now,
    ready: false,
  };

  const enrollment = await setEnrollment(wallet, {
    ...row,
    pendingControl,
  });
  return { applied: false, action, timing: 'next_market', enrollment, pendingControl };
}

export async function clearPendingControl(wallet) {
  const row = await getEnrollment(wallet);
  if (!row || row.status !== 'active') return null;
  return setEnrollment(wallet, {
    ...row,
    pendingControl: null,
    // Ready-switch had paused the agent — cancel must unpause
    paused: false,
    pausedAt: null,
  });
}

/** Apply deferred kill/switch once markets have cleared. */
export async function applyPendingControlIfReady(wallet, { openPositionCount = 0, unresolvedOpenCount } = {}) {
  const row = await getEnrollment(wallet);
  if (!row || row.status !== 'active' || !row.pendingControl) return { changed: false, enrollment: row };
  if (row.pendingControl.timing !== 'next_market') return { changed: false, enrollment: row };

  // Already marked ready — do not rewrite enrollment every tick (avoids UI thrash)
  if (row.pendingControl.ready) {
    return { changed: false, applied: 'switch_ready', enrollment: row };
  }

  const openCount =
    unresolvedOpenCount != null ? Number(unresolvedOpenCount) : Number(openPositionCount) || 0;
  // Only unresolved live markets block readiness. Settled shares / journal rows must not trap switch.
  if (openCount > 0) {
    return { changed: false, enrollment: row };
  }

  const { action, targetAgentId } = row.pendingControl;
  if (action === 'kill') {
    await retireEnrollment(wallet);
    return { changed: true, applied: 'kill', enrollment: null };
  }

  // Switch: pause and mark ready so the user can finish deploy with a fresh signature
  const enrollment = await setEnrollment(wallet, {
    ...row,
    paused: true,
    pausedAt: Math.floor(Date.now() / 1000),
    pendingControl: {
      ...row.pendingControl,
      ready: true,
      readyAt: Math.floor(Date.now() / 1000),
      targetAgentId: targetAgentId || null,
    },
  });
  return { changed: true, applied: 'switch_ready', enrollment };
}

export async function updateTradeLogOutcome(wallet, roundId, side, outcome, extra = {}) {
  const row = await getEnrollment(wallet);
  if (!row) return null;
  const normalizedSide = String(side || '').toUpperCase();
  let changed = false;
  const tradeLog = (row.tradeLog || []).map((trade) => {
    if (
      changed ||
      Number(trade.roundId) !== Number(roundId) ||
      String(trade.side || '').toUpperCase() !== normalizedSide
    ) {
      return trade;
    }
    changed = true;
    return {
      ...trade,
      outcome,
      settledAt: extra.settledAt || Math.floor(Date.now() / 1000),
      outcomeNote: extra.outcomeNote || trade.outcomeNote,
    };
  });
  if (!changed) return row;
  await query(
    `UPDATE trade_log SET outcome = $4, settled_at = $5, payload = payload || $6::jsonb
     WHERE wallet = $1 AND round_id = $2 AND upper(side) = $3`,
    [
      walletKey(wallet),
      Number(roundId),
      normalizedSide,
      outcome,
      toDate(extra.settledAt || Math.floor(Date.now() / 1000)),
      JSON.stringify({ outcome, ...extra }),
    ]
  );
  return setEnrollment(wallet, { ...row, tradeLog });
}

export async function retireEnrollment(wallet) {
  const row = await getEnrollment(wallet);
  if (!row) return false;
  await setEnrollment(wallet, {
    ...row,
    status: 'retired',
    retiredAt: Math.floor(Date.now() / 1000),
    agentMemory: null,
    pendingOutcomes: [],
    // Must clear — otherwise next enroll merges stale pendingControl/paused and loops Complete switch
    pendingControl: null,
    paused: false,
    pausedAt: null,
    delegateSignature: null,
    delegateDeadline: null,
    delegateMaxRaw: null,
    delegateSpentRaw: '0',
  });
  return true;
}

export async function clearAllEnrollments() {
  await query('DELETE FROM enrollments');
}

export async function clearFeed() {
  await query('DELETE FROM feed_messages');
}

export async function appendTradeLog(wallet, entry) {
  const row = await getEnrollment(wallet);
  if (!row) return null;
  const hashKey = (entry.hash || `${entry.roundId}-${entry.side}`).toLowerCase();
  const exists = (row.tradeLog || []).some(
    (trade) => (trade.hash || `${trade.roundId}-${trade.side}`).toLowerCase() === hashKey
  );
  if (!exists) {
    row.tradeLog = [entry, ...(row.tradeLog || [])].slice(0, TRADE_LOG_DISPLAY_CAP);
    await query(
      `INSERT INTO trade_log (
         wallet, round_id, side, action, symbol, amount_tusdc, hash,
         outcome, thought, payload, created_at, settled_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11,NOW()),$12)
       ON CONFLICT (wallet, round_id, side, action) DO NOTHING`,
      [
        walletKey(wallet),
        Number(entry.roundId),
        entry.side,
        entry.action,
        entry.symbol || null,
        entry.amountTusdc ?? null,
        entry.hash || null,
        entry.outcome || null,
        entry.thought || null,
        JSON.stringify(entry),
        toDate(entry.at),
        toDate(entry.settledAt),
      ]
    );
    // Lifetime count must come from the uncapped trade_log table: the in-memory
    // tradeLog array is sliced to TRADE_LOG_DISPLAY_CAP, which froze the count
    // at 200 once older BUY entries fell out of the window.
    const tableCount = await countBuysInTable(wallet);
    row.lifetimeTxCount = Math.max(countLeaderboardTxs(row), tableCount);
  }
  return setEnrollment(wallet, row);
}

export async function readFeed() {
  const result = await query(
    'SELECT payload, id, created_at FROM feed_messages ORDER BY created_at DESC LIMIT 120'
  );
  return result.rows.map((row) => ({
    ...(row.payload || {}),
    id: row.id,
    at: row.payload?.at || epochSeconds(row.created_at),
  }));
}

export async function readProfiles() {
  const result = await query('SELECT * FROM wallet_profiles');
  return Object.fromEntries(
    result.rows.map((row) => [
      row.wallet,
      {
        displayName: row.display_name,
        socialLinks: row.social_links || {},
        updatedAt: epochSeconds(row.updated_at),
      },
    ])
  );
}

export async function getDisplayName(wallet) {
  const key = walletKey(wallet);
  if (!key) return null;
  const result = await query('SELECT display_name FROM wallet_profiles WHERE wallet = $1', [key]);
  return result.rows[0]?.display_name?.trim() || null;
}

export async function setDisplayName(wallet, displayName) {
  const key = walletKey(wallet);
  if (!key) return null;
  const name = String(displayName || '').trim().slice(0, 32);
  const result = await query(
    `INSERT INTO wallet_profiles (wallet, display_name)
     VALUES ($1, $2)
     ON CONFLICT (wallet) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
     RETURNING *`,
    [key, name]
  );
  return {
    displayName: result.rows[0].display_name,
    socialLinks: result.rows[0].social_links || {},
    updatedAt: epochSeconds(result.rows[0].updated_at),
  };
}

export async function getSocialLinks(wallet) {
  const key = walletKey(wallet);
  if (!key) return {};
  const result = await query('SELECT social_links FROM wallet_profiles WHERE wallet = $1', [key]);
  return result.rows[0]?.social_links || {};
}

export async function setSocialLink(wallet, platform, data) {
  const key = walletKey(wallet);
  if (!key) return null;
  const existing = await getSocialLinks(key);
  const socialLinks = {
    ...existing,
    [platform]: {
      ...(existing[platform] || {}),
      ...data,
      updatedAt: Math.floor(Date.now() / 1000),
    },
  };
  await query(
    `INSERT INTO wallet_profiles (wallet, social_links)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (wallet) DO UPDATE SET social_links = EXCLUDED.social_links, updated_at = NOW()`,
    [key, JSON.stringify(socialLinks)]
  );
  return socialLinks[platform];
}

export async function getFullProfile(wallet) {
  const key = walletKey(wallet);
  if (!key) return null;
  const result = await query('SELECT * FROM wallet_profiles WHERE wallet = $1', [key]);
  const row = result.rows[0];
  return {
    wallet: key,
    displayName: row?.display_name || null,
    socialLinks: row?.social_links || {},
  };
}

export function reconcileTradeLog(row) {
  if (!row?.wallet) return row;
  const log = [...(row.tradeLog || [])];
  const seen = new Set(log.map((trade) => `${trade.roundId}-${trade.side}`));
  for (const pending of row.pendingOutcomes || []) {
    const side = pending.isUp ? 'UP' : 'DOWN';
    const key = `${pending.roundId}-${side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    log.unshift({
      at: pending.at || Math.floor(Date.now() / 1000),
      action: 'BUY',
      side,
      symbol: pending.symbol,
      amountTusdc: row.tradeSizeTusdc,
      hash: pending.hash || '',
      roundId: pending.roundId,
    });
  }
  const merged = { ...row, tradeLog: log.slice(0, TRADE_LOG_DISPLAY_CAP) };
  return {
    ...merged,
    lifetimeTxCount: Math.max(Number(row.lifetimeTxCount) || 0, countLeaderboardTxs(merged)),
  };
}

export async function buildLeaderboardRows() {
  const [enrollments, profiles] = await Promise.all([readEnrollments(), readProfiles()]);
  const rows = Object.values(enrollments)
    .filter((row) => row.status === 'active' || row.tradeLog?.length > 0)
    .map(reconcileTradeLog)
    .map((row) => {
      const wallet = walletKey(row.wallet);
      const trades = (row.tradeLog || []).filter((trade) => trade.action === 'BUY');
      const symbolStats = row.agentMemory?.symbolStats || {};
      let wins = 0;
      let losses = 0;
      const bySymbol = {};
      for (const [symbol, stat] of Object.entries(symbolStats)) {
        wins += Number(stat.wins) || 0;
        losses += Number(stat.losses) || 0;
        bySymbol[symbol] = {
          symbol,
          wins: Number(stat.wins) || 0,
          losses: Number(stat.losses) || 0,
          trades: (Number(stat.wins) || 0) + (Number(stat.losses) || 0),
          spend: 0,
        };
      }
      for (const trade of trades) {
        if (!trade.symbol) continue;
        bySymbol[trade.symbol] ||= {
          symbol: trade.symbol,
          wins: 0,
          losses: 0,
          trades: 0,
          spend: 0,
        };
        bySymbol[trade.symbol].spend += Number(trade.amountTusdc) || 0;
      }
      const settled = wins + losses;
      return {
        wallet: row.wallet,
        displayName: profiles[wallet]?.displayName || null,
        agentId: row.agentId,
        agentName: row.agentName,
        txCount: countLeaderboardTxs(row),
        lastTxHash: [...trades].reverse().find((trade) => trade.hash)?.hash || '',
        tradeSizeTusdc: row.tradeSizeTusdc,
        lastTradeAt: row.lastTradeAt || row.updatedAt || row.startedAt || 0,
        status: row.status,
        wins,
        losses,
        winRate: settled > 0 ? Math.round((wins / settled) * 100) : null,
        bySymbol: Object.values(bySymbol).sort((a, b) => b.trades - a.trades),
        _enrollment: row,
        _socialLinks: profiles[wallet]?.socialLinks || {},
      };
    });
  rows.sort((a, b) => b.txCount - a.txCount || b.lastTradeAt - a.lastTradeAt);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getAppAgentStats() {
  const rows = await buildLeaderboardRows();
  return {
    totalTransactions: rows.reduce((sum, row) => sum + row.txCount, 0),
    activePilots: rows.filter((row) => row.status === 'active').length,
    enrolledWallets: rows.length,
  };
}

export async function appendFeedMessage(message) {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Math.floor(Date.now() / 1000),
    ...message,
  };
  await query(
    `INSERT INTO feed_messages (
       id, agent_id, agent_name, handle, color, text, kind,
       pilot_wallet, pilot_name, payload, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      row.id,
      row.agentId || null,
      row.agentName || null,
      row.handle || null,
      row.color || null,
      row.text,
      row.kind || null,
      row.pilotWallet ? walletKey(row.pilotWallet) : null,
      row.pilotName || null,
      JSON.stringify(row),
      toDate(row.at),
    ]
  );
  try {
    await getRedis().publish('feed:messages', JSON.stringify({ type: 'feed', data: row }));
  } catch (error) {
    console.error('[feed] Redis publish failed:', error.message);
  }
  try {
    const { publishFeedMessage } = await import('./feedBroadcast.js');
    publishFeedMessage(row);
  } catch {
    // Broadcast is optional during tests and migrations.
  }
  return row;
}
