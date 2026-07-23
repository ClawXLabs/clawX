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
  onReturnToLive?: () => void;
}

const INK = '#0D0B08';
const PAPER = '#FAF8F3';
const GREEN = '#1E5E3A';
const RED = '#8A1C14';
/** Bright live indicator (not the dark chart red) */
const LIVE_RED = '#FF3B30';
const LIVE_RED_FADED = 'rgba(255,59,48,0.28)';
const EDGE = 32;
const Y_PAD_FRAC = 0.18;
const DEFAULT_WINDOW_MS = 120_000;
const MIN_WINDOW_MS = 20_000;
const MAX_WINDOW_MS = 20 * 60_000;
/**
 * Auto-zoom (Y): tighten quickly on quiet markets so tiny moves fill the
 * band; open more gently on spikes so the frame doesn't flicker.
 */
const RANGE_SMOOTH_IN = 0.22;
const RANGE_SMOOTH_OUT = 0.08;
/** Floor span as a fraction of mid price — small enough that quiet ticks still read. */
const MIN_SPAN_FRAC = 0.00012;
/** Soft ceiling before we treat action as "big" and let the pad breathe more. */
const COMFORT_SPAN_FRAC = 0.004;
/**
 * Per-frame ease for tip PRICE only. Tip TIME is always wall-clock forward —
 * never allowed to decrease — so the drawn path cannot reverse on X.
 */
const TIP_EASE = 0.28;
const OPEN_FADE_MS = 900;
/** Chart playhead lags wall-clock so upcoming ticks are already buffered. */
const CHART_LAG_MS = 1600;
const TRAIL_MIN_DIST_FRAC = 0.00003;
const TRAIL_MIN_MS = 24;
/** Keep ~3×5m rounds of drawn path per market. */
const TRAIL_KEEP_MS = 3 * 5 * 60 * 1000;
/** Live path tension — lower than archive to avoid Bezier X/Y "hooks" that look like reverse. */
const LIVE_PATH_TENSION = 0.28;

interface ChartCache {
  trail: PriceTick[];
  tip: { t: number; price: number };
  tipTarget: { t: number; price: number };
  windowMs: number;
  panMs: number;
  followLive: boolean;
  pMin: number;
  pMax: number;
}

/** Survives market switches so each asset keeps its line shape. */
const chartCacheByAsset = new Map<number, ChartCache>();

function trimTrail(trail: PriceTick[], nowMs: number): PriceTick[] {
  const cutoff = nowMs - TRAIL_KEEP_MS;
  const kept = trail.filter((p) => p.t >= cutoff);
  return kept.length >= 2 ? kept : trail.slice(-120);
}

/**
 * Guarantees the tick buffer used for Catmull-Rom sampling is strictly
 * ordered and non-regressing in time.
 *
 * Upstream data (the `history` prop) can arrive re-ordered, re-windowed,
 * or with a duplicate/near-duplicate timestamp on reconnect. Feeding that
 * straight into the interpolator is what causes the visible "snap back"
 * glitch: the segment lookup in samplePriceAt() assumes ascending time,
 * so a single out-of-order point can make it pick the wrong neighbors for
 * a frame or two and the tip briefly jumps to a stale/incorrect price.
 */
function sanitizeTicks(raw: PriceTick[]): PriceTick[] {
  if (raw.length <= 1) return raw;
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  const clean: PriceTick[] = [];
  for (const p of sorted) {
    const prev = clean[clean.length - 1];
    if (!prev) {
      clean.push(p);
      continue;
    }
    if (p.t === prev.t) {
      // Same instant reported twice (e.g. a corrected re-send) — keep the newest value.
      clean[clean.length - 1] = p;
      continue;
    }
    if (p.t < prev.t) continue; // shouldn't happen post-sort, guard anyway
    clean.push(p);
  }
  return clean;
}

/**
 * Append-only merge into the engine tick buffer.
 * Replacing the whole array from `history` every poll was a major snap source:
 * upstream can re-window / correct past stamps, which changes Catmull samples
 * under the lag playhead and makes the tip jump. We only extend forward
 * (and may refresh the newest point).
 */
