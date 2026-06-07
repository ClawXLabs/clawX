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

/* ─── Price History Chart ───────────────────────────────────────── */

function PriceChart({
  history, startPrice, accent, width = 240, height = 56,
}: {
  history: PricePoint[];
  startPrice: number;
  accent: string;
  width?: number;
  height?: number;
}) {
  const base = startPrice;
  const prices = history.map(p => p.price);

  if (prices.length < 2) {
    const mid = height / 2;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        <line x1="0" y1={mid} x2={width} y2={mid} stroke="#ccc" strokeWidth="1" strokeDasharray="3 3" />
        <text x={width / 2} y={mid - 5} textAnchor="middle" fill="#aaa" fontSize="7" fontFamily="Courier New, monospace">
          Accumulating data…
        </text>
      </svg>
    );
  }

  const allValues = [...prices, base];
  const lo = Math.min(...allValues);
  const hi = Math.max(...allValues);
  const pad = Math.max((hi - lo) * 0.2, base * 0.001, 0.01);
  const min = lo - pad;
  const max = hi + pad;
  const range = max - min || 1;

  const PAD_L = 2; const PAD_R = 2;
  const W = width - PAD_L - PAD_R;

  const toX = (i: number) => PAD_L + (i / (prices.length - 1)) * W;
  const toY = (v: number) => height - 4 - ((v - min) / range) * (height - 8);

  const baselineY = toY(base);
  const currentPrice = prices[prices.length - 1];
  const isUp = currentPrice >= base;
  const fillColor = isUp ? 'rgba(39,174,96,0.12)' : 'rgba(192,57,43,0.10)';
  const lineColor = isUp ? '#27AE60' : '#C0392B';

  const linePath = buildSmoothPath(history, toX, toY);
  const areaD = linePath
    ? `${linePath} L ${toX(history.length - 1).toFixed(1)},${baselineY.toFixed(1)} L ${toX(0).toFixed(1)},${baselineY.toFixed(1)} Z`
    : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none" aria-hidden>
      {/* Area fill between price and baseline */}
      {areaD && <path d={areaD} fill={fillColor} />}

      {/* Baseline (start price) */}
      <line
        x1={PAD_L} y1={baselineY.toFixed(1)}
        x2={width - PAD_R} y2={baselineY.toFixed(1)}
        stroke="#0D0B08" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.4"
      />

      {/* Price curve */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Current price dot */}
      <circle
        cx={toX(prices.length - 1).toFixed(1)}
        cy={toY(currentPrice).toFixed(1)}
        r="2.5" fill={lineColor}
      />

      {/* "OPEN" label at baseline left */}
      <text x={PAD_L + 2} y={baselineY - 3} fill="#888" fontSize="6" fontFamily="Courier New, monospace">OPEN</text>
    </svg>
  );
}

