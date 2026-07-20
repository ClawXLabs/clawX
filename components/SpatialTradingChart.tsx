/**
 * SpatialTradingChart
 * ───────────────────
 * Canvas price chart: ticks live in mutable refs + rAF (60fps),
 * not React state — so sub-second updates never thrash the render tree.
 *
 * Viewport: current time locked ~35% from the left (History | Future).
 * Line / tip color comes from the market’s own brand color.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { MarketInfo, PriceTick } from '../contexts/MarketDataContext';

interface SpatialTradingChartProps {
  market: MarketInfo;
  history: PriceTick[];
  isHistorical?: boolean;
}

const INK = '#0D0B08';
const PAPER = '#FAF8F3';
const GREEN = '#1E5E3A';
const RED = '#8A1C14';
const NOW_FRAC = 0.35;
const HISTORY_WINDOW_MS = 90_000;
const FUTURE_WINDOW_MS = 180_000;
const Y_PAD_FRAC = 0.12;
/** Small inset so labels don’t clip the edge — not the old 30% ridge margins. */
const EDGE = 28;

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

interface Engine {
  width: number;
  height: number;
  dpr: number;
  ticks: PriceTick[];
  nowMs: number;
  startPrice: number;
  symbol: string;
  color: string;
}

export default function SpatialTradingChart({
  market,
  history,
  isHistorical = false,
}: SpatialTradingChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>({
    width: 0,
    height: 0,
    dpr: 1,
    ticks: [],
    nowMs: Date.now(),
    startPrice: market.startPrice,
    symbol: market.symbol,
    color: market.color || INK,
  });
  const [hud, setHud] = useState({ price: market.currentPrice, now: Date.now() });

  useEffect(() => {
    const e = engineRef.current;
    e.ticks = history.length
      ? [...history]
      : [{ t: Date.now(), price: market.currentPrice }];
    const last = e.ticks[e.ticks.length - 1];
    if (!last || Math.abs(last.price - market.currentPrice) > 1e-12 || Date.now() - last.t > 800) {
      e.ticks.push({ t: Date.now(), price: market.currentPrice });
      if (e.ticks.length > 800) e.ticks = e.ticks.slice(-600);
    }
    e.startPrice = market.startPrice;
    e.symbol = market.symbol;
    e.color = market.color || INK;
  }, [history, market.currentPrice, market.startPrice, market.symbol, market.color]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const e = engineRef.current;
      e.width = w;
      e.height = h;
      e.dpr = dpr;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const scales = useCallback(() => {
    const e = engineRef.current;
    const W = e.width;
    const H = e.height;
    const nowX = W * NOW_FRAC;
    const bandTop = EDGE;
    const bandBot = H - EDGE;
    const bandH = Math.max(1, bandBot - bandTop);

    const now = e.nowMs;
    const tMin = now - HISTORY_WINDOW_MS;
    const tMax = now + FUTURE_WINDOW_MS;

    const visible = e.ticks.filter((p) => p.t >= tMin - 5_000 && p.t <= now + 1_000);
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const p of visible) {
      pMin = Math.min(pMin, p.price);
      pMax = Math.max(pMax, p.price);
    }
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMin === pMax) {
      const mid = e.ticks[e.ticks.length - 1]?.price || e.startPrice || 1;
      pMin = mid * 0.998;
      pMax = mid * 1.002;
    }
    pMin = Math.min(pMin, e.startPrice);
    pMax = Math.max(pMax, e.startPrice);
    const span = pMax - pMin || 1;
    pMin -= span * Y_PAD_FRAC;
    pMax += span * Y_PAD_FRAC;

    const timeToX = (t: number) => {
      if (t <= now) {
        const u = (t - tMin) / (now - tMin || 1);
        return u * nowX;
      }
      const u = (t - now) / (tMax - now || 1);
      return nowX + u * (W - nowX);
    };
    const priceToY = (p: number) => {
      const u = (p - pMin) / (pMax - pMin || 1);
      return bandBot - u * bandH;
    };

    return { W, H, nowX, bandTop, bandBot, tMin, tMax, now, pMin, pMax, timeToX, priceToY };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastHud = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const e = engineRef.current;
      if (!canvas || e.width < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }

      e.nowMs = Date.now();
      const tip = e.ticks[e.ticks.length - 1] || { t: e.nowMs, price: e.startPrice };
      const lineColor = e.color || INK;

      const s = scales();
      const { W, H, nowX, bandTop, bandBot, timeToX, priceToY, pMin, pMax, tMin, tMax } = s;

      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);

      // Future zone wash
      ctx.fillStyle = 'rgba(13,11,8,0.03)';
      ctx.fillRect(nowX, 0, W - nowX, H);

      // Now vertical
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(nowX + 0.5, 0);
      ctx.lineTo(nowX + 0.5, H);
      ctx.stroke();

      // Open price reference
      const openY = priceToY(e.startPrice);
      ctx.strokeStyle = 'rgba(13,11,8,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, openY);
      ctx.lineTo(W, openY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price line
      const pts = e.ticks.filter((p) => p.t >= tMin && p.t <= e.nowMs + 50);
      if (pts.length >= 2) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = timeToX(p.t);
          const y = priceToY(p.price);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      // Leading node
      const nodeX = timeToX(Math.min(tip.t, e.nowMs));
      const nodeY = priceToY(tip.price);
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Left gutter — price labels
      ctx.font = '700 11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const priceSteps = 5;
      for (let i = 0; i <= priceSteps; i++) {
        const p = pMin + ((pMax - pMin) * i) / priceSteps;
        const y = priceToY(p);
        if (y < bandTop - 2 || y > bandBot + 2) continue;
        ctx.fillStyle = 'rgba(13,11,8,0.55)';
        ctx.fillText(fmtUsd(p), 10, y);
        ctx.strokeStyle = 'rgba(13,11,8,0.08)';
        ctx.beginPath();
        ctx.moveTo(72, y);
        ctx.lineTo(W - 72, y);
        ctx.stroke();
      }

      // Right gutter — live price
      ctx.textAlign = 'right';
      ctx.fillStyle = lineColor;
      ctx.font = '900 13px "Courier New", monospace';
      ctx.fillText(fmtUsd(tip.price), W - 12, nodeY);
      ctx.font = '700 10px "Courier New", monospace';
      ctx.fillStyle = tip.price >= e.startPrice ? GREEN : RED;
      const pct = e.startPrice > 0 ? ((tip.price - e.startPrice) / e.startPrice) * 100 : 0;
      ctx.fillText(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(3)}%`, W - 12, nodeY + 16);

      // Time ticks
      ctx.fillStyle = 'rgba(13,11,8,0.55)';
      ctx.font = '700 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const t of [tMin, e.nowMs, tMax]) {
        ctx.fillText(fmtClock(t), timeToX(t), H - 18);
      }
      ctx.fillStyle = INK;
      ctx.font = '900 10px "Courier New", monospace';
      ctx.fillText('NOW', nowX, 10);
      ctx.fillStyle = 'rgba(13,11,8,0.45)';
      ctx.fillText('HISTORY', nowX * 0.45, 10);
      ctx.fillText('FUTURE', nowX + (W - nowX) * 0.55, 10);

      if (isHistorical) {
        ctx.fillStyle = 'rgba(138,28,20,0.08)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = RED;
        ctx.font = '900 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCHIVE VIEW', W / 2, 28);
      }

      if (e.nowMs - lastHud > 200) {
        lastHud = e.nowMs;
        setHud({ price: tip.price, now: e.nowMs });
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isHistorical, scales]);

  const lineColor = market.color || INK;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        inset: 0,
        background: PAPER,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          border: `1px solid ${INK}`,
          background: PAPER,
          padding: '8px 14px',
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: 700,
          zIndex: 5,
          pointerEvents: 'none',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: lineColor,
            flexShrink: 0,
          }}
        />
        <span>{market.symbol}</span>
        <span style={{ fontWeight: 900, color: lineColor }}>{fmtUsd(hud.price)}</span>
        <span style={{ color: '#5A554E' }}>{fmtClock(hud.now)}</span>
      </div>
    </div>
  );
}
