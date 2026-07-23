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

-- ── Admin / platform control plane (shared with clawX-admin) ──────────────

CREATE TABLE IF NOT EXISTS platform_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  faucet_amount_tusdc NUMERIC NOT NULL DEFAULT 300,
  faucet_cooldown_sec INTEGER NOT NULL DEFAULT 86400,
  faucet_paused BOOLEAN NOT NULL DEFAULT false,
  trading_paused BOOLEAN NOT NULL DEFAULT false,
  agents_paused BOOLEAN NOT NULL DEFAULT false,
  claims_paused BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  announcement_published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ranking_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  xp_per_trade INTEGER NOT NULL DEFAULT 2,
  xp_per_win INTEGER NOT NULL DEFAULT 5,
  xp_streak_per_day INTEGER NOT NULL DEFAULT 10,
  xp_streak_cap INTEGER NOT NULL DEFAULT 100,
  xp_twitter INTEGER NOT NULL DEFAULT 50,
  xp_telegram INTEGER NOT NULL DEFAULT 50,
  trade_milestones JSONB NOT NULL DEFAULT '[{"trades":10,"xp":25},{"trades":50,"xp":100},{"trades":100,"xp":250},{"trades":500,"xp":1000}]'::jsonb,
  winrate_milestones JSONB NOT NULL DEFAULT '[{"rate":50,"xp":50},{"rate":60,"xp":100},{"rate":70,"xp":200}]'::jsonb,
  level_xp_step INTEGER NOT NULL DEFAULT 500,
  sort_primary TEXT NOT NULL DEFAULT 'xp',
  sort_secondary TEXT NOT NULL DEFAULT 'txCount',
  ledger_included BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ranking_config (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS leaderboard_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sort_metric TEXT NOT NULL DEFAULT 'xp',
  sort_secondary TEXT NOT NULL DEFAULT 'txCount',
  window_type TEXT NOT NULL DEFAULT 'all_time',
  rolling_days INTEGER,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  campaign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lb_filters_primary ON leaderboard_filters(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_lb_filters_enabled ON leaderboard_filters(enabled, sort_order);

INSERT INTO leaderboard_filters (slug, label, description, is_primary, sort_order, sort_metric, window_type)
VALUES
  ('all-time', 'All Time', 'Lifetime rankings across all trades', true, 0, 'xp', 'all_time'),
  ('last-7d', 'Last 7 Days', 'Trades in the last 7 days', false, 1, 'txCount', 'rolling_days'),
  ('last-30d', 'Last 30 Days', 'Trades in the last 30 days', false, 2, 'txCount', 'rolling_days')
ON CONFLICT (slug) DO NOTHING;

UPDATE leaderboard_filters SET rolling_days = 7 WHERE slug = 'last-7d' AND rolling_days IS NULL;
UPDATE leaderboard_filters SET rolling_days = 30 WHERE slug = 'last-30d' AND rolling_days IS NULL;

CREATE TABLE IF NOT EXISTS xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'admin',
  source_id TEXT,
  admin_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_wallet ON xp_ledger(wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_limits (
  wallet TEXT PRIMARY KEY,
  tx_limit INTEGER,
  tx_unlimited BOOLEAN NOT NULL DEFAULT true,
  faucet_blocked BOOLEAN NOT NULL DEFAULT false,
  relayer_blocked BOOLEAN NOT NULL DEFAULT false,
  agent_spend_limit_tusdc NUMERIC,
  agent_spend_unlimited BOOLEAN NOT NULL DEFAULT true,
  agent_trade_size_tusdc NUMERIC,
  admin_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE wallet_limits ADD COLUMN IF NOT EXISTS agent_spend_limit_tusdc NUMERIC;
ALTER TABLE wallet_limits ADD COLUMN IF NOT EXISTS agent_spend_unlimited BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE wallet_limits ADD COLUMN IF NOT EXISTS agent_trade_size_tusdc NUMERIC;

CREATE TABLE IF NOT EXISTS airdrop_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,
  amount_tusdc NUMERIC NOT NULL,
  tx_hash TEXT,
  mode TEXT NOT NULL DEFAULT 'single',
  batch_id UUID,
  admin_id TEXT,
  admin_email TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_airdrop_created ON airdrop_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_airdrop_wallet ON airdrop_log(wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'transaction',
  status TEXT NOT NULL DEFAULT 'open',
  subject TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tx_hash TEXT,
  round_id BIGINT,
  action TEXT,
  error_message TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_notes TEXT NOT NULL DEFAULT '',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_wallet ON support_tickets(wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'social_submission',
  status TEXT NOT NULL DEFAULT 'draft',
  platform TEXT NOT NULL DEFAULT 'x',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  score_xp_map JSONB NOT NULL DEFAULT '{"1":10,"2":25,"3":50,"4":100,"5":200}'::jsonb,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, start_at DESC);

CREATE TABLE IF NOT EXISTS campaign_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  post_url TEXT NOT NULL,
  platform_handle TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_score INTEGER,
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  xp_awarded INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, wallet, post_url)
);
CREATE INDEX IF NOT EXISTS idx_campaign_subs_status
  ON campaign_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id TEXT,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_wallet TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
