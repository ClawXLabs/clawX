import Link from 'next/link';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import type { AgentData } from './AgentCard';
import AgentIcon from './AgentIcon';
import AgentBadgeRow from './AgentBadgeRow';
import AgentSwitchModal from './AgentSwitchModal';
import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';
import { readBrowserCache, writeBrowserCache } from '../../utils/browserCache';

const CATALOG_NS = 'agent-catalog';
const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#888',
  } as React.CSSProperties,
};

function redBtn(solid = true): React.CSSProperties {
  return {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    cursor: 'pointer',
    border: `1px solid ${RED}`,
    background: solid ? RED : 'transparent',
    color: solid ? '#FAF8F3' : RED,
  };
}

export default function AgentsLobby() {
  const { enrolled, status, account, refresh } = useAgentEnrollment(4000);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pausing, setPausing] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  useLayoutEffect(() => {
    const cached = readBrowserCache<{ agents: AgentData[] }>(CATALOG_NS);
    if (cached?.agents?.length) {
      setAgents(cached.agents);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const catalogRes = await fetch('/api/agents/catalog');
        const catalog = (await catalogRes.json()) as { agents?: AgentData[] };
        const next = catalog.agents || [];
        if (!cancelled) {
          setAgents(next);
          writeBrowserCache(CATALOG_NS, { agents: next });
        }
      } catch {
        if (!cancelled && agents.length === 0) setAgents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agent = status?.agent;
  const delegate = status?.delegate;
  const tr = status?.trackRecord;
  const isPaused = !!delegate?.paused;
  const needsRedeploy = !!delegate?.needsRedeploy;
  const statusColor = needsRedeploy ? RED : isPaused ? '#F69D39' : '#27AE60';
  const statusText = needsRedeploy ? 'Action needed' : isPaused ? 'Paused' : 'Live';

  const togglePause = async () => {
    if (!account || needsRedeploy) return;
    setPausing(true);
    try {
      await fetch('/api/agents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: account, paused: !isPaused }),
      });
      await refresh({ silent: true });
    } finally {
      setPausing(false);
    }
  };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 64px' }}>
      {account ? (
        <AgentSwitchModal
          open={switchOpen}
          wallet={account}
          activeAgentId={agent?.id}
          onClose={() => setSwitchOpen(false)}
        />
      ) : null}

      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: '2px solid #0D0B08',
          paddingBottom: 16,
          marginBottom: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${RED}`,
              color: RED,
            }}
          >
            <Bot size={18} strokeWidth={1.5} />
          </div>
          <h1 style={{ ...S.serif, fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: '#0D0B08', margin: 0 }}>
            Agents
          </h1>
        </div>
        <Link href={enrolled ? '/agents/dashboard' : '/agents/new'} style={{ textDecoration: 'none' }}>
          <span style={redBtn(true)}>{enrolled ? 'Dashboard' : 'New Agent'}</span>
        </Link>
      </header>

      {account && enrolled && status ? (
        <section style={{ border: '2px solid #0D0B08', padding: '22px 22px', marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #0D0B08',
                  background: `${agent?.color || RED}15`,
                  flexShrink: 0,
                }}
              >
                <AgentIcon agentId={agent?.id} size={26} color={agent?.color || RED} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    ...S.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: statusColor,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: statusColor,
                      display: 'inline-block',
                    }}
                  />
                  {statusText}
                </p>
                <p style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: '4px 0 0' }}>
                  {agent?.name}
                </p>
                <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  {agent?.handle} · {status.enrollment?.tradeSizeTusdc ?? '—'} TUSDC / trade
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {!needsRedeploy ? (
                <button type="button" onClick={togglePause} disabled={pausing} style={redBtn(false)}>
                  {pausing ? '…' : isPaused ? 'Resume' : 'Pause'}
                </button>
              ) : null}
              <button type="button" onClick={() => setSwitchOpen(true)} style={redBtn(false)}>
                Switch
              </button>
              <Link href="/agents/dashboard" style={{ textDecoration: 'none' }}>
                <span style={redBtn(true)}>Open Dashboard</span>
              </Link>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 0,
              borderTop: '1px solid #0D0B08',
            }}
          >
            {[
              { label: 'AUM', value: `$${status.aum?.toLocaleString() ?? '—'}` },
              {
                label: 'Return',
                value: `${(status.returnPct ?? 0) >= 0 ? '▲ +' : '▼ '}${status.returnPct ?? 0}%`,
                color: (status.returnPct ?? 0) >= 0 ? '#27AE60' : RED,
              },
              { label: 'Open', value: String(status.openPositions?.length ?? 0) },
              { label: 'Wins', value: String(tr?.wins ?? 0), color: '#27AE60' },
              { label: 'Losses', value: String(tr?.losses ?? 0), color: RED },
              {
                label: 'Win rate',
                value: tr?.winRate != null ? `${tr.winRate}%` : '—',
              },
              {
                label: 'Budget left',
                value:
                  delegate?.remainingTusdc != null ? `${delegate.remainingTusdc} TUSDC` : '—',
              },
              {
                label: 'Pending',
                value: String(status.poolSummary?.pendingCount ?? status.pendingSettlements?.length ?? 0),
              },
            ].map((stat, i, arr) => (
              <div
                key={stat.label}
                style={{
                  padding: '14px 12px',
                  borderRight: i < arr.length - 1 ? '1px solid rgba(13,11,8,0.15)' : 'none',
                }}
              >
                <p style={S.label}>{stat.label}</p>
                <p
                  style={{
                    ...S.serif,
                    fontSize: 20,
                    fontWeight: 900,
                    color: stat.color || '#0D0B08',
                    margin: '4px 0 0',
                  }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {(status.openPositions?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 16, borderTop: '1px solid rgba(13,11,8,0.15)', paddingTop: 14 }}>
              <p style={{ ...S.label, marginBottom: 10 }}>Open positions</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(status.openPositions || []).map((pos) => (
                  <span
                    key={pos.roundId}
                    style={{
                      ...S.mono,
                      fontSize: 11,
                      border: '1px solid #0D0B08',
                      padding: '6px 10px',
                    }}
                  >
                    {pos.symbol} · R#{pos.roundNumber} ·{' '}
                    <strong style={{ color: pos.side === 'UP' ? '#27AE60' : RED }}>{pos.side}</strong>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          {account && !enrolled ? (
            <section
              style={{
                border: `1px solid ${RED}`,
                background: 'rgba(192,57,43,0.04)',
                padding: '14px 16px',
                marginBottom: 24,
                ...S.mono,
                fontSize: 12,
                color: RED,
              }}
            >
              No active agent — pick a badge below to deploy.
            </section>
          ) : null}

          <div style={{ marginBottom: 12 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
              Choose an agent
            </h2>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '6px 0 0' }}>
              {loading ? 'Loading…' : 'One row on large screens · tap a badge to start'}
            </p>
          </div>
          <AgentBadgeRow
            agents={agents}
            loading={loading}
            onSelect={(a) => {
              window.location.href = `/agents/new?agent=${encodeURIComponent(a.id)}`;
            }}
          />
        </>
      )}
    </div>
  );
}
