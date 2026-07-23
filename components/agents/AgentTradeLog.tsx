import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { TradeRow } from '../../hooks/useAgentStatus';
import { marketTradePath } from '../../utils/marketLink';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';
const RED = '#C0392B';
const PAGE_SIZE = 10;

type TradeFilter = 'all' | 'wins' | 'losses' | 'pending';

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

function normalizeOutcome(outcome?: string | null) {
  return String(outcome || '').toLowerCase();
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
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('all');
  const [page, setPage] = useState(1);

  const winCount = useMemo(
    () => trades.filter((t) => normalizeOutcome(t.outcome) === 'win').length,
    [trades]
  );
  const lossCount = useMemo(
    () => trades.filter((t) => normalizeOutcome(t.outcome) === 'loss').length,
    [trades]
  );
  const pendingCount = useMemo(
    () =>
      trades.filter((t) => {
        const o = normalizeOutcome(t.outcome);
        return o === 'pending' || !o || o === '—';
      }).length,
    [trades]
  );

  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const o = normalizeOutcome(t.outcome);
      if (tradeFilter === 'wins') return o === 'win';
      if (tradeFilter === 'losses') return o === 'loss';
      if (tradeFilter === 'pending') return o === 'pending' || !o;
      return true;
    });
  }, [trades, tradeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTrades = filteredTrades.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tradeFilter, trades]);

  if (!trades.length) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
        Trades appear here as the agent executes.
      </p>
    );
  }

  const tabs: Array<{ key: TradeFilter; label: string; color?: string }> = [
    { key: 'all', label: `All (${trades.length})` },
    { key: 'wins', label: `Wins (${winCount})`, color: '#27AE60' },
    { key: 'losses', label: `Losses (${lossCount})`, color: RED },
    { key: 'pending', label: `Pending (${pendingCount})`, color: '#F69D39' },
  ];

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {tabs.map((tab) => {
          const active = tradeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTradeFilter(tab.key)}
              style={{
                ...S.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 12px',
                border: `1px solid ${active ? tab.color || '#0D0B08' : 'rgba(13,11,8,0.25)'}`,
                background: active ? `${tab.color || '#0D0B08'}12` : '#FAF8F3',
                color: active ? tab.color || '#0D0B08' : '#5A554E',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {!pagedTrades.length ? (
        <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
          No {tradeFilter === 'wins' ? 'winning' : tradeFilter === 'losses' ? 'losing' : tradeFilter}{' '}
          trades.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pagedTrades.map((row) => {
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
      )}

      {filteredTrades.length > PAGE_SIZE ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: 0 }}>
            Page {safePage} of {totalPages} · {filteredTrades.length} trades
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                ...S.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '8px 12px',
                border: '1px solid #0D0B08',
                background: '#FAF8F3',
                cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                opacity: safePage <= 1 ? 0.4 : 1,
              }}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                ...S.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '8px 12px',
                border: '1px solid #0D0B08',
                background: '#FAF8F3',
                cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                opacity: safePage >= totalPages ? 0.4 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
