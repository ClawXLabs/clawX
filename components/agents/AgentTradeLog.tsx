import Link from 'next/link';
import type { TradeRow } from '../../hooks/useAgentStatus';
import { marketTradePath } from '../../utils/marketLink';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';
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

function outcomeColor(outcome?: string | null) {
  if (outcome === 'win') return '#27AE60';
  if (outcome === 'loss') return RED;
  if (outcome === 'pending') return '#F69D39';
  return '#888';
}

function outcomeLabel(outcome?: string | null) {
  if (outcome === 'win') return 'WIN';
  if (outcome === 'loss') return 'LOSS';
  if (outcome === 'pending') return 'PENDING';
  return '—';
}

function shortHash(hash?: string) {
  if (!hash) return null;
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatWhen(at: number | string) {
  const n = typeof at === 'string' ? Date.parse(at) || Number(at) : Number(at);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
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
  if (!trades.length) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
        Trades appear here as the agent executes.
      </p>
    );
  }

  return (
    <div>
      {poolSummary ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 0,
            border: '1px solid rgba(13,11,8,0.15)',
            marginBottom: 16,
          }}
        >
          {[
            { label: 'Total Pool', value: `${poolSummary.totalPoolTusdc} TUSDC` },
            {
              label: 'Won',
              value: `${poolSummary.totalWonTusdc} TUSDC`,
              color: '#27AE60',
            },
            {
              label: 'Lost',
              value: `${poolSummary.totalLostTusdc} TUSDC`,
              color: RED,
            },
            {
              label: 'Net P&L',
              value: `${poolSummary.netPnlTusdc >= 0 ? '+' : ''}${poolSummary.netPnlTusdc} TUSDC`,
              color: poolSummary.netPnlTusdc >= 0 ? '#27AE60' : RED,
            },
            { label: 'Pending', value: String(poolSummary.pendingCount) },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              style={{
                padding: '12px 14px',
                borderRight: i < arr.length - 1 ? '1px solid rgba(13,11,8,0.15)' : 'none',
              }}
            >
              <p style={S.label}>{stat.label}</p>
              <p
                style={{
                  ...S.serif,
                  fontSize: 16,
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
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trades.map((row) => {
          const id = row.hash || `${row.roundId}-${row.side}-${row.at}`;
          const when = formatWhen(row.at);
          const hashShort = shortHash(row.hash);
          const marketHref = marketTradePath({
            assetId: row.assetId,
            symbol: row.symbol,
            roundId: row.roundId,
          });
          return (
            <li
              key={id}
              style={{
                border: '1px solid rgba(13,11,8,0.2)',
                padding: '14px 16px',
                background: '#FAF8F3',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div>
                  <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                    {marketHref ? (
                      <Link
                        href={marketHref}
                        style={{ color: '#0D0B08', textDecoration: 'underline', textUnderlineOffset: 3 }}
                      >
                        {row.symbol} ↗
                      </Link>
                    ) : (
                      row.symbol
                    )}{' '}
                    <span style={{ color: row.side === 'UP' ? '#27AE60' : RED }}>{row.side}</span>
                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 400, color: '#5A554E', marginLeft: 8 }}>
                      {row.amountTusdc} TUSDC
                    </span>
                  </p>
                  <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    {row.action || 'TRADE'}
                    {row.roundId != null ? ` · Round #${row.roundId}` : ''}
                    {when ? ` · ${when}` : ''}
                  </p>
                </div>
                <span
                  style={{
                    ...S.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: outcomeColor(row.outcome),
                    padding: '4px 10px',
                    border: `1px solid ${outcomeColor(row.outcome)}55`,
                    flexShrink: 0,
                  }}
                >
                  {outcomeLabel(row.outcome)}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 8,
                  ...S.mono,
                  fontSize: 11,
                  color: '#3A3530',
                }}
              >
                {row.pnlTusdc != null ? (
                  <div>
                    <span style={S.label}>P&amp;L</span>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontWeight: 700,
                        color: row.pnlTusdc >= 0 ? '#27AE60' : RED,
                      }}
                    >
                      {row.pnlTusdc >= 0 ? '+' : ''}
                      {row.pnlTusdc} TUSDC
                    </p>
                  </div>
                ) : null}
                <div>
                  <span style={S.label}>Tx hash</span>
                  {row.hash && hashShort ? (
                    <p style={{ margin: '2px 0 0' }}>
                      <a
                        href={`${SNOWTRACE}${row.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: RED, textDecoration: 'none', fontWeight: 700 }}
                        title={row.hash}
                      >
                        {hashShort} ↗
                      </a>
                    </p>
                  ) : (
                    <p style={{ margin: '2px 0 0', color: '#888' }}>Not available</p>
                  )}
                </div>
                {row.hash ? (
                  <div>
                    <span style={S.label}>Full hash</span>
                    <p
                      style={{
                        margin: '2px 0 0',
                        wordBreak: 'break-all',
                        fontSize: 10,
                        color: '#5A554E',
                      }}
                      title={row.hash}
                    >
                      {row.hash}
                    </p>
                  </div>
                ) : null}
              </div>

              {row.outcomeNote ? (
                <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', fontStyle: 'italic', margin: '10px 0 0' }}>
                  {row.outcomeNote}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