function buildSmoothPath(
  points: PricePoint[],
  toX: (i: number) => number,
  toY: (p: number) => number,
): string {
  if (points.length < 2) return '';
  const n = points.length;
  const xs = points.map((_, i) => toX(i));
  const ys = points.map(p => toY(p.price));

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
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: '#27AE60' }}>▲ UP {upOdds}%</span>
        <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: '#C0392B' }}>DOWN {downOdds}% ▼</span>
      </div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 6, width: '100%', overflow: 'hidden' }}>
        <div style={{ width: `${upOdds}%`, background: '#27AE60', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${downOdds}%`, background: '#C0392B', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ─── Countdown ─────────────────────────────────────────────────── */

function Countdown({ remaining }: { remaining: number }) {
  const [secs, setSecs] = useState(remaining);
  useEffect(() => { setSecs(remaining); }, [remaining]);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);
  const pct = Math.min(100, ((300 - secs) / 300) * 100);
  const color = secs < 60 ? '#C0392B' : secs < 120 ? '#F69D39' : '#27AE60';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Progress bar */}
      <div style={{ flex: 1, height: 3, background: 'rgba(13,11,8,0.1)' }}>
        <div style={{ height: 3, width: `${pct}%`, background: color, transition: 'width 1s linear, background 0.4s' }} />
      </div>
      <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>
        {secs > 0 ? formatCountdown(secs) : 'Settling'}
      </span>
    </div>
  );
}

/* ─── Market Card ───────────────────────────────────────────────── */

function MarketCard({
  row, priceHistory,
}: {
  row: MarketRow;
  priceHistory: PricePoint[];
}) {
  const expired  = row.remaining === 0 && !row.resolved;
  const open     = !row.resolved && row.remaining > 0;
  const oddsDown = 100 - row.upOdds;
  const mult     = (row.upOdds >= 50
    ? (100 / row.upOdds)
    : (100 / oddsDown)
  ).toFixed(2);

  const currentP  = row.currentPrice;
  const startP    = row.startPrice;
  const priceDiff = currentP - startP;
  const diffPct   = startP > 0 ? ((priceDiff / startP) * 100) : 0;
  const isUp      = priceDiff >= 0;

  return (
    <Link href={`/markets/trade?asset=${row.assetId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          border: '1px solid #0D0B08',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          cursor: 'pointer',
          marginRight: -1,
          marginBottom: -1,
          transition: 'background 0.2s ease',
          background: 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,11,8,0.03)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >

        {/* ── Row 1: Asset name + status badge ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AssetIconImg symbol={row.symbol} size={28} />
              <p style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: '#0D0B08', margin: 0 }}>{row.name}</p>
            </div>
            <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 3, marginLeft: 36 }}>
              {row.symbol} · Round #{row.roundNumber}
            </p>
          </div>
          <span style={{
            ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', padding: '4px 10px', flexShrink: 0,
            background: open ? '#27AE60' : expired ? '#F69D39' : '#888',
            color: '#FAF8F3',
          }}>
            {open ? '● LIVE' : expired ? '● SETTLING' : 'CLOSED'}
          </span>
        </div>

        {/* ── Row 2: Current price + change ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p style={S.label}>Current Price</p>
            <p style={{ ...S.serif, fontSize: 28, fontWeight: 900, color: '#0D0B08', margin: '3px 0 0', lineHeight: 1 }}>
              {fmtUsd(row.currentPrice)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={S.label}>vs Open</p>
            <p style={{
              ...S.mono, fontSize: 15, fontWeight: 700, margin: '3px 0 0',
              color: isUp ? '#27AE60' : '#C0392B',
            }}>
              {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
            </p>
            <p style={{ ...S.mono, fontSize: 11, color: '#aaa', marginTop: 1 }}>
              Open: {fmtUsd(row.startPrice)}
            </p>
          </div>
        </div>

        {/* ── Row 3: Price chart ── */}
        <div style={{ background: 'rgba(13,11,8,0.03)', padding: '6px 4px 2px' }}>
          <PriceChart history={priceHistory} startPrice={row.startPrice} accent={row.color} height={52} />
        </div>

        {/* ── Row 4: Pool sentiment bar ── */}
        <PoolBar upOdds={Math.round(row.upOdds)} />

        {/* ── Row 5: Stats row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(13,11,8,0.12)' }}>
          <div>
            <p style={S.label}>Payout</p>
            <p style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: '#0D0B08', marginTop: 3 }}>{mult}×</p>
          </div>
          <div>
            <p style={S.label}>Volume</p>
            <p style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#5A554E', marginTop: 3 }}>
              {row.collateralPool.toLocaleString(undefined, { maximumFractionDigits: 2 })} TUSDC
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={S.label}>Time Left</p>
            <p style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#0D0B08', marginTop: 3 }}>
              {open ? formatCountdown(row.remaining) : '—'}
            </p>
          </div>
        </div>

        {/* ── Row 6: Countdown bar + CTA ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {open && <Countdown remaining={row.remaining} />}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{
              ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '7px 18px',
              background: '#0D0B08', color: '#FAF8F3',
            }}>
              TRADE →
            </span>
          </div>
        </div>

      </div>
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
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '48px 24px 64px' }}>

      {/* ── Page header ── */}
      <div style={{ borderBottom: '3px double #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#27AE60', marginBottom: 12 }}>◆ LIVE MARKETS</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ ...S.serif, fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
            5-Minute Prediction Rounds
          </h1>
          <span style={{ ...S.mono, fontSize: 11, color: '#888', letterSpacing: '0.14em' }}>
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