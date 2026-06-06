import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ENROLLMENTS_FILE = path.join(DATA_DIR, 'agent-enrollments.json');
const FEED_FILE = path.join(DATA_DIR, 'agent-feed.json');

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

export function setEnrollment(wallet, payload) {
  const key = wallet.toLowerCase();
  const all = readEnrollments();
  all[key] = { ...payload, wallet: key, updatedAt: Math.floor(Date.now() / 1000) };
  writeEnrollments(all);
  return all[key];
}

export function appendTradeLog(wallet, entry) {
  const key = wallet.toLowerCase();
  const all = readEnrollments();
  const row = all[key];
  if (!row) return null;
  row.tradeLog = [entry, ...(row.tradeLog || [])].slice(0, 50);
  row.updatedAt = Math.floor(Date.now() / 1000);
  all[key] = row;
  writeEnrollments(all);
  return row;
}

export function readFeed() {
  return readJson(FEED_FILE, []);
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
  return row;
}
