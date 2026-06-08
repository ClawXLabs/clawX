import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ENROLLMENTS_FILE = path.join(DATA_DIR, 'agent-enrollments.json');
const FEED_FILE = path.join(DATA_DIR, 'agent-feed.json');
const PROFILES_FILE = path.join(DATA_DIR, 'wallet-profiles.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function readEnrollments() {
  return readJson(ENROLLMENTS_FILE, {});
}

export function writeEnrollments(data) {
  writeJson(ENROLLMENTS_FILE, data);
}

export function getEnrollment(wallet) {
  const key = wallet?.toLowerCase();
  if (!key) return null;
  return readEnrollments()[key] || null;
}

const TRADE_LOG_DISPLAY_CAP = 200;

/** Unique confirmed BUY count for leaderboard (never capped by tradeLog slice). */
export function countLeaderboardTxs(row) {
  if (!row) return 0;
  const seen = new Set();
  for (const t of row.tradeLog || []) {
    if (t.action !== 'BUY') continue;
    const key = (t.hash || `${t.roundId}-${t.side}`).toLowerCase();
    seen.add(key);
  }
  for (const p of row.pendingOutcomes || []) {
    const side = p.isUp ? 'UP' : 'DOWN';
    const key = (p.hash || `${p.roundId}-${side}`).toLowerCase();
    seen.add(key);
  }
  const fromLog = seen.size;
  const lifetime = Number(row.lifetimeTxCount) || 0;
  return Math.max(fromLog, lifetime);
}

