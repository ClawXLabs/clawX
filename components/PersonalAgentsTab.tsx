import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';

// ─── types ───────────────────────────────────────────────────────────────────

interface SymbolStat {
  symbol: string;
  trades: number;
  spend: number;
}

interface AgentStat {
  agentId: string;
  agentName: string;
  emoji: string;
  color: string;
  status: 'active' | 'retired';
  txCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPoolSpend: number;
  bySymbol: SymbolStat[];
  tradeLog: any[];
}

interface Combined {
  txCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPoolSpend: number;
  agentCount: number;
}

interface HistoryData {
  hasAgent: boolean;
  agents: AgentStat[];
  combined: Combined;
}

// ─── tiny style primitives ────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
const serif: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };
const card: React.CSSProperties = {
  background: '#FDF6EC',
  border: '1.5px solid #D4A96A',
  borderRadius: 10,
  padding: '18px 22px',
};

// ─── small helpers ────────────────────────────────────────────────────────────

function WinRateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span style={{ ...mono, fontSize: 11, color: '#888' }}>–</span>;
  const color = rate >= 60 ? '#22c55e' : rate >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <span
      style={{
        ...mono,
        fontSize: 12,
        fontWeight: 700,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        borderRadius: 5,
        padding: '1px 7px',
      }}
    >
      {rate}%
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: isActive ? '#22c55e' : '#888',
        boxShadow: isActive ? '0 0 6px #22c55e88' : 'none',
        marginRight: 5,
      }}
    />
  );
}

// ─── Combined stats card ──────────────────────────────────────────────────────

