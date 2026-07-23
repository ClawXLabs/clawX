import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';
import { useMarketData } from '../contexts/MarketDataContext';
import { AssetIconImg } from '../utils/assetIcons';

/* ─── Constants ─────────────────────────────────────────────────── */

const ASSET_META: Record<string, { name: string; color: string }> = {
  BTC: { name: 'Bitcoin',    color: '#f7931a' },
  ETH: { name: 'Ethereum',   color: '#627eea' },
  AVAX: { name: 'Avalanche', color: '#E84142' },
  BNB:  { name: 'BNB',       color: '#f3ba2f' },
  NEAR: { name: 'NEAR',      color: '#00C08B' },
};

/* ─── Types ─────────────────────────────────────────────────────── */

interface MarketRow {
  assetId: number;
  symbol: string;
  name: string;
  color: string;
  roundNumber: number;
  startTime: number;
  resolved: boolean;
  remaining: number;
  startPrice: number;
  currentPrice: number;
  collateralPool: number;
  upOdds: number;
  upPool: number;
  downPool: number;
}

interface PricePoint { t: number; price: number; }

/* ─── Helpers ───────────────────────────────────────────────────── */

function fmtUsd(n: number): string {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono:  { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

/* ─── Price History Chart (current round only, card background) ─── */

function PriceChart({
  history,
  startPrice,
  startTimeSec,
  width = 400,
  height = 220,
}: {
  history: PricePoint[];
  startPrice: number;
  startTimeSec: number;
  width?: number;
  height?: number;
}) {
  const startMs = startTimeSec > 0 ? startTimeSec * 1000 : 0;
  // Only the current running market window
  const roundPts =
    startMs > 0 ? history.filter((p) => p.t >= startMs) : history.slice(-40);
  const series =
    roundPts.length >= 2
      ? roundPts
      : roundPts.length === 1
        ? [{ t: startMs || Date.now() - 1000, price: startPrice }, roundPts[0]]
        : [
            { t: startMs || Date.now() - 60_000, price: startPrice },
            { t: Date.now(), price: startPrice },
          ];

  const prices = series.map((p) => p.price);
  const base = startPrice > 0 ? startPrice : prices[0];
  const allValues = [...prices, base];
  const lo = Math.min(...allValues);
  const hi = Math.max(...allValues);
  const pad = Math.max((hi - lo) * 0.25, base * 0.0008, 0.01);
  const min = lo - pad;
  const max = hi + pad;
  const range = max - min || 1;

  const PAD_L = 0;
  const PAD_R = 0;
  const W = width - PAD_L - PAD_R;
  const toX = (i: number) => PAD_L + (i / Math.max(1, series.length - 1)) * W;
  const toY = (v: number) => height - 6 - ((v - min) / range) * (height - 12);

  const baselineY = toY(base);
  const currentPrice = prices[prices.length - 1];
  const isUp = currentPrice >= base;
  const fillColor = isUp ? 'rgba(39,174,96,0.28)' : 'rgba(192,57,43,0.24)';
  const lineColor = isUp ? '#27AE60' : '#C0392B';

  const linePath = buildSmoothPath(series, toX, toY);
  const areaD = linePath
    ? `${linePath} L ${toX(series.length - 1).toFixed(1)},${height} L ${toX(0).toFixed(1)},${height} Z`
    : '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="none"
      aria-hidden
    >
      {areaD ? <path d={areaD} fill={fillColor} /> : null}
      <line
        x1={PAD_L}
        y1={baselineY}
        x2={width - PAD_R}
        y2={baselineY}
        stroke="#0D0B08"
        strokeWidth="0.8"
        strokeDasharray="4 3"
        opacity="0.25"
      />
      {linePath ? (
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="1"
        />
      ) : null}
      <circle
        cx={toX(series.length - 1)}
        cy={toY(currentPrice)}
        r="3"
        fill={lineColor}
      />
    </svg>
  );
}

function buildSmoothPath(
  points: PricePoint[],
  toX: (i: number) => number,
  toY: (p: number) => number
): string {
  if (points.length < 2) return '';
  const n = points.length;
  const xs = points.map((_, i) => toX(i));
  const ys = points.map((p) => toY(p.price));

  let d = `M ${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = i > 0 ? xs[i - 1] : xs[0];
    const y0 = i > 0 ? ys[i - 1] : ys[0];
    const x1 = xs[i];
    const y1 = ys[i];
    const x2 = xs[i + 1];
    const y2 = ys[i + 1];
    const x3 = i < n - 2 ? xs[i + 2] : xs[n - 1];
    const y3 = i < n - 2 ? ys[i + 2] : ys[n - 1];
    const tension = 0.35;
    const cp1x = x1 + (x2 - x0) * tension;
    const cp1y = y1 + (y2 - y0) * tension;
    const cp2x = x2 - (x3 - x1) * tension;
    const cp2y = y2 - (y3 - y1) * tension;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/* ─── Sentiment strip (thin, vibrant bottom edge) ───────────────── */

function SentimentBorder({ upOdds }: { upOdds: number }) {
  const downOdds = Math.max(0, 100 - upOdds);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 5,
        zIndex: 3,
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${upOdds}%`,
          height: '100%',
          background: '#27AE60',
          transition: 'width 0.6s ease',
        }}
      />
      <div
        style={{
          width: `${downOdds}%`,
          height: '100%',
          background: '#C0392B',
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  );
}

