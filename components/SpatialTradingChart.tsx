/**
 * SpatialTradingChart
 * Canvas price chart with rAF render loop, smooth Catmull-Rom path,
 * wheel zoom + drag/button pan, and a dashed round-open price line.
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
const EDGE = 32;
const Y_PAD_FRAC = 0.14;
const DEFAULT_WINDOW_MS = 120_000;
const MIN_WINDOW_MS = 20_000;
const MAX_WINDOW_MS = 20 * 60_000;
const PRICE_SMOOTH = 0.08;   // tip lerp per frame (~smooth wave)
const RANGE_SMOOTH = 0.06;   // Y-axis ease
const OPEN_FADE_MS = 900;

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

/** Catmull-Rom → cubic Bezier on canvas */
function strokeSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  tension = 0.35,
) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

interface Engine {
  width: number;
  height: number;
  dpr: number;
  ticks: PriceTick[];
  nowMs: number;
  startPrice: number;
  startTimeMs: number;
  symbol: string;
  color: string;
  /** Visible time window width */
  windowMs: number;
  /** Shift of window center vs live (negative = look left / older) */
  panMs: number;
  followLive: boolean;
  displayPrice: number;
  pMin: number;
  pMax: number;
  openFade: number; // 0→1
  dragging: boolean;
  dragStartX: number;
  dragStartPan: number;
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
    startTimeMs: market.startTime * 1000,
    symbol: market.symbol,
    color: market.color || INK,
    windowMs: DEFAULT_WINDOW_MS,
    panMs: 0,
    followLive: true,
    displayPrice: market.currentPrice,
    pMin: market.currentPrice * 0.998,
    pMax: market.currentPrice * 1.002,
    openFade: 0,
    dragging: false,
    dragStartX: 0,
    dragStartPan: 0,
  });
  const [hud, setHud] = useState({
    price: market.currentPrice,
    now: Date.now(),
    zoom: '1×',
    followLive: true,
  });
  const roundKeyRef = useRef(`${market.roundId}:${market.startPrice}`);

  useEffect(() => {
    const e = engineRef.current;
    e.ticks = history.length
      ? [...history]
      : [{ t: Date.now(), price: market.currentPrice }];
    const last = e.ticks[e.ticks.length - 1];
    if (!last || Math.abs(last.price - market.currentPrice) > 1e-12 || Date.now() - last.t > 800) {
      e.ticks.push({ t: Date.now(), price: market.currentPrice });
      if (e.ticks.length > 1200) e.ticks = e.ticks.slice(-900);
    }
    e.startPrice = market.startPrice;
    e.startTimeMs = market.startTime * 1000;
    e.symbol = market.symbol;
    e.color = market.color || INK;

    const roundKey = `${market.roundId}:${market.startPrice}`;
    if (roundKeyRef.current !== roundKey) {
      roundKeyRef.current = roundKey;
      e.openFade = 0;
      // Soft reset zoom/pan on new round open
      e.windowMs = DEFAULT_WINDOW_MS;
      e.panMs = 0;
      e.followLive = true;
    }
  }, [history, market.currentPrice, market.startPrice, market.startTime, market.symbol, market.color, market.roundId]);

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

  // Wheel zoom + drag pan on the wrap (non-passive wheel)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const e = engineRef.current;
      const factor = ev.deltaY > 0 ? 1.12 : 0.89;
      const next = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, e.windowMs * factor));
      // Zoom around cursor time
      const rect = wrap.getBoundingClientRect();
      const xFrac = (ev.clientX - rect.left) / (rect.width || 1);
      const center = (e.followLive ? e.nowMs : e.nowMs + e.panMs);
      const tMin = center - e.windowMs * 0.55;
      const tAtCursor = tMin + xFrac * e.windowMs;
      e.windowMs = next;
      const newTMin = tAtCursor - xFrac * next;
      const newCenter = newTMin + next * 0.55;
      if (e.followLive) {
        // stay live unless user zooms while already panned
        e.panMs = 0;
      } else {
        e.panMs = newCenter - e.nowMs;
      }
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const goLive = useCallback(() => {
    const e = engineRef.current;
    e.followLive = true;
    e.panMs = 0;
  }, []);

  const panBy = useCallback((dir: -1 | 1) => {
    const e = engineRef.current;
    e.followLive = false;
    e.panMs += dir * e.windowMs * 0.35;
  }, []);

  const scales = useCallback(() => {
    const e = engineRef.current;
    const W = e.width;
    const H = e.height;
    const bandTop = EDGE;
    const bandBot = H - EDGE;
    const bandH = Math.max(1, bandBot - bandTop);

    const now = e.nowMs;
    const center = e.followLive ? now : now + e.panMs;
    // Slight bias so live tip sits a bit right of center when following
    const tMin = center - e.windowMs * (e.followLive ? 0.62 : 0.5);
    const tMax = tMin + e.windowMs;

    const visible = e.ticks.filter((p) => p.t >= tMin - 2_000 && p.t <= tMax + 2_000);
    let rawMin = Infinity;
    let rawMax = -Infinity;
    for (const p of visible) {
      rawMin = Math.min(rawMin, p.price);
      rawMax = Math.max(rawMax, p.price);
    }
    if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMin === rawMax) {
      const mid = e.displayPrice || e.startPrice || 1;
      rawMin = mid * 0.998;
      rawMax = mid * 1.002;
    }
    rawMin = Math.min(rawMin, e.startPrice, e.displayPrice);
    rawMax = Math.max(rawMax, e.startPrice, e.displayPrice);
    const span = Math.max(rawMax - rawMin, (e.startPrice || 1) * 0.0015);
    const targetMin = rawMin - span * Y_PAD_FRAC;
    const targetMax = rawMax + span * Y_PAD_FRAC;

    // Ease Y range for smooth open / updates
    e.pMin += (targetMin - e.pMin) * RANGE_SMOOTH;
    e.pMax += (targetMax - e.pMax) * RANGE_SMOOTH;
    if (!Number.isFinite(e.pMin) || !Number.isFinite(e.pMax) || e.pMin >= e.pMax) {
      e.pMin = targetMin;
      e.pMax = targetMax;
    }

    const timeToX = (t: number) => {
      const u = (t - tMin) / (tMax - tMin || 1);
      return u * W;
    };
    const priceToY = (p: number) => {
      const u = (p - e.pMin) / (e.pMax - e.pMin || 1);
      return bandBot - u * bandH;
    };

    return { W, H, bandTop, bandBot, tMin, tMax, now, timeToX, priceToY, pMin: e.pMin, pMax: e.pMax };
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
      // Smooth tip — wavy instead of snappy
      e.displayPrice += (tip.price - e.displayPrice) * PRICE_SMOOTH;
      // Soft open of round line
      if (e.openFade < 1) e.openFade = Math.min(1, e.openFade + 16 / OPEN_FADE_MS);

      const lineColor = e.color || INK;
      const s = scales();
      const { W, H, bandTop, bandBot, timeToX, priceToY, pMin, pMax, tMin, tMax } = s;

      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);

      // Soft horizontal grid
      ctx.font = '700 11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const priceSteps = 5;
      for (let i = 0; i <= priceSteps; i++) {
        const p = pMin + ((pMax - pMin) * i) / priceSteps;
        const y = priceToY(p);
        if (y < bandTop - 2 || y > bandBot + 2) continue;
        ctx.strokeStyle = 'rgba(13,11,8,0.07)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(72, y);
        ctx.lineTo(W - 72, y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(13,11,8,0.5)';
        ctx.fillText(fmtUsd(p), 10, y);
      }

      // Round open — dashed horizontal (eased in)
      const openY = priceToY(e.startPrice);
      const openAlpha = 0.25 + 0.55 * e.openFade;
      ctx.save();
      ctx.globalAlpha = openAlpha;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(0, openY);
      ctx.lineTo(W, openY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 10px "Courier New", monospace';
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`ROUND OPEN  ${fmtUsd(e.startPrice)}`, 78, openY - 4);
      ctx.restore();

      // Smooth price path (history within window + synthetic tip at displayPrice)
      const ptsRaw = e.ticks.filter((p) => p.t >= tMin - 1_000 && p.t <= Math.min(e.nowMs + 50, tMax + 1_000));
      const drawPts: { x: number; y: number }[] = ptsRaw.map((p) => ({
        x: timeToX(p.t),
        y: priceToY(p.price),
      }));
      // Replace last point Y with smoothed display price for fluid tip motion
      if (drawPts.length >= 1) {
        const tipT = Math.min(tip.t, e.nowMs);
        drawPts[drawPts.length - 1] = {
          x: timeToX(tipT),
          y: priceToY(e.displayPrice),
        };
      }

      if (drawPts.length >= 2) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.75;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        strokeSmoothPath(ctx, drawPts, 0.38);
        ctx.stroke();

        // Soft under-glow for wave feel
        ctx.strokeStyle = lineColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 8;
        strokeSmoothPath(ctx, drawPts, 0.38);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Leading node (smoothed)
      if (drawPts.length >= 1) {
        const node = drawPts[drawPts.length - 1];
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.75;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Right live readout
        ctx.textAlign = 'right';
        ctx.fillStyle = lineColor;
        ctx.font = '900 13px "Courier New", monospace';
        ctx.fillText(fmtUsd(e.displayPrice), W - 12, node.y);
        ctx.font = '700 10px "Courier New", monospace';
        ctx.fillStyle = e.displayPrice >= e.startPrice ? GREEN : RED;
        const pct = e.startPrice > 0 ? ((e.displayPrice - e.startPrice) / e.startPrice) * 100 : 0;
        ctx.fillText(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(3)}%`, W - 12, node.y + 16);
      }

      // Time ticks along bottom
      ctx.fillStyle = 'rgba(13,11,8,0.5)';
      ctx.font = '700 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const marks = 5;
      for (let i = 0; i <= marks; i++) {
        const t = tMin + ((tMax - tMin) * i) / marks;
        ctx.fillText(fmtClock(t), timeToX(t), H - 18);
      }

      if (isHistorical) {
        ctx.fillStyle = 'rgba(138,28,20,0.08)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = RED;
        ctx.font = '900 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCHIVE VIEW', W / 2, 28);
      }

      if (e.nowMs - lastHud > 160) {
        lastHud = e.nowMs;
        const zoom = DEFAULT_WINDOW_MS / e.windowMs;
        setHud({
          price: e.displayPrice,
          now: e.nowMs,
          zoom: `${zoom >= 1 ? zoom.toFixed(1) : zoom.toFixed(2)}×`,
          followLive: e.followLive,
        });
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isHistorical, scales]);

  const onPointerDown = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    e.dragging = true;
    e.dragStartX = ev.clientX;
    e.dragStartPan = e.panMs;
    e.followLive = false;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    if (!e.dragging || e.width < 2) return;
    const dx = ev.clientX - e.dragStartX;
    // Drag right → look left (older)
    e.panMs = e.dragStartPan - (dx / e.width) * e.windowMs;
  };

  const onPointerUp = () => {
    engineRef.current.dragging = false;
  };

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
        touchAction: 'none',
        cursor: 'grab',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Pan / zoom controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 0,
          border: `1px solid ${INK}`,
          background: PAPER,
          zIndex: 6,
        }}
      >
        <button
          type="button"
          onClick={() => panBy(-1)}
          title="Look left (older)"
          style={ctrlBtn}
        >
          ←
        </button>
        <button
          type="button"
          onClick={goLive}
          title="Jump to live"
          style={{
            ...ctrlBtn,
            borderLeft: `1px solid ${INK}`,
            borderRight: `1px solid ${INK}`,
            background: hud.followLive ? INK : PAPER,
            color: hud.followLive ? PAPER : INK,
            minWidth: 64,
          }}
        >
          LIVE
        </button>
        <button
          type="button"
          onClick={() => panBy(1)}
          title="Look right (ahead)"
          style={ctrlBtn}
        >
          →
        </button>
      </div>

      {/* Interaction layer for drag pan */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={goLive}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

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
        <span style={{ color: '#5A554E' }}>ZOOM {hud.zoom}</span>
        <span style={{ color: '#888', fontSize: 9 }}>scroll · drag · ←→</span>
      </div>
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  padding: '8px 14px',
  border: 'none',
  background: 'transparent',
  color: INK,
  fontFamily: '"Courier New", monospace',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
  minWidth: 40,
};