function CombinedCard({ combined }: { combined: Combined }) {
  const stats = [
    { label: 'Total Agents', value: combined.agentCount },
    { label: 'Total Trades', value: combined.txCount },
    { label: 'Wins', value: combined.wins },
    { label: 'Losses', value: combined.losses },
    { label: 'Pool Spend', value: `${combined.totalPoolSpend} TUSDC` },
  ];
  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>📊</span>
        <span style={{ ...serif, fontSize: 16, fontWeight: 700, color: '#0D0B08' }}>All Agents Combined</span>
        <WinRateBadge rate={combined.winRate} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {stats.map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: '#FAF0E1',
              border: '1px solid #E8D5B0',
              borderRadius: 8,
              padding: '10px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: '#0D0B08' }}>{value}</div>
            <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single agent card ────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentStat }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        ...card,
        borderLeft: `4px solid ${agent.color}`,
        marginBottom: 14,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }}>{agent.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={agent.status} />
            <span style={{ ...serif, fontSize: 15, fontWeight: 800, color: '#0D0B08' }}>
              {agent.agentName}
            </span>
            <span
              style={{
                ...mono,
                fontSize: 9,
                color: agent.status === 'active' ? '#22c55e' : '#888',
                border: `1px solid ${agent.status === 'active' ? '#22c55e55' : '#88888855'}`,
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              {agent.status.toUpperCase()}
            </span>
          </div>
          <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginTop: 2 }}>
            @{agent.agentId}
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#0D0B08' }}>{agent.txCount}</div>
            <div style={{ ...mono, fontSize: 9, color: '#7B6A52' }}>TXS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{agent.wins}W</div>
            <div style={{ ...mono, fontSize: 9, color: '#7B6A52' }}>WINS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{agent.losses}L</div>
            <div style={{ ...mono, fontSize: 9, color: '#7B6A52' }}>LOSSES</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <WinRateBadge rate={agent.winRate} />
            <div style={{ ...mono, fontSize: 9, color: '#7B6A52', marginTop: 2 }}>WIN %</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#0D0B08' }}>
              {agent.totalPoolSpend}
            </div>
            <div style={{ ...mono, fontSize: 9, color: '#7B6A52' }}>TUSDC SPENT</div>
          </div>
          <span style={{ ...mono, fontSize: 11, color: '#7B6A52' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded: symbol breakdown + recent trades */}
      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid #E8D5B0', paddingTop: 14 }}>
          {/* Per-symbol */}
          {agent.bySymbol.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 8 }}>
                MARKETS TRADED
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {agent.bySymbol.map((s) => (
                  <div
                    key={s.symbol}
                    style={{
                      background: '#FAF0E1',
                      border: '1px solid #E8D5B0',
                      borderRadius: 7,
                      padding: '6px 12px',
                      minWidth: 90,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#0D0B08' }}>
                      {s.symbol}
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: '#7B6A52' }}>
                      {s.trades} tx · {Math.round(s.spend * 10) / 10} T
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trades mini-list */}
          {agent.tradeLog.length > 0 && (
            <div>
              <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 8 }}>
                RECENT TRADES (last {Math.min(agent.tradeLog.length, 10)})
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {[...agent.tradeLog].reverse().slice(0, 10).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 0',
                      borderBottom: '1px solid #F0E4CE',
                    }}
                  >
                    <span
                      style={{
                        ...mono,
                        fontSize: 10,
                        fontWeight: 700,
                        color: t.side === 'UP' ? '#22c55e' : '#ef4444',
                        width: 22,
                      }}
                    >
                      {t.side === 'UP' ? '▲' : '▼'}
                    </span>
                    <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: '#0D0B08', width: 50 }}>
                      {t.symbol}
                    </span>
                    <span style={{ ...mono, fontSize: 10, color: '#7B6A52' }}>
                      Round #{t.roundId}
                    </span>
                    <span style={{ ...mono, fontSize: 10, color: '#0D0B08', marginLeft: 'auto' }}>
                      {t.amountTusdc} T
                    </span>
                    {t.outcome && (
                      <span
                        style={{
                          ...mono,
                          fontSize: 9,
                          fontWeight: 700,
                          color: t.outcome === 'WIN' ? '#22c55e' : '#ef4444',
                          border: `1px solid ${t.outcome === 'WIN' ? '#22c55e55' : '#ef444455'}`,
                          borderRadius: 4,
                          padding: '1px 5px',
                        }}
                      >
                        {t.outcome}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PersonalAgentsTab() {
  const { account: address, connectWallet } = useWallet();
  const isConnected = !!address;
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'combined' | 'separate'>('combined');

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/history?wallet=${address}`);
      if (r.ok) setData(await r.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  // ── not connected ──
  if (!isConnected || !address) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: '#7B6A52' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
        <div style={{ ...serif, fontSize: 15, marginBottom: 16 }}>Connect your wallet to see agent history.</div>
        <button
          onClick={connectWallet}
          style={{
            ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            background: '#0D0B08', color: '#FAF8F3', border: 'none',
            padding: '12px 28px', cursor: 'pointer',
          }}
        >
          CONNECT WALLET
        </button>
      </div>
    );
  }

  // ── loading ──
  if (loading && !data) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 40, color: '#7B6A52' }}>
        <div style={{ ...mono, fontSize: 13 }}>Loading agent history…</div>
      </div>
    );
  }

  // ── no agent enrolled ──
  if (data && !data.hasAgent) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
        <div style={{ ...serif, fontSize: 15, color: '#7B6A52' }}>
          No agent enrolled yet. Head to the{' '}
          <a href="/agents" style={{ color: '#D4A96A', textDecoration: 'underline' }}>
            Agents Lobby
          </a>{' '}
          to deploy your first agent.
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['combined', 'separate'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...mono,
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 16px',
              borderRadius: 7,
              border: '1.5px solid #D4A96A',
              cursor: 'pointer',
              background: view === v ? '#D4A96A' : 'transparent',
              color: view === v ? '#fff' : '#7B6A52',
              transition: 'all 0.15s',
            }}
          >
            {v === 'combined' ? '📊 Combined' : '🤖 Per Agent'}
          </button>
        ))}
        <button
          onClick={load}
          style={{
            ...mono,
            fontSize: 11,
            padding: '5px 12px',
            borderRadius: 7,
            border: '1px solid #D4A96A',
            cursor: 'pointer',
            background: 'transparent',
            color: '#7B6A52',
            marginLeft: 'auto',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Combined view */}
      {view === 'combined' && data.combined && (
        <>
          <CombinedCard combined={data.combined} />
          <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 12 }}>
            {data.agents.length} agent persona{data.agents.length !== 1 ? 's' : ''} — click any card for details
          </div>
          {data.agents.map((a) => (
            <AgentCard key={a.agentId} agent={a} />
          ))}
        </>
      )}

      {/* Separate / per-agent view */}
      {view === 'separate' && (
        <>
          {data.agents.length === 0 && (
            <div style={{ ...mono, fontSize: 13, color: '#7B6A52', textAlign: 'center', padding: 30 }}>
              No agent trade data yet.
            </div>
          )}
          {data.agents.map((a) => (
            <AgentCard key={a.agentId} agent={a} />
          ))}
        </>
      )}
    </div>
  );
}
