import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AgentFeed from './AgentFeed';
import MyAgentBar from './MyAgentBar';
import AgentTradeLog from './AgentTradeLog';
import MatchHistoryPanel from './MatchHistoryPanel';
import PendingSettlementsPanel from './PendingSettlementsPanel';
import AgentControlBar from './AgentControlBar';
import { useWallet } from '../../contexts/WalletContext';
import { useAgentFeedBroadcast } from '../../hooks/useAgentFeedBroadcast';
import { useAgentStatus } from '../../hooks/useAgentStatus';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
  section: { border: '1px solid #0D0B08', padding: '24px 20px' } as React.CSSProperties,
};

export default function AgentDashboard() {
  const router = useRouter();
  const { account, connectWallet } = useWallet();
  const { status, error, stale, refresh } = useAgentStatus(3000);
  const [matchFilter, setMatchFilter] = useState<'win' | 'loss' | 'all'>('all');
  const [matchOpen, setMatchOpen] = useState(false);
  const { messages: feed, connected: feedLive, error: feedError } = useAgentFeedBroadcast({ limit: 60 });

  useEffect(() => {
    if (status && !status.enrolled) router.replace('/agents/new');
  }, [status, router]);

  if (!account) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ ...S.serif, fontSize: 26, fontWeight: 900, color: '#0D0B08' }}>Connect Wallet</h1>
        <p style={{ ...S.serif, fontSize: 15, color: '#5A554E', marginTop: 8 }}>Connect MetaMask on Fuji to view your agent.</p>
        <button type="button" onClick={connectWallet} style={{
          background: '#0D0B08', color: '#FAF8F3', border: 'none',
          padding: '14px 28px', marginTop: 24, ...S.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Connect Wallet</button>
      </div>
    );
  }

  if (status && !status.enrolled) return null;

  const agent = status?.agent;
  const up = (status?.returnPct ?? 0) >= 0;
  const tr = status?.trackRecord;
  const delegate = status?.delegate;
  const isPaused = delegate?.paused;
  const statusLabel = delegate?.needsRedeploy
    ? 'Cap reached · re-deploy required'
    : isPaused
      ? 'Paused · no new trades'
      : 'Active · auto-trading';
  const statusColor = delegate?.needsRedeploy ? '#C0392B' : isPaused ? '#F69D39' : '#27AE60';

  return (
    <>
      <MyAgentBar />
      <MatchHistoryPanel
        open={matchOpen}
        filter={matchFilter}
        matches={status?.matchHistory || []}
        onClose={() => setMatchOpen(false)}
      />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          {(error || stale) && (
            <div style={{
              border: `1px solid ${stale ? '#F69D39' : '#C0392B'}`,
              background: stale ? 'rgba(246,157,57,0.06)' : 'rgba(192,57,43,0.06)',
              padding: '12px 16px', ...S.mono, fontSize: 12,
              color: stale ? '#F69D39' : '#C0392B', marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <section style={{ ...S.section, borderWidth: 2 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{
                  width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, border: '1px solid #0D0B08',
                  background: `${agent?.color || '#C0392B'}18`,
                }}>{agent?.emoji}</span>
                <div>
                  <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: statusColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                    {statusLabel}
                  </p>
                  <h1 style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: '4px 0 0' }}>{agent?.name}</h1>
                  <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 2 }}>{agent?.handle} · {status?.enrollment?.tradeSizeTusdc} TUSDC/trade</p>
                </div>
              </div>
              <span style={{
                border: `1px solid ${statusColor}`, color: statusColor,
                padding: '6px 14px', ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                {isPaused ? 'PAUSED' : delegate?.needsRedeploy ? 'STOPPED' : 'LIVE'}
              </span>
            </div>

            <div style={{ marginTop: 20 }}>
              <AgentControlBar wallet={account} delegate={delegate} onRefresh={() => refresh({ silent: true })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 20, borderTop: '1px solid #0D0B08' }}>
              {[
                { label: 'Your AUM', value: `$${status?.aum?.toLocaleString() ?? '—'}` },
                { label: 'Return', value: `${up ? '+' : ''}${status?.returnPct ?? 0}%`, color: up ? '#27AE60' : '#C0392B' },
                { label: 'Open Positions', value: String(status?.openPositions?.length ?? 0) },
                {
                  label: 'Wins',
                  value: String(tr?.wins ?? 0),
                  color: '#27AE60',
                  clickable: true,
                  onClick: () => { setMatchFilter('win'); setMatchOpen(true); },
                },
                {
                  label: 'Losses',
                  value: String(tr?.losses ?? 0),
                  color: '#C0392B',
                  clickable: true,
                  onClick: () => { setMatchFilter('loss'); setMatchOpen(true); },
                },
                { label: 'Win Rate', value: tr?.winRate != null ? `${tr.winRate}%` : '—' },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  role={stat.clickable ? 'button' : undefined}
                  tabIndex={stat.clickable ? 0 : undefined}
                  onClick={stat.onClick}
                  onKeyDown={stat.clickable ? (e) => { if (e.key === 'Enter') stat.onClick?.(); } : undefined}
                  style={{
                    padding: '16px 14px',
                    borderRight: (i + 1) % 3 !== 0 ? '1px solid #0D0B08' : 'none',
                    borderBottom: i < 3 ? '1px solid #0D0B08' : 'none',
                    cursor: stat.clickable ? 'pointer' : 'default',
                  }}
                >
                  <p style={S.label}>{stat.label}{stat.clickable ? ' ↗' : ''}</p>
                  <p style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: stat.color || '#0D0B08', margin: '4px 0 0' }}>{stat.value}</p>
                </div>
              ))}
            </div>

            {tr ? (
              <div style={{ marginTop: 16, padding: '14px 16px', border: '1px solid rgba(13,11,8,0.15)', background: 'rgba(13,11,8,0.02)' }}>
                <p style={S.label}>Track record</p>
                <p style={{ ...S.serif, fontSize: 14, color: '#0D0B08', margin: '6px 0 0' }}>{tr.summary}</p>
                <button
                  type="button"
                  onClick={() => { setMatchFilter('all'); setMatchOpen(true); }}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 8, ...S.mono, fontSize: 10, color: '#1A6EA8', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  View full match history →
                </button>
              </div>
            ) : null}

            <Link href="/agents" style={{ textDecoration: 'none' }}>
              <span style={{ ...S.mono, fontSize: 10, color: '#888', display: 'inline-block', marginTop: 10 }}>← All agents</span>
            </Link>
          </section>

          <section style={{ ...S.section, marginTop: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', marginBottom: 4 }}>Pending Settlement</h2>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 16 }}>
              Trades placed but not yet resolved on-chain. Rounds auto-settle when the timer ends.
            </p>
            <PendingSettlementsPanel items={status?.pendingSettlements || []} />
          </section>

          <section style={{ ...S.section, marginTop: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', marginBottom: 4 }}>AI Reasoning</h2>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 16 }}>
              Mode: {status?.enrollment?.agentMemory?.aiMode === 'llm' ? 'Live LLM' : 'Simulated AI'} — learns from settled rounds.
            </p>
            {(status?.enrollment?.agentMemory?.recentThoughts || []).length === 0 ? (
              <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>Watching markets for the next setup…</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(status?.enrollment?.agentMemory?.recentThoughts || []).map((row) => (
                  <li key={row.at} style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 16px', ...S.mono, fontSize: 13, color: '#3A3530' }}>
                    {row.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ ...S.section, marginTop: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', marginBottom: 16 }}>Live Positions</h2>
            {(status?.openPositions || []).length === 0 ? (
              <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>No open positions — scanning next 5m round</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(status?.openPositions || []).map((pos) => (
                  <li key={pos.roundId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid rgba(13,11,8,0.15)', padding: '12px 16px' }}>
                    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#0D0B08' }}>{pos.symbol} · Round #{pos.roundNumber}</span>
                    <span style={{
                      padding: '2px 10px', ...S.mono, fontSize: 9, fontWeight: 700,
                      background: pos.side === 'UP' ? '#27AE60' : '#C0392B', color: '#FAF8F3',
                    }}>{pos.side}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ ...S.section, marginTop: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', marginBottom: 4 }}>Agent Trades</h2>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 16 }}>
              Click any row to expand amount, outcome, and transaction link.
            </p>
            <AgentTradeLog
              trades={status?.enrichedTradeLog || status?.tradeLog || []}
              poolSummary={status?.poolSummary}
            />
          </section>
        </div>

        <div>
          <AgentFeed messages={feed} title="Agent Comms" connected={feedLive} error={feedError} />
        </div>
      </div>
    </>
  );
}