function mergeTicksForward(
  existing: PriceTick[],
  incoming: PriceTick[],
  livePrice: number,
): PriceTick[] {
  const clean = sanitizeTicks(incoming);
  if (!existing.length) {
    const base = clean.length ? [...clean] : [];
    const last = base[base.length - 1];
    const stamp = Math.max(Date.now(), last ? last.t + 1 : Date.now());
    if (!last || Math.abs(last.price - livePrice) > 1e-12) {
      base.push({ t: stamp, price: livePrice });
    }
    return base;
  }

  const out = existing.length > 2000 ? existing.slice(-1800) : existing.slice();
  let lastT = out[out.length - 1].t;
  for (const p of clean) {
    if (p.t < lastT) continue;
    if (p.t === lastT) {
      out[out.length - 1] = { t: p.t, price: p.price };
      continue;
    }
    out.push(p);
    lastT = p.t;
  }

  const last = out[out.length - 1];
  if (Math.abs(last.price - livePrice) > 1e-12) {
    out.push({ t: Math.max(Date.now(), last.t + 1), price: livePrice });
  }
  return out.length > 2000 ? out.slice(-1800) : out;
}

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

/** Deterministic 5-minute walk from start → end (smooth, no edge spikes). */
function buildArchiveTicks(
  startPrice: number,
  endPrice: number,
  seed: number,
  startTimeMs: number,
  endTimeMs: number,
): PriceTick[] {
  const POINTS = 120;
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const duration = Math.max(60_000, endTimeMs - startTimeMs);
  const totalMove = endPrice - startPrice;
  // Mild mid-round wobble only — quiet near START/END to avoid spikes
  const volatility = Math.abs(totalMove) * 0.18 + startPrice * 0.00035;
  const ticks: PriceTick[] = [];
  let noise = 0;
  for (let i = 0; i < POINTS; i++) {
    const u = i / (POINTS - 1);
    const t = startTimeMs + u * duration;
    // Envelope: 0 at ends, 1 in the middle
    const envelope = Math.sin(u * Math.PI);
    noise += (rand() - 0.5) * 2 * volatility * 0.22;
    noise *= 0.92; // mean-revert
    const linear = startPrice + totalMove * u;
    // Ease the trend slightly (smooth S-curve) so the path doesn't dash
    const eased = u * u * (3 - 2 * u);
    const trend = startPrice + totalMove * (0.35 * u + 0.65 * eased);
    // Blend a touch of linear so mid noise doesn't dominate
    const price = trend * 0.85 + linear * 0.15 + noise * envelope * envelope;
    ticks.push({ t, price });
  }
  // Pin ends exactly; keep neighbors close to kill Catmull overshoot
  ticks[0] = { t: startTimeMs, price: startPrice };
  ticks[1] = { t: startTimeMs + duration / (POINTS - 1), price: startPrice + totalMove / (POINTS - 1) };
  ticks[POINTS - 2] = {
    t: endTimeMs - duration / (POINTS - 1),
    price: endPrice - totalMove / (POINTS - 1),
  };
  ticks[POINTS - 1] = { t: endTimeMs, price: endPrice };
  return ticks;
}

