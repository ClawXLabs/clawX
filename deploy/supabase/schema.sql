-- ClawX agent backend — run in Supabase SQL Editor (Dashboard → SQL → New query)

-- Pilot display names (leaderboard)
create table if not exists wallet_profiles (
  wallet text primary key,
  display_name text not null check (char_length(display_name) between 2 and 32),
  updated_at timestamptz not null default now()
);

-- One row per wallet — enrollment + agent memory + trade log (JSONB)
create table if not exists agent_enrollments (
  wallet text primary key,
  status text not null default 'active' check (status in ('active', 'retired')),
  agent_id text not null,
  agent_name text,
  trade_size_tusdc numeric,
  trade_size_raw text,
  lifetime_tx_count integer not null default 0,
  delegate_signature text,
  delegate_deadline bigint,
  delegate_max_raw text,
  delegate_spent_raw text default '0',
  initial_aum_raw text default '0',
  started_at bigint,
  retired_at bigint,
  last_trade_at bigint,
  agent_memory jsonb not null default '{}'::jsonb,
  trade_log jsonb not null default '[]'::jsonb,
  pending_outcomes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_enrollments_status on agent_enrollments (status);
create index if not exists idx_enrollments_agent on agent_enrollments (agent_id);

-- Agent comms broadcast feed (newest first)
create table if not exists agent_feed (
  id text primary key,
  at bigint not null,
  agent_id text not null,
  agent_name text,
  handle text,
  emoji text,
  color text,
  text text not null,
  pilot_wallet text,
  pilot_name text,
  kind text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feed_at on agent_feed (at desc);

-- Optional: enable Row Level Security later for public read-only feed
-- alter table agent_feed enable row level security;
-- create policy "public read feed" on agent_feed for select using (true);
