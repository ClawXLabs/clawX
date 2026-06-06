import { useEffect, useRef, useState } from 'react';
import { MarketInfo, PriceTick } from '../contexts/MarketDataContext';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';
import { ethers } from 'ethers';
import { AssetIconImg } from '../utils/assetIcons';
import { TrendingUp, TrendingDown, Clock, Archive } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────── */

interface TradingChartProps {
  market: MarketInfo;
  history: PriceTick[];
  onTakePosition: (id: number, isUp: boolean, amount: string) => Promise<void>;
  onSellPosition?: (id: number, isUp: boolean, shares: string) => Promise<void>;
  onResolveMarket: (id: number) => Promise<void>;
  onClaimWinnings: (id: number) => Promise<void>;
  tokenSymbol?: string;
  isHistorical?: boolean;
  onReturnToLive?: () => void;
}

/* ─── Design tokens ──────────────────────────────────────────────── */

const NP = {
  mono:  { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", Courier, monospace', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#555',
  } as React.CSSProperties,
  bg:    '#FAF8F3',
  ink:   '#0D0B08',
  green: '#1E5E3A',
  red:   '#8A1C14',
  border: '1px solid #0D0B08',
};

/* ─── Helpers ────────────────────────────────────────────────────── */

function fmtUsd(n: number): string {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/* ─── Circular Timer Widget ──────────────────────────────────────── */

function CircularTimer({ msLeft, totalMs = 300_000 }: { msLeft: number; totalMs?: number }) {
  const radius = 26;
  const stroke = 3.5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(totalMs, msLeft) / totalMs) * circumference;

  const secondsLeft = Math.ceil(msLeft / 1000);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const isCritical = msLeft < 60_000;
  const color = isCritical ? NP.red : msLeft < 120_000 ? '#D97706' : NP.green;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      border: NP.border,
      background: NP.bg,
      padding: '10px 8px',
      flex: '1 1 0px',
      minWidth: 0,
      height: '100px',
    }}>
      <span style={{ ...NP.label, fontSize: 8, marginBottom: 6, display: 'block', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={10} />
        TIMER
      </span>
      <div style={{ position: 'relative', width: 50, height: 50 }}>
        <svg height={50} width={50}>
          <circle
            stroke="rgba(13,11,8,0.06)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={25}
            cy={25}
          />
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s linear, stroke 0.4s' }}
            r={normalizedRadius}
            cx={25}
            cy={25}
            transform="rotate(-90 25 25)"
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...NP.mono, fontSize: 10, fontWeight: 900, color: NP.ink
        }}>
          {msLeft > 0 ? timeStr : 'SETTLE'}
        </div>
      </div>
    </div>
  );
}

/* ─── Market Sentiment needle Dial Gauge ────────────────────────── */

