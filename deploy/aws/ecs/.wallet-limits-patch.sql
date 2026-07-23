-- Ensure wallet_limits has admin-controlled agent spend / trade size columns
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
ALTER TABLE wallet_limits ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE wallet_limits ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'wallet_limits'
ORDER BY ordinal_position;