function fmtRoundClock(msFromStart: number): string {
  const totalSec = Math.max(0, Math.floor(msFromStart / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Catmull-Rom sample at time t — clamped to the local segment so overshoot can't yank the tip. */
function samplePriceAt(ticks: PriceTick[], t: number): { t: number; price: number } {
  if (!ticks.length) return { t, price: 0 };
  if (ticks.length === 1) return { t, price: ticks[0].price };
  if (t <= ticks[0].t) return { t, price: ticks[0].price };
  const last = ticks[ticks.length - 1];
  if (t >= last.t) return { t, price: last.price };

  let i = 0;
  for (let k = 0; k < ticks.length - 1; k++) {
    if (ticks[k].t <= t && t <= ticks[k + 1].t) {
      i = k;
      break;
    }
  }
  const p0 = ticks[Math.max(0, i - 1)];
  const p1 = ticks[i];
  const p2 = ticks[i + 1];
  const p3 = ticks[Math.min(ticks.length - 1, i + 2)];
  const span = p2.t - p1.t || 1;
  const u = Math.max(0, Math.min(1, (t - p1.t) / span));
  const u2 = u * u;
  const u3 = u2 * u;
  const price =
    0.5 *
    (2 * p1.price +
      (-p0.price + p2.price) * u +
      (2 * p0.price - 5 * p1.price + 4 * p2.price - p3.price) * u2 +
      (-p0.price + 3 * p1.price - 3 * p2.price + p3.price) * u3);
  // Clamp to the segment endpoints — Catmull overshoot is what made the
  // tip briefly reverse or spike when neighbor spacing was uneven.
  const lo = Math.min(p1.price, p2.price);
  const hi = Math.max(p1.price, p2.price);
  return { t, price: Math.max(lo, Math.min(hi, price)) };
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
  /** Settled visual trail (committed waypoints the line has already traversed). */
  trail: PriceTick[];
  /** Animated tip that glides toward the latest tick. */
  tip: { t: number; price: number };
  tipTarget: { t: number; price: number };
  /** Wall-clock live price for HUD / numeric readout (not lagged). */
  livePrice: number;
  lastFrameMs: number;
  lastTrailPushMs: number;
  nowMs: number;
  startPrice: number;
  startTimeMs: number;
  endTimeMs: number;
  symbol: string;
  color: string;
  windowMs: number;
  panMs: number;
  followLive: boolean;
  pMin: number;
  pMax: number;
  openFade: number;
  dragging: boolean;
  dragStartX: number;
  dragStartPan: number;
  /** Archive / history round mode */
  archive: boolean;
  archiveTicks: PriceTick[];
  endPrice: number;
  roundNumber: number;
}

function snapshotEngine(e: Engine): ChartCache {
  return {
    trail: e.trail.map((p) => ({ ...p })),
    tip: { ...e.tip },
    tipTarget: { ...e.tipTarget },
    windowMs: e.windowMs,
    panMs: e.panMs,
    followLive: e.followLive,
    pMin: e.pMin,
    pMax: e.pMax,
  };
}

function applyCache(e: Engine, cached: ChartCache) {
  e.trail = cached.trail.map((p) => ({ ...p }));
  e.tip = { ...cached.tip };
  e.tipTarget = { ...cached.tipTarget };
  e.windowMs = cached.windowMs;
  e.panMs = cached.panMs;
  e.followLive = cached.followLive;
  e.pMin = cached.pMin;
  e.pMax = cached.pMax;
}

export default function SpatialTradingChart({
  market,
  history,
  isHistorical = false,
  onReturnToLive,
}: SpatialTradingChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>({
    width: 0,
    height: 0,
    dpr: 1,
    ticks: [],
    trail: [{ t: Date.now(), price: market.currentPrice }],
    tip: { t: Date.now() - CHART_LAG_MS, price: market.currentPrice },
    tipTarget: { t: Date.now() - CHART_LAG_MS, price: market.currentPrice },
    livePrice: market.currentPrice,
    lastFrameMs: Date.now(),
    lastTrailPushMs: Date.now(),
    nowMs: Date.now(),
    startPrice: market.startPrice,
    startTimeMs: market.startTime * 1000,
    endTimeMs: market.endTime * 1000,
    symbol: market.symbol,
    color: market.color || INK,
    windowMs: DEFAULT_WINDOW_MS,
    panMs: 0,
    followLive: true,
    pMin: market.currentPrice * 0.998,
    pMax: market.currentPrice * 1.002,
    openFade: 0,
    dragging: false,
    dragStartX: 0,
    dragStartPan: 0,
    archive: false,
    archiveTicks: [],
    endPrice: market.currentPrice,
    roundNumber: market.roundNumber,
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
  const assetIdRef = useRef(market.assetId);
  const archiveKeyRef = useRef('');

  useEffect(() => {
    const e = engineRef.current;

    // ── Archive / history round: full 5-min shape with START & END ──
    if (isHistorical) {
      const startMs = market.startTime * 1000;
      const endMs = market.endTime > market.startTime
        ? market.endTime * 1000
        : startMs + 300_000;
      const archiveKey = `${market.roundId}:${market.startPrice}:${market.currentPrice}:${startMs}`;
      if (archiveKeyRef.current !== archiveKey) {
        archiveKeyRef.current = archiveKey;
        e.archive = true;
        e.archiveTicks = buildArchiveTicks(
          market.startPrice,
          market.currentPrice,
          market.roundId || 42,
          startMs,
          endMs,
        );
        e.ticks = e.archiveTicks;
        e.trail = e.archiveTicks.map((p) => ({ ...p }));
        e.tip = { ...e.archiveTicks[e.archiveTicks.length - 1] };
        e.tipTarget = { ...e.tip };
        e.livePrice = market.currentPrice;
        e.endPrice = market.currentPrice;
        e.startPrice = market.startPrice;
        e.startTimeMs = startMs;
        e.endTimeMs = endMs;
        e.windowMs = (endMs - startMs) * 1.12;
        e.panMs = 0;
        e.followLive = false;
        e.openFade = 1;
        e.symbol = market.symbol;
        e.color = market.color || INK;
        e.roundNumber = market.roundNumber;
        let lo = Infinity;
        let hi = -Infinity;
        for (const p of e.archiveTicks) {
          lo = Math.min(lo, p.price);
          hi = Math.max(hi, p.price);
        }
        const span = Math.max(hi - lo, market.startPrice * 0.001);
        e.pMin = lo - span * 0.14;
        e.pMax = hi + span * 0.14;
      }
      return;
    }

    // Leaving archive — resume live trail
    if (e.archive) {
      e.archive = false;
      archiveKeyRef.current = '';
      e.followLive = true;
      e.panMs = 0;
      e.windowMs = DEFAULT_WINDOW_MS;
      e.trail = [];
      e.ticks = [];
      e.tip = { t: Date.now() - CHART_LAG_MS, price: market.currentPrice };
      e.tipTarget = { ...e.tip };
      e.pMin = market.currentPrice * (1 - MIN_SPAN_FRAC * 4);
      e.pMax = market.currentPrice * (1 + MIN_SPAN_FRAC * 4);
    }

    // Append-only tick merge — never rewrite past samples under the playhead.
    e.ticks = mergeTicksForward(e.ticks, history, market.currentPrice);

    const tipSrc = e.ticks[e.ticks.length - 1];
    if (tipSrc) {
      e.livePrice = tipSrc.price;
    }

    e.startPrice = market.startPrice;
    e.startTimeMs = market.startTime * 1000;
    e.endTimeMs = market.endTime * 1000;
    e.endPrice = market.currentPrice;
    e.symbol = market.symbol;
    e.color = market.color || INK;
    e.roundNumber = market.roundNumber;

    // Market switch — persist previous trail, restore this asset's shape
    if (assetIdRef.current !== market.assetId) {
      chartCacheByAsset.set(assetIdRef.current, snapshotEngine(e));
      assetIdRef.current = market.assetId;
      roundKeyRef.current = `${market.roundId}:${market.startPrice}`;

      const cached = chartCacheByAsset.get(market.assetId);
      if (cached && cached.trail.length >= 2) {
        applyCache(e, cached);
        e.trail = trimTrail(e.trail, Date.now());
        // Fresh tick buffer for the new asset (don't carry previous asset's ticks)
        e.ticks = mergeTicksForward([], history, market.currentPrice);
      } else {
        e.ticks = mergeTicksForward([], history, market.currentPrice);
        const seed = e.ticks.filter((p) => p.t >= Date.now() - TRAIL_KEEP_MS);
        e.trail = (seed.length >= 2 ? seed : e.ticks.slice(-120)).map((p) => ({ ...p }));
        const end = e.trail[e.trail.length - 1] || { t: Date.now() - CHART_LAG_MS, price: market.currentPrice };
        e.tip = { t: end.t, price: end.price };
        e.tipTarget = { ...e.tip };
        e.windowMs = DEFAULT_WINDOW_MS;
        e.panMs = 0;
        e.followLive = true;
        e.pMin = market.currentPrice * (1 - MIN_SPAN_FRAC * 4);
        e.pMax = market.currentPrice * (1 + MIN_SPAN_FRAC * 4);
      }
      e.openFade = 0;
      return;
    }

    const roundKey = `${market.roundId}:${market.startPrice}`;
    if (roundKeyRef.current !== roundKey) {
      roundKeyRef.current = roundKey;
      e.openFade = 0;
      // New round: keep forward motion but re-anchor trail from open
      const openT = market.startTime * 1000;
      e.trail = [{ t: openT, price: market.startPrice }];
      e.tip = { t: Math.max(openT, Date.now() - CHART_LAG_MS), price: market.currentPrice };
      e.tipTarget = { ...e.tip };
      e.ticks = mergeTicksForward([], history, market.currentPrice);
    }

    if (e.trail.length < 2 && e.ticks.length >= 2) {
      const seed = e.ticks.filter((p) => p.t >= Date.now() - TRAIL_KEEP_MS);
      e.trail = (seed.length >= 2 ? seed : e.ticks.slice(-120)).map((p) => ({ ...p }));
      const end = e.trail[e.trail.length - 1];
      e.tip = { t: end.t, price: end.price };
      e.tipTarget = { ...e.tip };
    }
  }, [history, market.assetId, market.currentPrice, market.startPrice, market.startTime, market.endTime, market.symbol, market.color, market.roundId, market.roundNumber, isHistorical]);

  // Persist trail when leaving the page / unmounting
  useEffect(() => {
    return () => {
      chartCacheByAsset.set(assetIdRef.current, snapshotEngine(engineRef.current));
    };
  }, []);

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
      const rect = wrap.getBoundingClientRect();
      const xFrac = (ev.clientX - rect.left) / (rect.width || 1);

      if (e.archive) {
        const duration = Math.max(60_000, e.endTimeMs - e.startTimeMs);
        const mid = (e.startTimeMs + e.endTimeMs) / 2;
        const viewW = Math.max(duration * 1.06, e.windowMs);
        const center = mid + e.panMs;
        const tMin = center - viewW / 2;
        const tAtCursor = tMin + xFrac * viewW;
        const next = Math.min(MAX_WINDOW_MS, Math.max(duration * 1.06, viewW * factor));
        e.windowMs = next;
        const newTMin = tAtCursor - xFrac * next;
        const newCenter = newTMin + next / 2;
        e.panMs = newCenter - mid;
        return;
      }

      const next = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, e.windowMs * factor));
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
    if (e.archive) {
      const duration = Math.max(60_000, e.endTimeMs - e.startTimeMs);
      // Archive: zoom out freely, but not tighter than the full round
      e.windowMs = Math.min(MAX_WINDOW_MS, Math.max(duration * 1.06, ms));
      return;
    }
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
    let tMin: number;
    let tMax: number;

    if (e.archive) {
      // Zoomable around the round — never tighter than ~full 5m so START+END stay reachable when zoomed out
      const duration = Math.max(60_000, e.endTimeMs - e.startTimeMs);
      const mid = (e.startTimeMs + e.endTimeMs) / 2;
      const minView = duration * 1.06;
      const viewW = Math.max(minView, e.windowMs);
      const center = mid + e.panMs;
      tMin = center - viewW / 2;
      tMax = center + viewW / 2;
      // Keep the round mostly in frame when panning
      const slack = viewW * 0.15;
      if (tMin > e.startTimeMs - slack) {
        const d = tMin - (e.startTimeMs - slack);
        tMin -= d;
        tMax -= d;
      }
      if (tMax < e.endTimeMs + slack) {
        const d = (e.endTimeMs + slack) - tMax;
        tMin += d;
        tMax += d;
      }
    } else {
      const chartNow = now - CHART_LAG_MS;
      const center = e.followLive ? chartNow : now + e.panMs;
      tMin = center - e.windowMs * (e.followLive ? 0.62 : 0.5);
      tMax = tMin + e.windowMs;
    }

    const series = e.archive ? e.archiveTicks : e.trail;
    const visible = series.filter((p) => p.t >= tMin - 2_000 && p.t <= tMax + 2_000);
    let rawMin = Infinity;
    let rawMax = -Infinity;
    for (const p of visible) {
      rawMin = Math.min(rawMin, p.price);
      rawMax = Math.max(rawMax, p.price);
    }
    if (!e.archive) {
      rawMin = Math.min(rawMin, e.tip.price);
      rawMax = Math.max(rawMax, e.tip.price);
    } else {
      rawMin = Math.min(rawMin, e.startPrice, e.endPrice);
      rawMax = Math.max(rawMax, e.startPrice, e.endPrice);
    }
    if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMin === rawMax) {
      const mid = e.tip.price || e.startPrice || 1;
      rawMin = mid * (1 - MIN_SPAN_FRAC);
      rawMax = mid * (1 + MIN_SPAN_FRAC);
    }

    const mid = (rawMin + rawMax) / 2;
    const natural = Math.max(rawMax - rawMin, Math.abs(mid) * MIN_SPAN_FRAC);
    // Quiet → keep span tight so small moves fill the band (zoom in).
    // Busy → expand with the natural range (zoom out). Extra pad when
    // action exceeds the comfort band so spikes don't hug the edges.
    const comfort = Math.abs(mid) * COMFORT_SPAN_FRAC;
    const busyPad = natural > comfort ? Y_PAD_FRAC * 1.35 : Y_PAD_FRAC;
    const span = natural;
    const targetMin = mid - span / 2 - span * busyPad;
    const targetMax = mid + span / 2 + span * busyPad;

    if (e.archive) {
      e.pMin = targetMin;
      e.pMax = targetMax;
    } else {
      // Auto-zoom: react quickly when the visible range is shrinking
      // (quiet market → tighten in so small moves read as material),
      // ease more gently when it's growing (a spike → widen out smoothly).
      const zoomingIn = (targetMax - targetMin) < (e.pMax - e.pMin);
      const smooth = zoomingIn ? RANGE_SMOOTH_IN : RANGE_SMOOTH_OUT;
      e.pMin += (targetMin - e.pMin) * smooth;
      e.pMax += (targetMax - e.pMax) * smooth;
      if (!Number.isFinite(e.pMin) || !Number.isFinite(e.pMax) || e.pMin >= e.pMax) {
        e.pMin = targetMin;
        e.pMax = targetMax;
      }
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
      e.lastFrameMs = e.nowMs;

      const lineColor = e.color || INK;
      const archive = e.archive;

      if (!archive) {
        const latest = e.ticks[e.ticks.length - 1];
        if (latest) e.livePrice = latest.price;

        // Lagged playhead: sample along buffered ticks. Tip TIME only moves
        // forward with the wall clock — never allowed to decrease — so the
        // path cannot reverse on X even if upstream ticks jitter.
        const chartNow = e.nowMs - CHART_LAG_MS;
        const sampleAt = Math.max(chartNow, e.tip.t);
        const sampled = samplePriceAt(e.ticks, sampleAt);
        e.tipTarget = sampled;

        const prevPrice = e.tip.price;
        const easedPrice = Number.isFinite(prevPrice)
          ? prevPrice + (sampled.price - prevPrice) * TIP_EASE
          : sampled.price;
        // Strictly non-decreasing tip time (X always advances or holds).
        const nextT = Math.max(e.tip.t, chartNow, sampled.t);
        e.tip = { t: nextT, price: easedPrice };

        const lastTrail = e.trail[e.trail.length - 1];
        const priceBase = Math.abs(e.tip.price) || 1;
        const movedEnough =
          !lastTrail ||
          Math.abs(e.tip.price - lastTrail.price) / priceBase > TRAIL_MIN_DIST_FRAC ||
          e.tip.t - lastTrail.t > 80;
        // Only commit trail points that move forward in time — this is what
        // ultimately prevents the drawn line from ever redrawing backward.
        const movesForward = !lastTrail || e.tip.t > lastTrail.t;
        if (movedEnough && movesForward && e.nowMs - e.lastTrailPushMs >= TRAIL_MIN_MS) {
          e.trail.push({ t: e.tip.t, price: e.tip.price });
          e.lastTrailPushMs = e.nowMs;
          e.trail = trimTrail(e.trail, e.nowMs);
        }
      } else {
        e.livePrice = e.endPrice;
        e.tip = e.archiveTicks[e.archiveTicks.length - 1]
          ? { ...e.archiveTicks[e.archiveTicks.length - 1] }
          : e.tip;
      }

      if (e.openFade < 1) e.openFade = Math.min(1, e.openFade + 16 / OPEN_FADE_MS);

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

      // Round open / START — dashed
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
      ctx.fillText(
        archive ? `START  ${fmtUsd(e.startPrice)}` : `ROUND OPEN  ${fmtUsd(e.startPrice)}`,
        78,
        openY - 4,
      );
      ctx.restore();

      if (archive) {
        const endY = priceToY(e.endPrice);
        ctx.save();
        ctx.strokeStyle = e.endPrice >= e.startPrice ? GREEN : RED;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(0, endY);
        ctx.lineTo(W, endY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '700 10px "Courier New", monospace';
        ctx.fillStyle = e.endPrice >= e.startPrice ? GREEN : RED;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`END  ${fmtUsd(e.endPrice)}`, W - 78, endY - 4);
        ctx.restore();
      }

      const pathSrc = archive ? e.archiveTicks : e.trail;
      const trailPts = pathSrc.filter((p) => p.t >= tMin - 1_000 && p.t <= tMax + 1_000);
      const drawPts: { x: number; y: number }[] = [];
      for (const p of trailPts) {
        // Trail must already be time-sorted; skip any regressive point defensively.
        const prev = drawPts[drawPts.length - 1];
        const x = timeToX(p.t);
        if (prev && x < prev.x) continue;
        drawPts.push({ x, y: priceToY(p.price) });
      }
      if (!archive) {
        const tipX = timeToX(e.tip.t);
        const tipY = priceToY(e.tip.price);
        const prev = drawPts[drawPts.length - 1];
        // Never let the tip draw left of the last committed point.
        if (!prev || tipX >= prev.x) {
          drawPts.push({ x: tipX, y: tipY });
        } else {
          drawPts.push({ x: prev.x, y: tipY });
        }
      }

      if (drawPts.length >= 2) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.75;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        strokeSmoothPath(ctx, drawPts, archive ? 0.22 : LIVE_PATH_TENSION);
        ctx.stroke();
        ctx.strokeStyle = lineColor;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 8;
        strokeSmoothPath(ctx, drawPts, archive ? 0.22 : LIVE_PATH_TENSION);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (archive && e.archiveTicks.length >= 2) {
        const startPt = e.archiveTicks[0];
        const endPt = e.archiveTicks[e.archiveTicks.length - 1];
        const sx = timeToX(startPt.t);
        const sy = priceToY(startPt.price);
        const ex = timeToX(endPt.t);
        const ey = priceToY(endPt.price);

        ctx.strokeStyle = 'rgba(13,11,8,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, bandTop);
        ctx.lineTo(sx + 0.5, bandBot);
        ctx.moveTo(ex + 0.5, bandTop);
        ctx.lineTo(ex + 0.5, bandBot);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = PAPER;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = lineColor;
        ctx.font = '900 11px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('START', sx + 12, sy - 8);

        const endColor = e.endPrice >= e.startPrice ? GREEN : RED;
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = endColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ex, ey, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = endColor;
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '900 11px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('END', ex - 12, ey - 8);
      } else if (drawPts.length >= 1) {
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
        const liveY = priceToY(e.livePrice);
        ctx.fillStyle = lineColor;
        ctx.font = '900 15px "Courier New", monospace';
        ctx.fillText(fmtUsd(e.livePrice), W - 12, liveY);
        ctx.font = '700 11px "Courier New", monospace';
        ctx.fillStyle = e.livePrice >= e.startPrice ? GREEN : RED;
        const pct = e.startPrice > 0 ? ((e.livePrice - e.startPrice) / e.startPrice) * 100 : 0;
        ctx.fillText(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(3)}%`, W - 12, liveY + 16);
      }

      ctx.fillStyle = 'rgba(13,11,8,0.5)';
      ctx.font = '700 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (archive) {
        for (let m = 0; m <= 5; m++) {
          const t = e.startTimeMs + m * 60_000;
          if (t > e.endTimeMs + 500) break;
          ctx.fillText(fmtRoundClock(t - e.startTimeMs), timeToX(t), H - 18);
        }
        ctx.fillStyle = INK;
        ctx.font = '900 10px "Courier New", monospace';
        ctx.fillText('5 MIN ROUND', W / 2, 10);
      } else {
        const marks = 5;
        for (let i = 0; i <= marks; i++) {
          const t = tMin + ((tMax - tMin) * i) / marks;
          ctx.fillText(fmtClock(t), timeToX(t), H - 18);
        }
      }

      if (archive) {
        ctx.fillStyle = 'rgba(138,28,20,0.06)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = RED;
        ctx.font = '900 13px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`ARCHIVE  ·  ROUND #${e.roundNumber}`, W / 2, 28);
      }

      if (e.nowMs - lastHud > 160) {
        lastHud = e.nowMs;
        const zoom = DEFAULT_WINDOW_MS / e.windowMs;
        setHud({
          price: archive ? e.endPrice : e.livePrice,
          now: e.nowMs,
          zoom: archive ? '5m' : `${zoom >= 1 ? zoom.toFixed(1) : zoom.toFixed(2)}×`,
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
    e.dragStartPan = e.archive || !e.followLive ? e.panMs : 0;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    if (!e.dragging || e.width < 2) return;
    const dx = ev.clientX - e.dragStartX;
    if (Math.abs(dx) < 3) return;
    if (e.archive) {
      const duration = Math.max(60_000, e.endTimeMs - e.startTimeMs);
      const viewW = Math.max(duration * 1.06, e.windowMs);
      e.panMs = e.dragStartPan - (dx / e.width) * viewW;
      return;
    }
    e.followLive = false;
    e.panMs = e.dragStartPan - (dx / e.width) * e.windowMs;
  };

  const onPointerUp = () => {
    engineRef.current.dragging = false;
  };

  const lineColor = market.color || INK;
  const live = hud.followLive;

  // Slider: right = zoom in, left = zoom out (archive floor = full round)
  const zoomSliderVal = (() => {
    const eMin = isHistorical
      ? Math.max(60_000, (market.endTime - market.startTime) * 1000 || 300_000) * 1.06
      : MIN_WINDOW_MS;
    const logMin = Math.log(eMin);
    const logMax = Math.log(MAX_WINDOW_MS);
    const logCur = Math.log(Math.max(eMin, hud.windowMs));
    return 100 - ((logCur - logMin) / (logMax - logMin || 1)) * 100;
  })();

  const onZoomSlider = (val: number) => {
    const eMin = isHistorical
      ? Math.max(60_000, (market.endTime - market.startTime) * 1000 || 300_000) * 1.06
      : MIN_WINDOW_MS;
    const logMin = Math.log(eMin);
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
        touchAction: 'manipulation',
        cursor: 'grab',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* LIVE indicator — hidden in archive */}
      {!isHistorical && (
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
      )}

      {/* Archive: return to live market */}
      {isHistorical && onReturnToLive && (
        <button
          type="button"
          onClick={onReturnToLive}
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
            padding: '8px 16px',
            border: `1px solid ${INK}`,
            background: PAPER,
            cursor: 'pointer',
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.1em',
            color: INK,
          }}
        >
          ← LIVE MARKET
        </button>
      )}

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
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          border: `1px solid ${INK}`,
          background: PAPER,
          padding: '14px 22px',
          fontFamily: '"Courier New", monospace',
          zIndex: 5,
          pointerEvents: 'none',
          display: 'flex',
          gap: 18,
          alignItems: 'baseline',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: lineColor,
            flexShrink: 0,
            alignSelf: 'center',
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>{market.symbol}</span>
        {isHistorical ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5A554E' }}>
              START {fmtUsd(market.startPrice)}
            </span>
            <span style={{ fontSize: 12, color: '#5A554E' }}>→</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: market.currentPrice >= market.startPrice ? GREEN : RED,
              }}
            >
              END {fmtUsd(market.currentPrice)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5A554E' }}>#{market.roundNumber}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 26, fontWeight: 900, color: lineColor, letterSpacing: '-0.02em' }}>
              {fmtUsd(hud.price)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#5A554E' }}>{fmtClock(hud.now)}</span>
          </>
        )}
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