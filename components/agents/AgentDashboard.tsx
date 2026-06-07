import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AgentFeed from './AgentFeed';
import MyAgentBar from './MyAgentBar';
import { useWallet } from '../../contexts/WalletContext';
import { useAgentFeedBroadcast } from '../../hooks/useAgentFeedBroadcast';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';

/* ─── Types ─────────────────────────────────────────────────────── */

interface AgentStatus {
  enrolled: boolean;
  agent?: { name: string; emoji: string; handle: string; color: string };
  aum?: number;
  returnPct?: number;
  openPositions?: Array<{ roundId: string; symbol: string; roundNumber: number; side: string }>;
  tradeLog?: Array<{ hash?: string; at: string; action: string; side: string; symbol: string; amountTusdc: number }>;
  enrollment?: {
    tradeSizeTusdc?: number;
    agentMemory?: {
      aiMode?: string;
      recentThoughts?: Array<{ at: string; text: string }>;
      journal?: Array<{ at: number; type: string; text: string }>;
    };
  };
  trackRecord?: {
    wins: number;
    losses: number;
    settled: number;
    winRate: number | null;
    totalTrades: number;
    pendingOutcomes: number;
    summary: string;
    bySymbol: Array<{ symbol: string; wins: number; losses: number; lastResult: string | null; lastSide: string | null }>;
  };
}

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
  section: { border: '1px solid #0D0B08', padding: '24px 20px' } as React.CSSProperties,
};

/* ─── Component ─────────────────────────────────────────────────── */

export default function AgentDashboard() {
  const router = useRouter();
  const { account, connectWallet } = useWallet();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState('');
  const { messages: feed, connected: feedLive, error: feedError } = useAgentFeedBroadcast({ limit: 60 });

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const load = async () => {
      try {
        const statusRes = await fetch(`/api/agents/status?wallet=${account}`);
        const statusJson = await statusRes.json() as AgentStatus;
        if (!cancelled) {
          if (!statusJson.enrolled) { router.replace('/agents/new'); return; }
          setStatus(statusJson);
        }
      } catch (e: unknown) {
        const err = e as { message?: string };
        if (!cancelled) setError(err.message || 'Failed to load');
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [account, router]);

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

  const agent = status?.agent;
  const up = (status?.returnPct ?? 0) >= 0;
  const tr = status?.trackRecord;

  return (
    <>
      <MyAgentBar />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          {error && (
            <div style={{ border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 20 }}>{error}</div>
          )}

          {/* ── Header card ──────────────────────────── */}
          <section style={{ ...S.section, borderWidth: 2 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{
                  width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, border: '1px solid #0D0B08',
                  background: `${agent?.color || '#C0392B'}18`,
                }}>{agent?.emoji}</span>
                <div>
                  <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#27AE60', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} /> Active · auto-trading
                  </p>
                  <h1 style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: '4px 0 0' }}>{agent?.name}</h1>
                  <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 2 }}>{agent?.handle} · {status?.enrollment?.tradeSizeTusdc} TUSDC/trade</p>
                </div>
              </div>
              <span style={{ border: '1px solid #27AE60', color: '#27AE60', padding: '6px 14px', ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} /> LIVE
              </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 20, borderTop: '1px solid #0D0B08' }}>
              {[
                { label: 'Your AUM', value: `$${status?.aum?.toLocaleString() ?? '—'}` },
                { label: 'Return', value: `${up ? '+' : ''}${status?.returnPct ?? 0}%`, color: up ? '#27AE60' : '#C0392B' },
                { label: 'Open Positions', value: String(status?.openPositions?.length ?? 0) },
                { label: 'Wins', value: String(tr?.wins ?? 0), color: '#27AE60' },
                { label: 'Losses', value: String(tr?.losses ?? 0), color: '#C0392B' },
                { label: 'Win Rate', value: tr?.winRate != null ? `${tr.winRate}%` : '—' },
              ].map((stat, i) => (
                <div key={stat.label} style={{
                  padding: '16px 14px',
                  borderRight: (i + 1) % 3 !== 0 ? '1px solid #0D0B08' : 'none',
                  borderBottom: i < 3 ? '1px solid #0D0B08' : 'none',
                }}>
                  <p style={S.label}>{stat.label}</p>
                  <p style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: stat.color || '#0D0B08', margin: '4px 0 0' }}>{stat.value}</p>
                </div>
              ))}
            </div>

            {tr ? (
              <div style={{ marginTop: 16, padding: '14px 16px', border: '1px solid rgba(13,11,8,0.15)', background: 'rgba(13,11,8,0.02)' }}>
                <p style={S.label}>Track record</p>
                <p style={{ ...S.serif, fontSize: 14, color: '#0D0B08', margin: '6px 0 0' }}>{tr.summary}</p>
                <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 6 }}>
                  {tr.totalTrades} on-chain trades · {tr.pendingOutcomes} awaiting settlement
                </p>
                {tr.bySymbol.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {tr.bySymbol.map((row) => (
                      <span key={row.symbol} style={{
                        ...S.mono, fontSize: 9, padding: '4px 8px',
                        border: '1px solid rgba(13,11,8,0.15)',
                        color: row.lastResult === 'win' ? '#27AE60' : row.lastResult === 'loss' ? '#C0392B' : '#888',
                      }}>
                        {row.symbol} {row.wins}W/{row.losses}L
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p style={{ ...S.serif, fontSize: 13, color: '#888', marginTop: 16 }}>
              Your agent scans every market with small clips. Keep <code style={{ ...S.mono, fontSize: 11, background: 'rgba(13,11,8,0.06)', padding: '2px 6px' }}>npm run agent-runner</code> running.
            </p>
            <Link href="/agents" style={{ textDecoration: 'none' }}>
              <span style={{ ...S.mono, fontSize: 10, color: '#888', display: 'inline-block', marginTop: 10 }}>← All agents</span>
            </Link>
          </section>

          {/* ── AI Thoughts ──────────────────────────── */}
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

          {/* ── Live Positions ────────────────────────── */}
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

          {/* ── Trade Activity ────────────────────────── */}
          <section style={{ ...S.section, marginTop: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', marginBottom: 16 }}>Automatic Transactions</h2>
            {(status?.tradeLog || []).length === 0 ? (
              <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>Trades appear here as the agent executes</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(status?.tradeLog || []).map((row) => (
                  <li key={row.hash || row.at} style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ ...S.mono, fontSize: 12, color: '#3A3530' }}>{row.action} {row.side} · {row.symbol} · {row.amountTusdc} TUSDC</span>
                      {row.hash && (
                        <a href={`${SNOWTRACE}${row.hash}`} target="_blank" rel="noopener noreferrer" style={{ ...S.mono, fontSize: 10, color: '#F69D39', textDecoration: 'none' }}>
                          Tx ↗
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: feed */}
        <div>
          <AgentFeed messages={feed} title="Agent Comms" connected={feedLive} error={feedError} />
        </div>
      </div>
    </>
  );
}
