import { useState } from 'react';
import type { TradeRow } from '../../hooks/useAgentStatus';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

function outcomeColor(outcome?: string | null) {
  if (outcome === 'win') return '#27AE60';
  if (outcome === 'loss') return '#C0392B';
  if (outcome === 'pending') return '#F69D39';
  return '#888';
}

function outcomeLabel(outcome?: string | null) {
  if (outcome === 'win') return 'WIN';
  if (outcome === 'loss') return 'LOSS';
  if (outcome === 'pending') return 'PENDING';
  return '—';
}

interface AgentTradeLogProps {
  trades: TradeRow[];
  poolSummary?: {
    totalPoolTusdc: number;
    totalWonTusdc: number;
    totalLostTusdc: number;
    netPnlTusdc: number;
    pendingCount: number;
  };
}

export default function AgentTradeLog({ trades, poolSummary }: AgentTradeLogProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!trades.length) {
    return <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>Trades appear here as the agent executes.</p>;
  }

  return (
    <div>
      {poolSummary ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
          border: '1px solid rgba(13,11,8,0.15)', marginBottom: 16,
        }}>
          {[
            { label: 'Total Pool', value: `${poolSummary.totalPoolTusdc} TUSDC` },
            { label: 'Net P&L', value: `${poolSummary.netPnlTusdc >= 0 ? '+' : ''}${poolSummary.netPnlTusdc} TUSDC`, color: poolSummary.netPnlTusdc >= 0 ? '#27AE60' : '#C0392B' },
            { label: 'Pending', value: String(poolSummary.pendingCount) },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              padding: '12px 14px',
              borderRight: i < 2 ? '1px solid rgba(13,11,8,0.15)' : 'none',
            }}>
              <p style={S.label}>{stat.label}</p>
              <p style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: stat.color || '#0D0B08', margin: '4px 0 0' }}>{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trades.map((row) => {
          const id = row.hash || `${row.roundId}-${row.side}-${row.at}`;
          const expanded = openId === id;
          return (
            <li key={id} style={{ border: '1px solid rgba(13,11,8,0.15)' }}>
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : id)}
                style={{
                  width: '100%', textAlign: 'left', background: expanded ? 'rgba(13,11,8,0.03)' : 'transparent',
                  border: 'none', padding: '12px 16px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ ...S.mono, fontSize: 12, color: '#3A3530' }}>
                    {row.symbol} · {row.side} · {row.amountTusdc} TUSDC
                    {row.roundId ? ` · R#${row.roundId}` : ''}
                  </span>
                  <span style={{
                    ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    color: outcomeColor(row.outcome), padding: '2px 8px',
                    border: `1px solid ${outcomeColor(row.outcome)}44`,
                  }}>
                    {outcomeLabel(row.outcome)}
                  </span>
                </div>
              </button>
              {expanded ? (
                <div style={{ borderTop: '1px solid rgba(13,11,8,0.1)', padding: '12px 16px', ...S.mono, fontSize: 11, color: '#5A554E' }}>
                  <p>Amount: <strong>{row.amountTusdc} TUSDC</strong></p>
                  <p>Side: <strong>{row.side}</strong> · Symbol: <strong>{row.symbol}</strong></p>
                  {row.roundId ? <p>Round: <strong>#{row.roundId}</strong></p> : null}
                  {row.pnlTusdc != null ? (
                    <p>P&L: <strong style={{ color: row.pnlTusdc >= 0 ? '#27AE60' : '#C0392B' }}>
                      {row.pnlTusdc >= 0 ? '+' : ''}{row.pnlTusdc} TUSDC
                    </strong></p>
                  ) : null}
                  {row.outcomeNote ? <p style={{ fontStyle: 'italic', marginTop: 8 }}>{row.outcomeNote}</p> : null}
                  {row.hash ? (
                    <a href={`${SNOWTRACE}${row.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#F69D39', textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
                      View transaction ↗
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
