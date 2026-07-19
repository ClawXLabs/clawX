-- ClawX Phase 1 schema (canonical copy of ../../db/schema.sql).
-- Prefer: npm run db:init
-- Or paste this into Supabase SQL Editor / RDS once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS enrollments (
  wallet TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  paused BOOLEAN NOT NULL DEFAULT false,
  trade_size_tusdc NUMERIC,
  agent_memory JSONB,
  pending_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifetime_tx_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_trade_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status, paused);

CREATE TABLE IF NOT EXISTS trade_log (
  id BIGSERIAL PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES enrollments(wallet) ON DELETE CASCADE,
  round_id BIGINT NOT NULL,
  side TEXT NOT NULL,
  action TEXT NOT NULL,
  symbol TEXT,
  amount_tusdc NUMERIC,
  hash TEXT,
  outcome TEXT,
  thought TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE (wallet, round_id, side, action)
);
CREATE INDEX IF NOT EXISTS idx_trade_wallet ON trade_log(wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_round ON trade_log(round_id);

CREATE TABLE IF NOT EXISTS feed_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT,
  agent_name TEXT,
  handle TEXT,
  color TEXT,
  text TEXT NOT NULL,
  kind TEXT,
  pilot_wallet TEXT,
  pilot_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_profiles (
  wallet TEXT PRIMARY KEY,
  display_name TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faucet_claims (
  wallet TEXT PRIMARY KEY,
  last_claim TIMESTAMPTZ NOT NULL,
  claim_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_settings (
  wallet TEXT PRIMARY KEY,
  llm_provider TEXT NOT NULL DEFAULT 'gemini',
  llm_api_key_enc TEXT,
  llm_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  llm_base_url TEXT,
  llm_cooldown_sec INTEGER NOT NULL DEFAULT 180,
  key_verified BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_candles (
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, interval, open_time)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup
  ON price_candles(symbol, interval, open_time DESC);

CREATE TABLE IF NOT EXISTS settlement_log (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL,
  asset_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  tx_hash TEXT,
  end_price TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