function SentimentDial({ upPool, downPool }: { upPool: number; downPool: number }) {
  const total = upPool + downPool || 1;
  const upPct = Math.round((upPool / total) * 100);
  const angle = (upPct / 100) * 180 - 90; // Rotate needle from -90deg to +90deg

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      border: NP.border,
      background: NP.bg,
      padding: '10px 8px',
      flex: '1 1 0px',
      minWidth: 0,
      height: '100px',
    }}>
      <span style={{ ...NP.label, fontSize: 8, marginBottom: 2, display: 'block' }}>SENTIMENT DIAL</span>
      
      <div style={{ position: 'relative', width: 70, height: 36, overflow: 'hidden', marginTop: 4 }}>
        <svg width={70} height={35}>
          {/* Half-circle arc background */}
          <path
            d="M 8,32 A 24,24 0 0,1 62,32"
            fill="none"
            stroke="rgba(13,11,8,0.06)"
            strokeWidth="5"
          />
          {/* UP half-arc (green, right side) */}
          <path
            d="M 35,8 A 24,24 0 0,1 62,32"
            fill="none"
            stroke={NP.green}
            strokeWidth="3"
            opacity="0.35"
          />
          {/* DOWN half-arc (red, left side) */}
          <path
            d="M 8,32 A 24,24 0 0,1 35,8"
            fill="none"
            stroke={NP.red}
            strokeWidth="3"
            opacity="0.35"
          />
          {/* Dial Center Pin */}
          <circle cx="35" cy="32" r="3.5" fill={NP.ink} />
          {/* Pointer needle */}
          <line
            x1="35" y1="32"
            x2="35" y2="12"
            stroke={NP.ink}
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 35 32)`}
            style={{ transition: 'transform 0.5s ease-out' }}
          />
        </svg>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', ...NP.mono, fontSize: 8.5, fontWeight: 900, marginTop: 2 }}>
        <span style={{ color: NP.red }}>▲{100 - upPct}% DN</span>
        <span style={{ color: NP.green }}>▲{upPct}% UP</span>
      </div>
    </div>
  );
}

/* ─── Smooth Area + Line Chart ───────────────────────────────────── */

function LineChart({
  history,
  startPrice,
  currentPrice,
  isUp,
  width,
  height,
  isHistorical = false,
}: {
  history: PriceTick[];
  startPrice: number;
  currentPrice: number;
  isUp: boolean;
  width: number;
  height: number;
  isHistorical?: boolean;
}) {
  const PAD_L = 64;
  const PAD_R = 72;  // space for live price tag
  const PAD_T = 12;
  const PAD_B = 28;  // time axis
  const chartW = width - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  const lineColor = isUp ? NP.green : NP.red;
  const fillId    = isUp ? 'fillUp' : 'fillDown';

  // State for hover crosshair/tooltip
  const [hoveredPoint, setHoveredPoint] = useState<PriceTick | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // If historical, construct a nice editorial zig-zag price line representing the resolved movement
  const effectiveHistory = isHistorical
    ? [
        { t: 0, price: startPrice },
        { t: 25000, price: startPrice + (currentPrice - startPrice) * 0.45 + (startPrice * (isUp ? 0.0015 : -0.0015)) },
        { t: 50000, price: startPrice + (currentPrice - startPrice) * 0.25 - (startPrice * (isUp ? 0.001 : -0.001)) },
        { t: 75000, price: startPrice + (currentPrice - startPrice) * 0.8 + (startPrice * (isUp ? 0.0025 : -0.0025)) },
        { t: 100000, price: currentPrice }
      ]
    : history;

  // ── Build price range ──
  const prices = effectiveHistory.map(h => h.price).concat([startPrice, currentPrice]);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const range  = rawMax - rawMin;
  // Minimum visible range = 0.25% of startPrice so the chart is never flat
  const minRange = startPrice * 0.0025;
  const mid      = (rawMax + rawMin) / 2;
  const effectiveRange = Math.max(range, minRange);
  const padded   = effectiveRange * 0.2;
  const priceMin = mid - effectiveRange / 2 - padded;
  const priceMax = mid + effectiveRange / 2 + padded;
  const priceRange = priceMax - priceMin || 1;

  const toX = (i: number, total: number) =>
    PAD_L + (total <= 1 ? chartW : (i / (total - 1)) * chartW);
  const toY = (p: number) =>
    PAD_T + (1 - (p - priceMin) / priceRange) * chartH;

  const baseY    = toY(startPrice);
  const liveY    = toY(currentPrice);

  // ── Y-axis grid & labels ──
  const TICKS = 5;
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const v = priceMin + (priceRange * i) / TICKS;
    return { v, y: toY(v) };
  });

  // ── Build SVG paths ──
  let linePath = '';
  let areaPath = '';
  if (effectiveHistory.length >= 2) {
    linePath = buildSmoothPath(effectiveHistory, toX, toY);
    areaPath = `${linePath} L ${toX(effectiveHistory.length - 1, effectiveHistory.length).toFixed(1)},${(PAD_T + chartH).toFixed(1)} L ${toX(0, effectiveHistory.length).toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`;
  }

  // ── X-axis time labels ──
  const timeLabels: { x: number; label: string }[] = [];
  if (!isHistorical && effectiveHistory.length >= 2) {
    const step = Math.max(1, Math.floor(effectiveHistory.length / 5));
    for (let i = 0; i < effectiveHistory.length; i += step) {
      timeLabels.push({
        x: toX(i, effectiveHistory.length),
        label: fmtTime(effectiveHistory[i].t),
      });
    }
  } else if (isHistorical) {
    timeLabels.push({ x: PAD_L, label: 'START' });
    timeLabels.push({ x: PAD_L + chartW, label: 'SETTLED' });
  }

  // ── Live dot position ──
  const lastX = effectiveHistory.length >= 1 ? toX(effectiveHistory.length - 1, effectiveHistory.length) : PAD_L + chartW;
  const lastY = effectiveHistory.length >= 1 ? toY(effectiveHistory[effectiveHistory.length - 1].price) : liveY;

  // ── Mouse movements ──
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current || effectiveHistory.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Scale to viewBox coordinates
    const scaleX = width / rect.width;
    const svgX = mouseX * scaleX;
    
    if (svgX < PAD_L || svgX > PAD_L + chartW) {
      setHoveredPoint(null);
      setHoverX(null);
      return;
    }
    
    const ratio = (svgX - PAD_L) / chartW;
    const idx = Math.min(
      effectiveHistory.length - 1,
      Math.max(0, Math.round(ratio * (effectiveHistory.length - 1)))
    );
    
    setHoveredPoint(effectiveHistory[idx]);
    setHoverX(toX(idx, effectiveHistory.length));
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoverX(null);
  };

  if (width <= 0 || height <= 0) return null;

  // Hovered coordinates
  const hoverY = hoveredPoint ? toY(hoveredPoint.price) : 0;
  
  // Tooltip position & bounds safety
  const tooltipW = 120;
  const tooltipH = 42;
  let tooltipX = hoverX ? hoverX - tooltipW / 2 : 0;
  let tooltipY = hoverY - tooltipH - 10;
  if (hoverX) {
    if (tooltipX < PAD_L + 4) tooltipX = PAD_L + 4;
    if (tooltipX + tooltipW > PAD_L + chartW - 4) tooltipX = PAD_L + chartW - 4 - tooltipW;
    if (tooltipY < PAD_T + 4) tooltipY = hoverY + 12; // flip below if at top
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height, display: 'block', cursor: effectiveHistory.length >= 2 ? 'crosshair' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-hidden
    >
      <defs>
        <linearGradient id="fillUp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={NP.green} stopOpacity="0.22" />
          <stop offset="60%"  stopColor={NP.green} stopOpacity="0.06" />
          <stop offset="100%" stopColor={NP.green} stopOpacity="0.00" />
        </linearGradient>
        <linearGradient id="fillDown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={NP.red} stopOpacity="0.22" />
          <stop offset="60%"  stopColor={NP.red} stopOpacity="0.06" />
          <stop offset="100%" stopColor={NP.red} stopOpacity="0.00" />
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={PAD_L} y={PAD_T} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      {/* ── Background ── */}
      <rect x={PAD_L} y={PAD_T} width={chartW} height={chartH} fill="rgba(13,11,8,0.015)" />

      {/* ── Y-axis grid ── */}
      {yTicks.map(({ v, y }, i) => (
        <g key={i}>
          <line
            x1={PAD_L} y1={y.toFixed(1)}
            x2={PAD_L + chartW} y2={y.toFixed(1)}
            stroke="#0D0B08" strokeWidth="0.4" strokeDasharray="3 5" opacity="0.14"
          />
          <text
            x={PAD_L - 6} y={y.toFixed(1)}
            textAnchor="end" dominantBaseline="middle"
            fill="#444" fontSize="8.5" fontFamily="Courier New, monospace" fontWeight="bold"
          >
            {fmtUsd(v)}
          </text>
        </g>
      ))}

      {/* ── Open price baseline ── */}
      <line
        x1={PAD_L} y1={baseY.toFixed(1)}
        x2={PAD_L + chartW} y2={baseY.toFixed(1)}
        stroke="#0D0B08" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.45"
      />
      <text
        x={PAD_L + 6} y={(baseY - 7).toFixed(1)}
        fill="#444" fontSize="8" fontFamily="Courier New, monospace" fontWeight="900"
        letterSpacing="0.06em"
      >
        OPEN {fmtUsd(startPrice)}
      </text>

      {/* ── Clipped chart area ── */}
      <g clipPath="url(#chartClip)">
        {/* Area fill */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${fillId})`} />
        )}
        {/* Price line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Data point dots — sampled for performance */}
        {!isHistorical && effectiveHistory.length >= 2 && (() => {
          const step = Math.max(1, Math.floor(effectiveHistory.length / 20));
          const dots = [];
          for (let i = 0; i < effectiveHistory.length; i += step) {
            dots.push(
              <circle
                key={i}
                cx={toX(i, effectiveHistory.length).toFixed(1)}
                cy={toY(effectiveHistory[i].price).toFixed(1)}
                r="2.5"
                fill={NP.bg}
                stroke={lineColor}
                strokeWidth="1.5"
              />
            );
          }
          return dots;
        })()}
      </g>

      {/* ── Historical Result Watermark Stamp ── */}
      {isHistorical && (
        <g opacity="0.1" style={{ pointerEvents: 'none' }}>
          <rect
            x={PAD_L + chartW / 2 - 130} y={PAD_T + chartH / 2 - 25}
            width="260" height="50"
            fill="none" stroke={isUp ? NP.green : NP.red} strokeWidth="3"
            strokeDasharray="6 4"
          />
          <text
            x={PAD_L + chartW / 2} y={PAD_T + chartH / 2 + 3}
            textAnchor="middle" dominantBaseline="middle"
            fill={isUp ? NP.green : NP.red}
            fontSize="16" fontFamily="Courier New, monospace" fontWeight="900"
            letterSpacing="0.12em"
          >
            {isUp ? '▲ UP WINS' : '▼ DOWN WINS'}
          </text>
        </g>
      )}

      {/* ── Live price horizontal tracker ── */}
      <line
        x1={PAD_L} y1={liveY.toFixed(1)}
        x2={PAD_L + chartW} y2={liveY.toFixed(1)}
        stroke={lineColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.7"
      />

      {/* Live price pill on right */}
      <rect
        x={PAD_L + chartW + 2} y={(liveY - 11).toFixed(1)}
        width={PAD_R - 4} height="20"
        fill={lineColor} stroke="#0D0B08" strokeWidth="1"
      />
      <text
        x={PAD_L + chartW + PAD_R / 2} y={(liveY + 1).toFixed(1)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#FAF8F3" fontSize="8.5" fontFamily="Courier New, monospace" fontWeight="900"
      >
        {fmtUsd(currentPrice)}
      </text>

      {/* ── Pulsing live dot at last data point ── */}
      {!isHistorical && (
        <>
          <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="8" fill={lineColor} opacity="0.12">
            <animate attributeName="r" values="5;11;5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.18;0.04;0.18" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4" fill="#0D0B08" />
          <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2" fill={lineColor} />
        </>
      )}

      {/* ── X-axis frame ── */}
      <line
        x1={PAD_L} y1={PAD_T + chartH}
        x2={PAD_L + chartW} y2={PAD_T + chartH}
        stroke="#0D0B08" strokeWidth="1"
      />
      <line
        x1={PAD_L} y1={PAD_T}
        x2={PAD_L} y2={PAD_T + chartH}
        stroke="#0D0B08" strokeWidth="1"
      />

      {/* ── Time labels ── */}
      {timeLabels.map(({ x, label }, i) => (
        <text
          key={i}
          x={x.toFixed(1)} y={PAD_T + chartH + 14}
          textAnchor="middle"
          fill="#555" fontSize="7.5" fontFamily="Courier New, monospace" fontWeight="bold"
        >
          {label}
        </text>
      ))}

      {/* ── "No data yet" state ── */}
      {!isHistorical && effectiveHistory.length < 2 && (
        <>
          <text
            x={PAD_L + chartW / 2} y={PAD_T + chartH / 2 - 12}
            textAnchor="middle" dominantBaseline="middle"
            fill="#888" fontSize="11" fontFamily="Courier New, monospace" fontWeight="bold"
          >
            ACCUMULATING PRICE FEED…
          </text>
          <text
            x={PAD_L + chartW / 2} y={PAD_T + chartH / 2 + 10}
            textAnchor="middle" dominantBaseline="middle"
            fill="#0D0B08" fontSize="18" fontFamily="Georgia, serif" fontWeight="900"
          >
            {fmtUsd(currentPrice)}
          </text>
        </>
      )}

      {/* ── Hover crosshair & floating brutalist tooltip ── */}
      {hoveredPoint && hoverX !== null && (
        <g>
          {/* Vertical dashed line */}
          <line
            x1={hoverX.toFixed(1)} y1={PAD_T}
            x2={hoverX.toFixed(1)} y2={PAD_T + chartH}
            stroke="#0D0B08" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6"
          />
          {/* Horizontal dashed line */}
          <line
            x1={PAD_L} y1={hoverY.toFixed(1)}
            x2={PAD_L + chartW} y2={hoverY.toFixed(1)}
            stroke="#0D0B08" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6"
          />
          {/* Snap dot */}
          <circle cx={hoverX.toFixed(1)} cy={hoverY.toFixed(1)} r="5.5" fill="#FAF8F3" stroke={lineColor} strokeWidth="2.5" />
          
          {/* Floating Tooltip Box */}
          <g transform={`translate(${tooltipX.toFixed(1)}, ${tooltipY.toFixed(1)})`}>
            {/* Tooltip board */}
            <rect x="0" y="0" width={tooltipW} height={tooltipH} fill="#FAF8F3" stroke="#0D0B08" strokeWidth="2" />
            {/* Price text */}
            <text
              x={tooltipW / 2} y="15"
              textAnchor="middle" dominantBaseline="middle"
              fill="#0D0B08" fontSize="9.5" fontFamily="Courier New, monospace" fontWeight="900"
            >
              {fmtUsd(hoveredPoint.price)}
            </text>
            {/* Time text */}
            <text
              x={tooltipW / 2} y="29"
              textAnchor="middle" dominantBaseline="middle"
              fill="#555" fontSize="7.5" fontFamily="Courier New, monospace" fontWeight="bold"
            >
              {!isHistorical ? fmtTime(hoveredPoint.t) : (hoveredPoint.t === 0 ? 'Start' : hoveredPoint.t === 100000 ? 'Settle' : 'Mid')}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** Catmull-rom → cubic bezier smooth path */
function buildSmoothPath(
  points: PriceTick[],
  toX: (i: number, total: number) => number,
  toY: (p: number) => number,
): string {
  if (points.length < 2) return '';
  const n = points.length;
  const xs = points.map((_, i) => toX(i, n));
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

/* ─── Pool Sentiment Bar ─────────────────────────────────────────── */

function PoolBar({ upPool, downPool }: { upPool: number; downPool: number }) {
  const total = upPool + downPool || 1;
  const upPct = Math.round((upPool / total) * 100);
  const downPct = 100 - upPct;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ ...NP.mono, fontSize: 11, fontWeight: 900, color: NP.green }}>▲ UP {upPct}%</span>
        <span style={{ ...NP.mono, fontSize: 11, fontWeight: 900, color: NP.red }}>DOWN {downPct}% ▼</span>
      </div>
      <div style={{ display: 'flex', height: 12, border: NP.border, overflow: 'hidden' }}>
        <div style={{ width: `${upPct}%`, background: NP.green, transition: 'width 0.5s ease' }} />
        <div style={{ width: `${downPct}%`, background: NP.red,   transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */

export default function TradingChartv2({
  market,
  history,
  onTakePosition,
  onSellPosition,
  onResolveMarket,
  onClaimWinnings,
  tokenSymbol = 'TUSDC',
  isHistorical = false,
  onReturnToLive,
}: TradingChartProps) {
  const [now, setNow]   = useState(Date.now());
  const [side, setSide] = useState<'up' | 'down'>('up');
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(900);

  // Position management
  const { account } = useWallet();
  const [upShares, setUpShares] = useState(0);
  const [downShares, setDownShares] = useState(0);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sellQuote, setSellQuote] = useState(0);

  // Tick clock every second for countdown
  useEffect(() => {
    if (isHistorical) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isHistorical]);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setChartWidth(Math.floor(w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch user positions (shares)
  const fetchShares = async () => {
    if (!account || !market?.roundId) {
      setUpShares(0);
      setDownShares(0);
      return;
    }
    try {
      setSharesLoading(true);
      const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const pos = await contract.getUserPosition(market.roundId, account);
      setUpShares(Number(ethers.formatUnits(pos.upShares, market.decimals)));
      setDownShares(Number(ethers.formatUnits(pos.downShares, market.decimals)));
    } catch (e) {
      console.error("Failed to fetch shares:", e);
    } finally {
      setSharesLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, [account, market?.roundId, market?.decimals]);

  // Fetch sell quote dynamically when selling
  useEffect(() => {
    if (tradeMode !== 'sell' || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || !market?.roundId) {
      setSellQuote(0);
      return;
    }
    let active = true;
    const fetchQuote = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const sharesRaw = ethers.parseUnits(amount, market.decimals);
        const quote = await contract.quoteSell(market.roundId, side === 'up', sharesRaw);
        if (active) {
          setSellQuote(Number(ethers.formatUnits(quote, market.decimals)));
        }
      } catch (e) {
        if (active) setSellQuote(0);
      }
    };
    fetchQuote();
    return () => { active = false; };
  }, [tradeMode, amount, side, market?.roundId, market?.decimals]);

  const msLeft    = Math.max(0, market.endTime * 1000 - now);
  const isOpen    = !market.resolved && msLeft > 0;
  const isExpired = !market.resolved && msLeft === 0;
  const timePct   = Math.min(100, ((300_000 - msLeft) / 300_000) * 100);

  const diffPct   = market.startPrice > 0
    ? ((market.currentPrice - market.startPrice) / market.startPrice) * 100
    : 0;
  const priceIsUp = diffPct >= 0;

  const totalPool = market.upPool + market.downPool || 1;
  const upPct     = Math.round((market.upPool / totalPool) * 100);
  const downPct   = 100 - upPct;
  const mult      = upPct >= 50
    ? (100 / upPct).toFixed(2)
    : (100 / downPct).toFixed(2);

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    setBusy(true);
    try {
      if (tradeMode === 'buy') {
        await onTakePosition(market.assetId, side === 'up', amount);
      } else {
        if (onSellPosition) {
          await onSellPosition(market.assetId, side === 'up', amount);
        } else {
          alert("Sell system handler is not configured on this screen.");
        }
      }
      setTimeout(fetchShares, 2500); // re-fetch positions
    } finally {
      setBusy(false);
    }
  };

  const isDesktop = chartWidth >= 768;

  /* ── HEADER ── */
  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12,
      padding: '16px 22px',
      borderBottom: NP.border,
      background: isHistorical ? 'rgba(138,28,20,0.02)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isHistorical && (
          <span style={{
            padding: '3px 8px', border: '1px solid #8A1C14', background: 'rgba(138,28,20,0.06)',
            ...NP.mono, fontSize: 9, fontWeight: 900, color: '#8A1C14',
          }}>
            📜 ARCHIVE VIEW
          </span>
        )}
        <AssetIconImg symbol={market.symbol} size={28} />
        <span style={{ ...NP.serif, fontSize: 24, fontWeight: 900, color: NP.ink }}>
          {market.symbol}/USD
        </span>
        <span style={{ ...NP.mono, fontSize: 10, color: '#444', fontWeight: 'bold', letterSpacing: '0.08em' }}>
          ROUND #{market.roundNumber}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...NP.serif, fontSize: 26, fontWeight: 900, color: NP.ink, lineHeight: 1 }}>
            {fmtUsd(market.currentPrice)}
          </div>
          <div style={{ ...NP.mono, fontSize: 11, fontWeight: 900, marginTop: 4,
            color: priceIsUp ? NP.green : NP.red }}>
            {priceIsUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}% {isHistorical ? 'FINAL' : 'VS OPEN'}
          </div>
        </div>
        <span style={{
          ...NP.mono, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em',
          padding: '6px 12px', border: NP.border,
          background: isHistorical ? '#8A1C14' : (isOpen ? NP.green : isExpired ? '#D97706' : '#555'),
          color: '#FAF8F3',
        }}>
          {isHistorical ? '● RESOLVED' : (isOpen ? '● LIVE' : isExpired ? '● SETTLING' : 'CLOSED')}
        </span>
      </div>
    </div>
  );

  /* ── STATS GRID ── */
  const statsGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: NP.border }}>
      {[
        { label: 'Open Price',  value: fmtUsd(market.startPrice) },
        { label: 'UP Pool',     value: `${market.upPool.toFixed(2)} ${tokenSymbol}`,   color: NP.green },
        { label: 'DOWN Pool',   value: `${market.downPool.toFixed(2)} ${tokenSymbol}`, color: NP.red },
        { label: isHistorical ? 'Final Result' : 'Est. Payout', value: isHistorical ? (priceIsUp ? '▲ UP WINS' : '▼ DOWN WINS') : `${mult}×`, color: isHistorical ? (priceIsUp ? NP.green : NP.red) : NP.ink },
      ].map((s, i) => (
        <div key={s.label} style={{
          padding: '14px 16px',
          borderRight: i < 3 ? NP.border : 'none',
        }}>
          <div style={NP.label}>{s.label}</div>
          <div style={{ ...NP.mono, fontSize: 13, fontWeight: 900, color: s.color ?? NP.ink, marginTop: 6 }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );

  /* ── ARCHIVE SIDEBAR (Right column in historical mode) ── */
  const archiveSidebar = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      padding: '22px 20px',
      background: 'rgba(13,11,8,0.03)',
      height: '100%',
    }}>
      {/* Archive Header */}
      <div style={{ border: NP.border, padding: '20px 18px', background: NP.bg, textAlign: 'center' }}>
        {/* <span style={{ fontSize: 24, display: 'block', marginBottom: 10 }}>📜</span> */}
        <h4 style={{ ...NP.serif, fontSize: 18, fontWeight: 900, color: NP.ink, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Archive size={18} strokeWidth={2.5} />
          ARCHIVE DATA
        </h4>
        <p style={{ ...NP.mono, fontSize: 9, color: '#666', marginTop: 4 }}>
          ROUND IS CLOSED AND RESOLVED
        </p>
      </div>

      {/* Pools Info */}
      <div style={{ border: NP.border, padding: '16px 18px', background: NP.bg }}>
        <span style={{ ...NP.label, display: 'block', marginBottom: 12 }}>FINAL SENTIMENT</span>
        <PoolBar upPool={market.upPool} downPool={market.downPool} />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16, borderTop: '1px dashed rgba(13,11,8,0.15)', paddingTop: 12 }}>
          <div>
            <span style={NP.label}>UP Pool</span>
            <div style={{ ...NP.mono, fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>
              {market.upPool.toFixed(2)} TUSDC
            </div>
          </div>
          <div>
            <span style={NP.label}>DOWN Pool</span>
            <div style={{ ...NP.mono, fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>
              {market.downPool.toFixed(2)} TUSDC
            </div>
          </div>
        </div>
      </div>

      {/* Settle Details */}
      <div style={{ border: NP.border, padding: '16px 18px', background: NP.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span style={NP.label}>OPENING PRICE</span>
          <div style={{ ...NP.mono, fontSize: 15, fontWeight: 'bold', color: NP.ink, marginTop: 2 }}>
            {fmtUsd(market.startPrice)}
          </div>
        </div>
        <div>
          <span style={NP.label}>SETTLEMENT PRICE</span>
          <div style={{ ...NP.mono, fontSize: 15, fontWeight: 'bold', color: priceIsUp ? NP.green : NP.red, marginTop: 2 }}>
            {fmtUsd(market.currentPrice)}
          </div>
        </div>
        <div>
          <span style={NP.label}>RESOLUTION</span>
          <div style={{ ...NP.mono, fontSize: 12, fontWeight: 'bold', color: priceIsUp ? NP.green : NP.red, marginTop: 2 }}>
            {priceIsUp ? '▲ Price went UP' : '▼ Price went DOWN'}
          </div>
        </div>
      </div>

      {/* Return Button */}
      {onReturnToLive && (
        <button
          onClick={onReturnToLive}
          style={{
            width: '100%', padding: '16px 0',
            background: NP.ink, color: '#FAF8F3', border: NP.border,
            ...NP.mono, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: '4px 4px 0px rgba(0,0,0,0.15)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translate(2px, 2px)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '4px 4px 0px rgba(0,0,0,0.15)';
          }}
        >
          ← Return to Live Desk
        </button>
      )}
    </div>
  );

  /* ── LIVE EXECUTION SIDEBAR (Right column in normal mode) ── */
  const sidebar = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      padding: '22px 20px',
      background: 'rgba(13,11,8,0.02)',
      height: '100%',
    }}>
      {/* Betting card */}
      <div style={{
        border: NP.border, padding: '20px 18px', background: NP.bg,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* BUY / SELL Switch */}
        <div style={{ display: 'flex', border: NP.border, background: 'rgba(13,11,8,0.03)', padding: 2, marginBottom: 4 }}>
          {(['buy', 'sell'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setTradeMode(mode);
                setAmount('');
              }}
              style={{
                flex: 1, padding: '8px 0',
                background: tradeMode === mode ? NP.ink : 'transparent',
                color: tradeMode === mode ? '#FAF8F3' : NP.ink,
                border: 'none',
                ...NP.mono, fontSize: 10, fontWeight: 900,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}
            >
              {mode === 'buy' ? (
                <>
                  <TrendingUp size={14} strokeWidth={2.5} />
                  BUY
                </>
              ) : (
                <>
                  <TrendingDown size={14} strokeWidth={2.5} />
                  SELL
                </>
              )}
            </button>
          ))}
        </div>

        <div style={{ ...NP.serif, fontSize: 18, fontWeight: 900, borderBottom: NP.border, paddingBottom: 6 }}>
          {tradeMode === 'buy' ? 'Place Prediction' : 'Sell Share Position'}
        </div>

        {/* UP / DOWN toggle */}
        <div style={{ display: 'flex', border: NP.border }}>
          {(['up', 'down'] as const).map(s => (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                if (tradeMode === 'sell') setAmount('');
              }}
              style={{
                flex: 1, padding: '13px 0',
                background: side === s ? (s === 'up' ? NP.green : NP.red) : 'transparent',
                color: side === s ? '#FAF8F3' : NP.ink,
                border: 'none',
                borderRight: s === 'up' ? '2px solid #0D0B08' : 'none',
                ...NP.mono, fontSize: 10, fontWeight: 900,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
              }}
            >
              {s === 'up' ? `▲ UP (${upPct}%)` : `▼ DOWN (${downPct}%)`}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div>
          <div style={{ ...NP.label, marginBottom: 8 }}>
            {tradeMode === 'buy' ? `AMOUNT (${tokenSymbol})` : `SHARES TO SELL (${side.toUpperCase()})`}
          </div>
          <div style={{ display: 'flex', border: NP.border }}>
            <input
              type="number" min="0" step="any"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{
                flex: 1, padding: '12px 14px',
                background: 'transparent', border: 'none', outline: 'none',
                ...NP.mono, fontSize: 15, fontWeight: 900, color: NP.ink,
              }}
            />
            <span style={{
              padding: '12px 14px', borderLeft: NP.border,
              ...NP.mono, fontSize: 11, fontWeight: 900, color: '#333',
              display: 'flex', alignItems: 'center',
            }}>
              {tradeMode === 'buy' ? tokenSymbol : 'SHARES'}
            </span>
          </div>
          
          {/* Position details & Max shortcut when selling */}
          {account && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...NP.mono, fontSize: 9.5 }}>
              <span style={{ color: '#666' }}>YOUR POSITION:</span>
              <span
                onClick={() => {
                  if (tradeMode === 'sell') {
                    const maxVal = side === 'up' ? upShares : downShares;
                    setAmount(maxVal > 0 ? maxVal.toFixed(6) : '0');
                  }
                }}
                style={{
                  fontWeight: 'bold',
                  color: NP.ink,
                  cursor: tradeMode === 'sell' ? 'pointer' : 'default',
                  textDecoration: tradeMode === 'sell' ? 'underline' : 'none',
                }}
              >
                {side === 'up' ? `${upShares.toFixed(2)} UP Shares` : `${downShares.toFixed(2)} DOWN Shares`}
              </span>
            </div>
          )}
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(tradeMode === 'buy' ? ['10', '25', '50', '100'] : ['25%', '50%', '75%', '100%']).map(v => (
            <button
              key={v}
              onClick={() => {
                if (tradeMode === 'buy') {
                  setAmount(v);
                } else {
                  const maxVal = side === 'up' ? upShares : downShares;
                  const pct = Number(v.replace('%', '')) / 100;
                  setAmount((maxVal * pct).toFixed(6));
                }
              }}
              style={{
                flex: 1, padding: '8px 0',
                background: 'transparent',
                color: NP.ink,
                border: NP.border,
                ...NP.mono, fontSize: 10, fontWeight: 900,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = NP.ink;
                e.currentTarget.style.color = '#FAF8F3';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = NP.ink;
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Estimate & simplified Web2-friendly breakdown panel */}
        <div style={{
          border: NP.border,
          background: 'rgba(13,11,8,0.02)',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...NP.label, fontSize: 9 }}>{tradeMode === 'buy' ? 'EST. RETURN' : 'EST. VALUE'}</span>
            <span style={{ ...NP.mono, fontSize: 15, fontWeight: 900,
              color: tradeMode === 'buy' ? (side === 'up' ? NP.green : NP.red) : NP.green }}>
              {tradeMode === 'buy'
                ? `~${(amount && !isNaN(Number(amount)) ? (Number(amount) * Number(mult)).toFixed(2) : '0.00')} ${tokenSymbol}`
                : `~${(amount && !isNaN(Number(amount)) ? sellQuote.toFixed(2) : '0.00')} ${tokenSymbol}`}
            </span>
          </div>

          <div style={{
            borderTop: '1px dashed rgba(13,11,8,0.15)',
            paddingTop: 8,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 12px',
            ...NP.mono,
            fontSize: 9.5,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#666', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>Gas Fees</span>
              <span style={{ fontWeight: 'bold', color: NP.green }}>$0.00 FREE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#666', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>Price Feed</span>
              <span style={{ fontWeight: 'bold' }}>FAST ORACLE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#666', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>Pool Size</span>
              <span style={{ fontWeight: 'bold' }}>{totalPool.toFixed(2)} USDC</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#666', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>Est. Tickets</span>
              <span style={{ fontWeight: 'bold', color: tradeMode === 'buy' ? (side === 'up' ? NP.green : NP.red) : NP.ink }}>
                {amount && !isNaN(Number(amount)) && Number(amount) > 0 
                  ? `${Number(amount).toFixed(0)} ${side.toUpperCase()}`
                  : '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Action button */}
        {isOpen ? (
          <button
            onClick={handleSubmit}
            disabled={busy || !amount || Number(amount) <= 0}
            style={{
              width: '100%', padding: '14px 0',
              background: busy || !amount ? '#888' : (tradeMode === 'buy' ? (side === 'up' ? NP.green : NP.red) : NP.ink),
              color: '#FAF8F3', border: NP.border,
              ...NP.mono, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: busy || !amount ? 'not-allowed' : 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {busy ? 'SUBMITTING…' : (tradeMode === 'buy' ? `PLACE ${side.toUpperCase()} POSITION →` : `SELL ${side.toUpperCase()} POSITION →`)}
          </button>
        ) : isExpired ? (
          <button
            onClick={() => onResolveMarket(market.assetId)}
            style={{
              width: '100%', padding: '14px 0',
              background: '#D97706', color: '#FAF8F3', border: NP.border,
              ...NP.mono, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            SETTLE ROUND →
          </button>
        ) : (
          <button
            onClick={() => onClaimWinnings(market.assetId)}
            style={{
              width: '100%', padding: '14px 0',
              background: '#1D4ED8', color: '#FAF8F3', border: NP.border,
              ...NP.mono, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            CLAIM WINNINGS →
          </button>
        )}
      </div>
    </div>
  );

  /* ── CHART AREA ── */
  const chartArea = (
    <div style={{
      padding: '12px 20px 6px',
      flex: 1,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
      {!isHistorical && isOpen && (
        <div style={{
          position: 'absolute',
          top: 22,
          right: 92,
          background: NP.ink,
          color: '#FAF8F3',
          border: NP.border,
          padding: '8px 14px',
          ...NP.mono,
          fontSize: 16,
          fontWeight: 900,
          boxShadow: '4px 4px 0px rgba(0,0,0,0.2)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 2,
        }}>
          <Clock size={15} strokeWidth={3} />
          <span>{fmtCountdown(msLeft)}</span>
        </div>
      )}
      <LineChart
        history={history}
        startPrice={market.startPrice}
        currentPrice={market.currentPrice}
        isUp={priceIsUp}
        width={isDesktop ? chartWidth - 360 - 44 : chartWidth - 40}
        height={isDesktop ? 300 : 200}
        isHistorical={isHistorical}
      />
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{ border: NP.border, background: NP.bg }}
    >
      {isDesktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 480 }}>
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: NP.border }}>
            {header}
            {chartArea}
            {statsGrid}
          </div>
          <div>{isHistorical ? archiveSidebar : sidebar}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {header}
          {chartArea}
          {statsGrid}
          <div style={{ borderTop: NP.border }}>{isHistorical ? archiveSidebar : sidebar}</div>
        </div>
      )}
    </div>
  );
}