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
  const fillColor = isUp ? 'rgba(39,174,96,0.14)' : 'rgba(192,57,43,0.12)';
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
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.85"
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

/* ─── Pool Bar ──────────────────────────────────────────────────── */

function PoolBar({ upOdds }: { upOdds: number }) {
  const downOdds = 100 - upOdds;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: '#27AE60' }}>▲ UP {upOdds}%</span>
        <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: '#C0392B' }}>DOWN {downOdds}% ▼</span>
      </div>
      <div style={{ display: 'flex', height: 5, width: '100%', overflow: 'hidden' }}>
        <div style={{ width: `${upOdds}%`, background: '#27AE60', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${downOdds}%`, background: '#C0392B', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ─── Live timer (top-right) ─────────────────────────────────────── */

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

  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <p
        style={{
          ...S.mono,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: '0.04em',
          color,
          margin: 0,
          lineHeight: 1,
        }}
      >
        {open ? (secs > 0 ? formatCountdown(secs) : '0:00') : expired ? '—' : '—'}
      </p>
      <p
        style={{
          ...S.mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          margin: '6px 0 0',
          color: open ? '#27AE60' : expired ? '#F69D39' : '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 5,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: open ? '#27AE60' : expired ? '#F69D39' : '#888',
            display: 'inline-block',
          }}
        />
        {open ? 'Live' : expired ? 'Settling' : 'Closed'}
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
  const mult = (row.upOdds >= 50 ? 100 / row.upOdds : 100 / oddsDown).toFixed(2);

  const currentP = row.currentPrice;
  const startP = row.startPrice;
  const priceDiff = currentP - startP;
  const diffPct = startP > 0 ? (priceDiff / startP) * 100 : 0;
  const isUp = priceDiff >= 0;

  return (
    <Link href={`/markets/trade?asset=${row.assetId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article
        style={{
          position: 'relative',
          border: '1px solid #0D0B08',
          minHeight: 260,
          cursor: 'pointer',
          marginRight: -1,
          marginBottom: -1,
          overflow: 'hidden',
          background: '#FAF8F3',
          transition: 'box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #C0392B';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Chart as full-card background — current round only */}
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
            height={260}
          />
        </div>

        {/* Soft wash so text stays readable */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            background:
              'linear-gradient(180deg, rgba(250,248,243,0.88) 0%, rgba(250,248,243,0.55) 45%, rgba(250,248,243,0.82) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Foreground content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '18px 18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 260,
            boxSizing: 'border-box',
          }}
        >
          {/* Top: asset + timer / Live */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AssetIconImg symbol={row.symbol} size={26} />
                <p style={{ ...S.serif, fontSize: 20, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                  {row.name}
                </p>
              </div>
              <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 4, marginLeft: 34 }}>
                {row.symbol}/USD
              </p>
            </div>
            <LiveTimer remaining={row.remaining} open={open} expired={expired} />
          </div>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p style={S.label}>Price</p>
              <p
                style={{
                  ...S.serif,
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#0D0B08',
                  margin: '2px 0 0',
                  lineHeight: 1,
                }}
              >
                {fmtUsd(row.currentPrice)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p
                style={{
                  ...S.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  margin: 0,
                  color: isUp ? '#27AE60' : '#C0392B',
                }}
              >
                {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
              </p>
              <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '3px 0 0' }}>
                Open {fmtUsd(row.startPrice)}
              </p>
            </div>
          </div>

          <PoolBar upOdds={Math.round(row.upOdds)} />

          {/* Bottom stats: highlighted pool + payout · volume right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 'auto',
              paddingTop: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <p style={{ ...S.label, color: '#C0392B' }}>Pool size</p>
                <p
                  style={{
                    ...S.serif,
                    fontSize: 22,
                    fontWeight: 900,
                    color: '#0D0B08',
                    margin: '2px 0 0',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {row.collateralPool.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: '#888', marginLeft: 6 }}>
                    TUSDC
                  </span>
                </p>
              </div>
              <div>
                <p style={S.label}>Payout</p>
                <p style={{ ...S.mono, fontSize: 18, fontWeight: 900, color: '#0D0B08', margin: '4px 0 0' }}>
                  {mult}×
                </p>
              </div>
              <div>
                <p style={S.label}>UP / DOWN</p>
                <p style={{ ...S.mono, fontSize: 12, fontWeight: 700, margin: '6px 0 0' }}>
                  <span style={{ color: '#27AE60' }}>
                    {row.upPool.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <span style={{ color: '#888' }}> / </span>
                  <span style={{ color: '#C0392B' }}>
                    {row.downPool.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                </p>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={S.label}>Volume</p>
              <p style={{ ...S.mono, fontSize: 14, fontWeight: 800, color: '#0D0B08', margin: '4px 0 0' }}>
                {row.collateralPool.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </p>
            </div>
          </div>
        </div>
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
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 24px 64px' }}>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 0 }}>
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