export function setEnrollment(wallet, payload) {
  const key = wallet.toLowerCase();
  const all = readEnrollments();
  const existing = all[key] || {};
  const incomingLog = payload.tradeLog;
  const prevLog = existing.tradeLog || [];
  let tradeLog = prevLog;
  if (incomingLog !== undefined) {
    tradeLog = incomingLog.length === 0 && prevLog.length > 0 ? prevLog : incomingLog;
  }
  const lifetimeTxCount =
    payload.lifetimeTxCount !== undefined
      ? payload.lifetimeTxCount
      : existing.lifetimeTxCount !== undefined
        ? existing.lifetimeTxCount
        : countLeaderboardTxs({ ...existing, tradeLog });
  all[key] = {
    ...existing,
    ...payload,
    wallet: key,
    tradeLog,
    lifetimeTxCount,
    pendingOutcomes:
      payload.pendingOutcomes !== undefined ? payload.pendingOutcomes : existing.pendingOutcomes || [],
    delegateSpentRaw:
      payload.delegateSpentRaw !== undefined ? payload.delegateSpentRaw : existing.delegateSpentRaw || '0',
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeEnrollments(all);
  return all[key];
}

export function removeEnrollment(wallet) {
  const key = wallet?.toLowerCase();
  if (!key) return false;
  const all = readEnrollments();
  if (!all[key]) return false;
  delete all[key];
  writeEnrollments(all);
  return true;
}

export function setAgentPaused(wallet, paused) {
  const key = wallet?.toLowerCase();
  if (!key) return null;
  const all = readEnrollments();
  const row = all[key];
  if (!row || row.status !== 'active') return null;
  all[key] = {
    ...row,
    paused: Boolean(paused),
    pausedAt: Boolean(paused) ? Math.floor(Date.now() / 1000) : null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeEnrollments(all);
  return all[key];
}

/** Stamp win/loss onto a tradeLog row after settlement. */
export function updateTradeLogOutcome(wallet, roundId, side, outcome, extra = {}) {
  const key = wallet?.toLowerCase();
  if (!key) return null;
  const all = readEnrollments();
  const row = all[key];
  if (!row) return null;
  const normalizedSide = String(side || '').toUpperCase();
  const log = [...(row.tradeLog || [])];
  let changed = false;
  for (let i = 0; i < log.length; i += 1) {
    const t = log[i];
    if (Number(t.roundId) !== Number(roundId)) continue;
    if (String(t.side || '').toUpperCase() !== normalizedSide) continue;
    log[i] = {
      ...t,
      outcome,
      settledAt: extra.settledAt || Math.floor(Date.now() / 1000),
      outcomeNote: extra.outcomeNote || t.outcomeNote,
    };
    changed = true;
    break;
  }
  if (!changed) return row;
  all[key] = { ...row, tradeLog: log, updatedAt: Math.floor(Date.now() / 1000) };
  writeEnrollments(all);
  return all[key];
}

/** Retire current agent — keeps tradeLog for leaderboard history. */
export function retireEnrollment(wallet) {
  const key = wallet?.toLowerCase();
  if (!key) return false;
  const all = readEnrollments();
  const row = all[key];
  if (!row) return false;
  all[key] = {
    ...row,
    wallet: key,
    status: 'retired',
    retiredAt: Math.floor(Date.now() / 1000),
    agentMemory: null,
    pendingOutcomes: [],
    delegateSignature: null,
    delegateDeadline: null,
    delegateMaxRaw: null,
    delegateSpentRaw: '0',
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeEnrollments(all);
  return true;
}

export function clearAllEnrollments() {
  writeEnrollments({});
}

export function clearFeed() {
  writeJson(FEED_FILE, []);
}

export function appendTradeLog(wallet, entry) {
  const key = wallet.toLowerCase();
  const all = readEnrollments();
  const row = all[key];
  if (!row) return null;
  const hashKey = (entry.hash || `${entry.roundId}-${entry.side}`).toLowerCase();
  const exists = (row.tradeLog || []).some(
    (t) => (t.hash || `${t.roundId}-${t.side}`).toLowerCase() === hashKey
  );
  if (!exists) {
    row.tradeLog = [entry, ...(row.tradeLog || [])].slice(0, TRADE_LOG_DISPLAY_CAP);
    row.lifetimeTxCount = countLeaderboardTxs(row);
  }
  row.updatedAt = Math.floor(Date.now() / 1000);
  all[key] = row;
  writeEnrollments(all);
  return row;
}

export function readFeed() {
  return readJson(FEED_FILE, []);
}

export function readProfiles() {
  return readJson(PROFILES_FILE, {});
}

export function getDisplayName(wallet) {
  const key = wallet?.toLowerCase();
  if (!key) return null;
  const row = readProfiles()[key];
  return row?.displayName?.trim() || null;
}

export function setDisplayName(wallet, displayName) {
  const key = wallet?.toLowerCase();
  if (!key) return null;
  const all = readProfiles();
  all[key] = {
    displayName: String(displayName || '').trim().slice(0, 32),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeJson(PROFILES_FILE, all);
  return all[key];
}

export function reconcileTradeLog(row) {
  if (!row?.wallet) return row;
  const log = [...(row.tradeLog || [])];
  const pending = row.pendingOutcomes || [];
  const seen = new Set(log.map((t) => `${t.roundId}-${t.side}`));
  for (const p of pending) {
    const side = p.isUp ? 'UP' : 'DOWN';
    const key = `${p.roundId}-${side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    log.unshift({
      at: p.at || Math.floor(Date.now() / 1000),
      action: 'BUY',
      side,
      symbol: p.symbol,
      amountTusdc: row.tradeSizeTusdc,
      hash: p.hash || '',
      roundId: p.roundId,
    });
  }
  const merged = { ...row, tradeLog: log.slice(0, TRADE_LOG_DISPLAY_CAP) };
  const txCount = countLeaderboardTxs(merged);
  return { ...merged, lifetimeTxCount: Math.max(Number(row.lifetimeTxCount) || 0, txCount) };
}

export function buildLeaderboardRows() {
  const enrollments = readEnrollments();
  const profiles = readProfiles();
  const rows = Object.values(enrollments)
    .filter((row) => row.status === 'active' || (row.tradeLog && row.tradeLog.length > 0))
    .map((row) => reconcileTradeLog(row))
    .map((row) => {
      const wallet = row.wallet?.toLowerCase();
      const trades = (row.tradeLog || []).filter((t) => t.action === 'BUY');
      const txCount = countLeaderboardTxs(row);
      const lastHash = trades.find((t) => t.hash)?.hash || '';
      return {
        wallet: row.wallet,
        displayName: profiles[wallet]?.displayName || null,
        agentId: row.agentId,
        agentName: row.agentName,
        txCount,
        lastTxHash: lastHash,
        tradeSizeTusdc: row.tradeSizeTusdc,
        lastTradeAt: row.lastTradeAt || row.updatedAt || row.startedAt || 0,
        status: row.status,
      };
    });

  rows.sort((a, b) => b.txCount - a.txCount || b.lastTradeAt - a.lastTradeAt);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function getAppAgentStats() {
  const rows = buildLeaderboardRows();
  const totalTransactions = rows.reduce((sum, r) => sum + r.txCount, 0);
  const activePilots = rows.filter((r) => r.status === 'active').length;
  return {
    totalTransactions,
    activePilots,
    enrolledWallets: rows.length,
  };
}

export function appendFeedMessage(message) {
  const feed = readFeed();
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Math.floor(Date.now() / 1000),
    ...message,
  };
  const next = [row, ...feed].slice(0, 120);
  writeJson(FEED_FILE, next);
  try {
    const { publishFeedMessage } = require('./feedBroadcast.js');
    publishFeedMessage(row);
  } catch {
    /* broadcast optional during tests */
  }
  return row;
}
