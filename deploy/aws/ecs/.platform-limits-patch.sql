ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS default_tx_unlimited BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS default_tx_limit INTEGER;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS default_agent_spend_unlimited BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS default_agent_spend_limit_tusdc NUMERIC;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS default_agent_trade_size_tusdc NUMERIC;