/* ─── Live timer (top-right, matched width) ─────────────────────── */

function LiveTimer({ remaining, open, expired }: { remaining: number; open: boolean; expired: boolean }) {
  const [secs, setSecs] = useState(remaining);
  useEffect(() => {
    setSecs(remaining);
  }, [remaining]);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const color = !open ? '#888' : secs < 60 ? '#C0392B' : secs < 120 ? '#F69D39' : '#0D0B08';
  const statusColor = open ? '#27AE60' : expired ? '#F69D39' : '#888';
  const statusLabel = open ? 'Live' : expired ? 'Settling' : 'Closed';

  return (
    <div
      style={{
        width: 88,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 4,
      }}
    >
      <p
        style={{
          ...S.mono,
          width: '100%',
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: '0.02em',
          color,
          margin: 0,
          lineHeight: 1,
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        {open ? (secs > 0 ? formatCountdown(secs) : '0:00') : '—'}
      </p>
      <p
        style={{
          ...S.mono,
          width: '100%',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          margin: 0,
          color: statusColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        {statusLabel}
      </p>
    </div>
  );
}

/* ─── Market Card ───────────────────────────────────────────────── */

function MarketCard({
  row,
  priceHistory,
}: {
  row: MarketRow;
  priceHistory: PricePoint[];
}) {
  const expired = row.remaining === 0 && !row.resolved;
  const open = !row.resolved && row.remaining > 0;
  const oddsDown = 100 - row.upOdds;
  const mult = (row.upOdds >= 50 ? 100 / row.upOdds : 100 / Math.max(oddsDown, 1)).toFixed(2);
  const upOdds = Math.round(row.upOdds);

  const priceDiff = row.currentPrice - row.startPrice;
  const diffPct = row.startPrice > 0 ? (priceDiff / row.startPrice) * 100 : 0;
  const isUp = priceDiff >= 0;

  return (
    <Link href={`/markets/trade?asset=${row.assetId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article
        style={{
          position: 'relative',
          width: '100%',
          height: 300,
          border: '1px solid #0D0B08',
          cursor: 'pointer',
          overflow: 'hidden',
          background: '#FAF8F3',
          boxSizing: 'border-box',
          transition: 'transform 0.15s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,11,8,0.12)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'none';
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            opacity: 0.9,
            pointerEvents: 'none',
          }}
        >
          <PriceChart
            history={priceHistory}
            startPrice={row.startPrice}
            startTimeSec={row.startTime}
            height={300}
          />
        </div>

        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            background:
              'linear-gradient(180deg, rgba(250,248,243,0.72) 0%, rgba(250,248,243,0.28) 42%, rgba(250,248,243,0.55) 100%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '10px 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            height: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Name on top + timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AssetIconImg symbol={row.symbol} size={22} />
                <p
                  style={{
                    ...S.serif,
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#0D0B08',
                    margin: 0,
                    lineHeight: 1.15,
                  }}
                >
                  {row.name}
                </p>
              </div>
              <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 3, marginLeft: 30 }}>
                {row.symbol}/USD
              </p>
            </div>
            <LiveTimer remaining={row.remaining} open={open} expired={expired} />
          </div>

          {/* Open above current — larger readable values */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ ...S.mono, fontSize: 14, fontWeight: 800, color: '#5A554E', margin: 0 }}>
                {fmtUsd(row.startPrice)}
              </p>
              <p style={{ ...S.mono, fontSize: 9, color: '#aaa', margin: '2px 0 0', letterSpacing: '0.1em' }}>
                OPEN
              </p>
              <p
                style={{
                  ...S.serif,
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#0D0B08',
                  margin: '8px 0 0',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {fmtUsd(row.currentPrice)}
              </p>
              <p style={{ ...S.mono, fontSize: 9, color: '#aaa', margin: '3px 0 0', letterSpacing: '0.1em' }}>
                PRICE
              </p>
            </div>
            <p
              style={{
                ...S.mono,
                fontSize: 18,
                fontWeight: 900,
                margin: 0,
                color: isUp ? '#27AE60' : '#C0392B',
                paddingBottom: 14,
              }}
            >
              {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
            </p>
          </div>

          {/* Bottom: payout · volume (pool size removed — same as volume today) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              alignItems: 'end',
              gap: 16,
              marginTop: 'auto',
              paddingTop: 8,
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <p
                style={{
                  ...S.mono,
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#0D0B08',
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {mult}×
              </p>
              <p style={{ ...S.label, marginTop: 6 }}>Payout</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p
                style={{
                  ...S.mono,
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#0D0B08',
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {row.collateralPool.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                <span style={{ ...S.mono, fontSize: 11, fontWeight: 800, color: '#888', marginLeft: 5 }}>
                  TUSDC
                </span>
              </p>
              <p style={{ ...S.label, marginTop: 6 }}>Volume</p>
            </div>
          </div>
        </div>

        <SentimentBorder upOdds={upOdds} />
      </article>
    </Link>
  );
}

/* ─── Main Component ────────────────────────────────────────────── */

export default function MarketsHubTerminal() {
  const { ready, error: contextError, markets, history } = useMarketData();
  const [virtualLiq, setVirtualLiq] = useState<bigint>(1000000000n);
  const [liqLoaded, setLiqLoaded] = useState(false);

  useEffect(() => {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    contract.virtualLiquidityPerSide()
      .then((v: bigint) => {
        setVirtualLiq(v);
        setLiqLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load virtual liquidity:', e);
        setLiqLoaded(true);
      });
  }, []);

  const nowSec = Math.floor(Date.now() / 1000);

  const rows: MarketRow[] = Object.values(markets).map(market => {
    const remaining = Math.max(0, market.endTime - nowSec);
    const sym = market.symbol.trim();
    const meta = ASSET_META[sym] || { name: sym, color: '#5A554E' };

    const vLiqFloat = Number(ethers.formatUnits(virtualLiq, market.decimals));
    const upWeight = vLiqFloat + market.upPool;
    const downWeight = vLiqFloat + market.downPool;
    const total = upWeight + downWeight;
    const upOdds = total > 0 ? (upWeight / total) * 100 : 50;

    return {
      assetId: market.assetId,
      symbol: sym,
      name: meta.name,
      color: meta.color,
      roundNumber: market.roundNumber,
      startTime: market.startTime,
      resolved: market.resolved,
      remaining,
      startPrice: market.startPrice,
      currentPrice: market.currentPrice,
      collateralPool: market.upPool + market.downPool,
      upOdds,
      upPool: market.upPool,
      downPool: market.downPool,
    };
  });

  const loading = !ready || !liqLoaded;
  const error = contextError;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 64px', width: '100%', boxSizing: 'border-box' }} className="np-page">

      {/* ── Page header — compact ── */}
      <div className="np-fade-up" style={{ borderBottom: '3px double #0D0B08', paddingBottom: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ ...S.serif, fontSize: 22, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.01em', color: '#0D0B08', margin: 0 }}>
              5-Minute Prediction Rounds
            </h1>
            <span style={{ ...S.label, color: '#27AE60' }}>◆ LIVE MARKETS</span>
          </div>
          <span style={{ ...S.mono, fontSize: 10, color: '#888', letterSpacing: '0.14em' }}>
            UPDATES EVERY 3S · ORACLE-SETTLED
          </span>
        </div>
      </div>

      {error && (
        <div style={{ border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 24 }}>
          ⚠ {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p style={{ ...S.mono, fontSize: 12, color: '#888', textAlign: 'center', padding: '80px 0' }}>
          Fetching markets from chain…
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 16,
            width: '100%',
          }}
        >
          {rows.map(row => (
            <MarketCard
              key={row.assetId}
              row={row}
              priceHistory={history[row.assetId] ?? []}
            />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <p style={{ ...S.mono, fontSize: 12, color: '#888', textAlign: 'center', padding: '64px 0' }}>
          No active markets on this contract.
        </p>
      )}
    </div>
  );
}