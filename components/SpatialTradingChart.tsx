/**
 * SpatialTradingChart
 * Canvas price chart with rAF render loop, smooth Catmull-Rom path,
 * wheel zoom + drag pan, single LIVE toggle, and hover zoom slider.
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
/** Bright live indicator (not the dark chart red) */
const LIVE_RED = '#FF3B30';
const LIVE_RED_FADED = 'rgba(255,59,48,0.28)';
const EDGE = 32;
const Y_PAD_FRAC = 0.14;
const DEFAULT_WINDOW_MS = 120_000;
const MIN_WINDOW_MS = 20_000;
const MAX_WINDOW_MS = 20 * 60_000;
const PRICE_SMOOTH = 0.08;
const RANGE_SMOOTH = 0.06;
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

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  endTimeMs: number;
  symbol: string;
  color: string;
  windowMs: number;
  panMs: number;
  followLive: boolean;
  displayPrice: number;
  pMin: number;
  pMax: number;
  openFade: number;
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
    endTimeMs: market.endTime * 1000,
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
    windowMs: DEFAULT_WINDOW_MS,
    msLeft: Math.max(0, market.endTime * 1000 - Date.now()),
  });
  const [zoomHover, setZoomHover] = useState(false);
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
    e.endTimeMs = market.endTime * 1000;
    e.symbol = market.symbol;
    e.color = market.color || INK;

    const roundKey = `${market.roundId}:${market.startPrice}`;
    if (roundKeyRef.current !== roundKey) {
      roundKeyRef.current = roundKey;
      e.openFade = 0;
      e.windowMs = DEFAULT_WINDOW_MS;
      e.panMs = 0;
      e.followLive = true;
    }
  }, [history, market.currentPrice, market.startPrice, market.startTime, market.endTime, market.symbol, market.color, market.roundId]);

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

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const e = engineRef.current;
      const factor = ev.deltaY > 0 ? 1.12 : 0.89;
      const next = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, e.windowMs * factor));
      const rect = wrap.getBoundingClientRect();
      const xFrac = (ev.clientX - rect.left) / (rect.width || 1);
      const center = e.followLive ? e.nowMs : e.nowMs + e.panMs;
      const tMin = center - e.windowMs * 0.55;
      const tAtCursor = tMin + xFrac * e.windowMs;
      e.windowMs = next;
      const newTMin = tAtCursor - xFrac * next;
      const newCenter = newTMin + next * 0.55;
      if (e.followLive) {
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

  const setZoomMs = useCallback((ms: number) => {
    const e = engineRef.current;
    e.windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, ms));
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
      e.displayPrice += (tip.price - e.displayPrice) * PRICE_SMOOTH;
      if (e.openFade < 1) e.openFade = Math.min(1, e.openFade + 16 / OPEN_FADE_MS);

      const lineColor = e.color || INK;
      const s = scales();
      const { W, H, bandTop, bandBot, timeToX, priceToY, pMin, pMax, tMin, tMax } = s;

      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);

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

      // Round open — dashed, market-colored
      const openY = priceToY(e.startPrice);
      const openAlpha = 0.35 + 0.65 * e.openFade;
      ctx.save();
      ctx.globalAlpha = openAlpha;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(0, openY);
      ctx.lineTo(W, openY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 10px "Courier New", monospace';
      ctx.fillStyle = lineColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`ROUND OPEN  ${fmtUsd(e.startPrice)}`, 78, openY - 4);
      ctx.restore();

      const ptsRaw = e.ticks.filter((p) => p.t >= tMin - 1_000 && p.t <= Math.min(e.nowMs + 50, tMax + 1_000));
      const drawPts: { x: number; y: number }[] = ptsRaw.map((p) => ({
        x: timeToX(p.t),
        y: priceToY(p.price),
      }));
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

        ctx.strokeStyle = lineColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 8;
        strokeSmoothPath(ctx, drawPts, 0.38);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

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

        ctx.textAlign = 'right';
        ctx.fillStyle = lineColor;
        ctx.font = '900 13px "Courier New", monospace';
        ctx.fillText(fmtUsd(e.displayPrice), W - 12, node.y);
        ctx.font = '700 10px "Courier New", monospace';
        ctx.fillStyle = e.displayPrice >= e.startPrice ? GREEN : RED;
        const pct = e.startPrice > 0 ? ((e.displayPrice - e.startPrice) / e.startPrice) * 100 : 0;
        ctx.fillText(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(3)}%`, W - 12, node.y + 16);
      }

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
          windowMs: e.windowMs,
          msLeft: Math.max(0, e.endTimeMs - e.nowMs),
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
    e.dragStartPan = e.followLive ? 0 : e.panMs;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    if (!e.dragging || e.width < 2) return;
    const dx = ev.clientX - e.dragStartX;
    if (Math.abs(dx) < 3) return;
    e.followLive = false;
    e.panMs = e.dragStartPan - (dx / e.width) * e.windowMs;
  };

  const onPointerUp = () => {
    engineRef.current.dragging = false;
  };

  const lineColor = market.color || INK;
  const live = hud.followLive;

  // Slider: right = zoom in (small window), left = zoom out (large window)
  const zoomSliderVal = (() => {
    const logMin = Math.log(MIN_WINDOW_MS);
    const logMax = Math.log(MAX_WINDOW_MS);
    const logCur = Math.log(hud.windowMs);
    return 100 - ((logCur - logMin) / (logMax - logMin)) * 100;
  })();

  const onZoomSlider = (val: number) => {
    const logMin = Math.log(MIN_WINDOW_MS);
    const logMax = Math.log(MAX_WINDOW_MS);
    const inverted = 100 - val;
    setZoomMs(Math.exp(logMin + (inverted / 100) * (logMax - logMin)));
  };

  const timerCritical = hud.msLeft < 60_000;
  const timerWarn = hud.msLeft < 120_000;

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

      {/* LIVE indicator — bright red + LIVE text */}
      <button
        type="button"
        onClick={goLive}
        title={live ? 'Following live price' : 'Click to return to live'}
        aria-label={live ? 'Live' : 'Return to live'}
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          border: 'none',
          background: 'transparent',
          cursor: live ? 'default' : 'pointer',
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.14em',
          color: live ? INK : 'rgba(13,11,8,0.4)',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: live ? LIVE_RED : LIVE_RED_FADED,
            boxShadow: live ? '0 0 0 3px rgba(255,59,48,0.28)' : 'none',
            flexShrink: 0,
          }}
        />
        LIVE
      </button>

      {/* Market timer — top right, no box */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 20,
          zIndex: 6,
          pointerEvents: 'none',
          fontFamily: '"Courier New", monospace',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: '0.06em',
          color: isHistorical
            ? '#5A554E'
            : hud.msLeft <= 0
              ? RED
              : timerCritical
                ? LIVE_RED
                : timerWarn
                  ? '#D97706'
                  : INK,
        }}
      >
        {isHistorical ? 'ARCHIVE' : hud.msLeft <= 0 ? 'SETTLE' : fmtCountdown(hud.msLeft)}
      </div>

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
      </div>

      {/* Bottom-right zoom — square value; expands with slider on hover */}
      <div
        onMouseEnter={() => setZoomHover(true)}
        onMouseLeave={() => setZoomHover(false)}
        style={{
          position: 'absolute',
          bottom: 28,
          right: 16,
          zIndex: 6,
          border: `1px solid ${INK}`,
          background: PAPER,
          width: zoomHover ? 168 : 52,
          height: zoomHover ? 72 : 52,
          padding: zoomHover ? '10px 12px' : 0,
          boxSizing: 'border-box',
          fontFamily: '"Courier New", monospace',
          display: 'flex',
          flexDirection: 'column',
          alignItems: zoomHover ? 'stretch' : 'center',
          justifyContent: zoomHover ? 'flex-start' : 'center',
          transition: 'width 0.15s ease, height 0.15s ease, padding 0.15s ease',
          overflow: 'hidden',
        }}
      >
        {!zoomHover ? (
          <span style={{ fontSize: 12, fontWeight: 900, color: INK }}>{hud.zoom}</span>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#5A554E' }}>ZOOM</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: INK }}>{hud.zoom}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={zoomSliderVal}
              onChange={(ev) => onZoomSlider(Number(ev.target.value))}
              style={{ width: '100%', marginTop: 10, cursor: 'pointer', accentColor: lineColor }}
            />
          </>
        )}
      </div>
    </div>
  );
}
