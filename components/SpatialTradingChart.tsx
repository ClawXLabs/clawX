/**
 * SpatialTradingChart
 * ───────────────────
 * Canvas spatial chart: price stream lives in mutable refs + rAF (60fps),
 * not React state — so sub-second ticks never thrash the render tree.
 *
 * Viewport:
 *   - Current time locked ~35% from the left (History | Future)
 *   - Vertical draw band inset 30% top/bottom so the ridge is zoomed
 *   - Axis labels sit on left/right gutters outside the ridge band
 *
 * Modes:
 *   classic — horizontal dashed line from entry to expiry
 *   box     — hover/click grid cells in the future zone
 *   draw    — click-drag custom bounding box
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { MarketInfo, PriceTick } from '../contexts/MarketDataContext';

export type SpatialMode = 'classic' | 'box' | 'draw';

export interface ClassicBet {
  id: string;
  kind: 'classic';
  side: 'up' | 'down';
  entryPrice: number;
  entryTime: number;
  expiryTime: number;
  status: 'open' | 'won' | 'lost';
}

export interface RectBet {
  id: string;
  kind: 'box' | 'draw';
  t0: number;
  t1: number;
  p0: number;
  p1: number;
  status: 'open' | 'hit' | 'miss';
}

export type SpatialBet = ClassicBet | RectBet;

interface SpatialTradingChartProps {
  market: MarketInfo;
  history: PriceTick[];
  mode?: SpatialMode;
  onModeChange?: (mode: SpatialMode) => void;
  /** Fired when Classic Up/Down is placed from the chart (optional bridge). */
  onClassicEntry?: (side: 'up' | 'down', price: number, at: number) => void;
  classicExpirySec?: number;
  isHistorical?: boolean;
}

const INK = '#0D0B08';
const PAPER = '#FAF8F3';
const GREEN = '#1E5E3A';
const RED = '#8A1C14';
const NOW_FRAC = 0.35; // current time at 35% from left
const V_MARGIN = 0.30; // 30% top + 30% bottom → ridge in middle 40%
const HISTORY_WINDOW_MS = 90_000;
const FUTURE_WINDOW_MS = 180_000;
const BOX_COLS = 6;
const BOX_ROWS = 5;
const Y_PAD_FRAC = 0.08; // tight pad so ticks read as a big ridge

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

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function segmentsIntersectRect(
  x1: number, y1: number, x2: number, y2: number,
  rx0: number, ry0: number, rx1: number, ry1: number,
): boolean {
  const left = Math.min(rx0, rx1);
  const right = Math.max(rx0, rx1);
  const top = Math.min(ry0, ry1);
  const bottom = Math.max(ry0, ry1);
  // Either endpoint inside
  if (
    (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
    (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)
  ) return true;
  // Sample along segment
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }
  return false;
}

interface Engine {
  width: number;
  height: number;
  dpr: number;
  ticks: PriceTick[];
  bets: SpatialBet[];
  mode: SpatialMode;
  hoverCell: { col: number; row: number } | null;
  draft: { x0: number; y0: number; x1: number; y1: number } | null;
  dragging: boolean;
  nowMs: number;
  startPrice: number;
  symbol: string;
}

export default function SpatialTradingChart({
  market,
  history,
  mode: modeProp = 'classic',
  onModeChange,
  onClassicEntry,
  classicExpirySec = 30,
  isHistorical = false,
}: SpatialTradingChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>({
    width: 0,
    height: 0,
    dpr: 1,
    ticks: [],
    bets: [],
    mode: modeProp,
    hoverCell: null,
    draft: null,
    dragging: false,
    nowMs: Date.now(),
    startPrice: market.startPrice,
    symbol: market.symbol,
  });
  const [mode, setMode] = useState<SpatialMode>(modeProp);
  const [hud, setHud] = useState({ price: market.currentPrice, now: Date.now() });

  // Sync incoming history / price into mutable engine (no React re-render per tick)
  useEffect(() => {
    const e = engineRef.current;
    e.ticks = history.length
      ? [...history]
      : [{ t: Date.now(), price: market.currentPrice }];
    // Ensure latest market price is represented
    const last = e.ticks[e.ticks.length - 1];
    if (!last || Math.abs(last.price - market.currentPrice) > 1e-12 || Date.now() - last.t > 800) {
      e.ticks.push({ t: Date.now(), price: market.currentPrice });
      if (e.ticks.length > 800) e.ticks = e.ticks.slice(-600);
    }
    e.startPrice = market.startPrice;
    e.symbol = market.symbol;
  }, [history, market.currentPrice, market.startPrice, market.symbol]);

  useEffect(() => {
    setMode(modeProp);
  }, [modeProp]);

  useEffect(() => {
    engineRef.current.mode = mode;
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // Size canvas to container
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

  // Coordinate helpers (shared by draw + hit-testing)
  const scales = useCallback(() => {
    const e = engineRef.current;
    const W = e.width;
    const H = e.height;
    const nowX = W * NOW_FRAC;
    const bandTop = H * V_MARGIN;
    const bandBot = H * (1 - V_MARGIN);
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
    // Include start price + open bets so lines stay on-screen
    pMin = Math.min(pMin, e.startPrice);
    pMax = Math.max(pMax, e.startPrice);
    for (const b of e.bets) {
      if (b.kind === 'classic') {
        pMin = Math.min(pMin, b.entryPrice);
        pMax = Math.max(pMax, b.entryPrice);
      } else {
        pMin = Math.min(pMin, b.p0, b.p1);
        pMax = Math.max(pMax, b.p0, b.p1);
      }
    }
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
    const xToTime = (x: number) => {
      if (x <= nowX) {
        const u = x / (nowX || 1);
        return tMin + u * (now - tMin);
      }
      const u = (x - nowX) / (W - nowX || 1);
      return now + u * (tMax - now);
    };
    const yToPrice = (y: number) => {
      const u = (bandBot - y) / bandH;
      return pMin + u * (pMax - pMin);
    };

    return { W, H, nowX, bandTop, bandBot, bandH, tMin, tMax, now, pMin, pMax, timeToX, priceToY, xToTime, yToPrice };
  }, []);

  // Settlement / collision on each frame against latest tip
  const settleBets = useCallback((prev: PriceTick | null, curr: PriceTick) => {
    const e = engineRef.current;
    for (const b of e.bets) {
      if (b.kind === 'classic' && b.status === 'open' && curr.t >= b.expiryTime) {
        const won = b.side === 'up' ? curr.price >= b.entryPrice : curr.price < b.entryPrice;
        b.status = won ? 'won' : 'lost';
      }
      if ((b.kind === 'box' || b.kind === 'draw') && b.status === 'open') {
        if (curr.t < b.t0) continue;
        if (curr.t > b.t1) {
          b.status = 'miss';
          continue;
        }
        if (prev) {
          const hit = segmentsIntersectRect(
            prev.t, prev.price, curr.t, curr.price,
            b.t0, b.p0, b.t1, b.p1,
          );
          if (hit) b.status = 'hit';
        }
      }
    }
  }, []);

  // rAF draw loop
  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    let prevTip: PriceTick | null = null;

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
      if (prevTip) settleBets(prevTip, tip);
      prevTip = tip;

      const s = scales();
      const { W, H, nowX, bandTop, bandBot, timeToX, priceToY, pMin, pMax, tMin, tMax } = s;

      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Paper background
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);

      // Future zone wash
      ctx.fillStyle = 'rgba(13,11,8,0.03)';
      ctx.fillRect(nowX, 0, W - nowX, H);

      // Vertical margins (dimmed outside ridge)
      ctx.fillStyle = 'rgba(13,11,8,0.045)';
      ctx.fillRect(0, 0, W, bandTop);
      ctx.fillRect(0, bandBot, W, H - bandBot);

      // Ridge band outline
      ctx.strokeStyle = 'rgba(13,11,8,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bandTop);
      ctx.lineTo(W, bandTop);
      ctx.moveTo(0, bandBot);
      ctx.lineTo(W, bandBot);
      ctx.stroke();

      // Now vertical line
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(nowX + 0.5, 0);
      ctx.lineTo(nowX + 0.5, H);
      ctx.stroke();

      // Start / open price reference across ridge
      const openY = priceToY(e.startPrice);
      ctx.strokeStyle = 'rgba(13,11,8,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, openY);
      ctx.lineTo(W, openY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Box grid in future zone (mode box)
      if (e.mode === 'box') {
        const cellW = (W - nowX) / BOX_COLS;
        const cellH = (bandBot - bandTop) / BOX_ROWS;
        ctx.strokeStyle = 'rgba(13,11,8,0.12)';
        ctx.lineWidth = 1;
        for (let c = 0; c <= BOX_COLS; c++) {
          const x = nowX + c * cellW;
          ctx.beginPath();
          ctx.moveTo(x, bandTop);
          ctx.lineTo(x, bandBot);
          ctx.stroke();
        }
        for (let r = 0; r <= BOX_ROWS; r++) {
          const y = bandTop + r * cellH;
          ctx.beginPath();
          ctx.moveTo(nowX, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        if (e.hoverCell) {
          const { col, row } = e.hoverCell;
          ctx.fillStyle = 'rgba(30,94,58,0.14)';
          ctx.fillRect(nowX + col * cellW, bandTop + row * cellH, cellW, cellH);
          ctx.strokeStyle = GREEN;
          ctx.strokeRect(nowX + col * cellW + 0.5, bandTop + row * cellH + 0.5, cellW - 1, cellH - 1);
        }
      }

      // Active bets
      for (const b of e.bets) {
        if (b.kind === 'classic') {
          const x0 = timeToX(b.entryTime);
          const x1 = timeToX(b.expiryTime);
          const y = priceToY(b.entryPrice);
          const color = b.status === 'won' ? GREEN : b.status === 'lost' ? RED : (b.side === 'up' ? GREEN : RED);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.25;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(Math.max(x0, x1), y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x0, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const x0 = timeToX(b.t0);
          const x1 = timeToX(b.t1);
          const y0 = priceToY(b.p0);
          const y1 = priceToY(b.p1);
          const left = Math.min(x0, x1);
          const top = Math.min(y0, y1);
          const w = Math.abs(x1 - x0);
          const h = Math.abs(y1 - y0);
          const color = b.status === 'hit' ? GREEN : b.status === 'miss' ? RED : INK;
          ctx.fillStyle = b.status === 'hit'
            ? 'rgba(30,94,58,0.16)'
            : b.status === 'miss'
              ? 'rgba(138,28,20,0.12)'
              : 'rgba(13,11,8,0.06)';
          ctx.fillRect(left, top, w, h);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(b.kind === 'draw' ? [] : [3, 3]);
          ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
          ctx.setLineDash([]);
        }
      }

      // Draft draw rectangle
      if (e.draft) {
        const { x0, y0, x1, y1 } = e.draft;
        const left = Math.min(x0, x1);
        const top = Math.min(y0, y1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        ctx.fillStyle = 'rgba(13,11,8,0.08)';
        ctx.fillRect(left, top, w, h);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
        ctx.setLineDash([]);
      }

      // Price line (history only, up to now)
      const pts = e.ticks.filter((p) => p.t >= tMin && p.t <= e.nowMs + 50);
      if (pts.length >= 2) {
        ctx.strokeStyle = INK;
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

      // Leading price node (big ridge tip)
      const nodeX = timeToX(Math.min(tip.t, e.nowMs));
      const nodeY = priceToY(tip.price);
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Left gutter — price labels
      ctx.fillStyle = INK;
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

      // Right gutter — mirrored live price
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.font = '900 13px "Courier New", monospace';
      ctx.fillText(fmtUsd(tip.price), W - 12, nodeY);
      ctx.font = '700 10px "Courier New", monospace';
      ctx.fillStyle = tip.price >= e.startPrice ? GREEN : RED;
      const pct = e.startPrice > 0 ? ((tip.price - e.startPrice) / e.startPrice) * 100 : 0;
      ctx.fillText(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(3)}%`, W - 12, nodeY + 16);

      // Bottom / top time ticks
      ctx.fillStyle = 'rgba(13,11,8,0.55)';
      ctx.font = '700 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const timeMarks = [tMin, e.nowMs, tMax];
      for (const t of timeMarks) {
        const x = timeToX(t);
        ctx.fillText(fmtClock(t), x, H - 18);
      }
      ctx.fillStyle = INK;
      ctx.font = '900 10px "Courier New", monospace';
      ctx.fillText('NOW', nowX, 10);
      ctx.fillStyle = 'rgba(13,11,8,0.45)';
      ctx.fillText('HISTORY', nowX * 0.45, 10);
      ctx.fillText('FUTURE', nowX + (W - nowX) * 0.55, 10);

      // Archive watermark
      if (isHistorical) {
        ctx.fillStyle = 'rgba(138,28,20,0.08)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = RED;
        ctx.font = '900 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCHIVE VIEW', W / 2, 28);
      }

      // Throttle React HUD updates
      if (e.nowMs - lastHud > 200) {
        lastHud = e.nowMs;
        setHud({ price: tip.price, now: e.nowMs });
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isHistorical, scales, settleBets]);

  const localPoint = (ev: React.MouseEvent | React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  const placeClassic = (side: 'up' | 'down') => {
    const e = engineRef.current;
    const tip = e.ticks[e.ticks.length - 1];
    if (!tip) return;
    const bet: ClassicBet = {
      id: uid(),
      kind: 'classic',
      side,
      entryPrice: tip.price,
      entryTime: e.nowMs,
      expiryTime: e.nowMs + classicExpirySec * 1000,
      status: 'open',
    };
    e.bets = [...e.bets.filter((b) => b.status === 'open' || b.kind !== 'classic'), bet].slice(-24);
    onClassicEntry?.(side, tip.price, e.nowMs);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    const { x, y } = localPoint(ev);
    const s = scales();

    if (e.mode === 'box' && x >= s.nowX && y >= s.bandTop && y <= s.bandBot) {
      const cellW = (s.W - s.nowX) / BOX_COLS;
      const cellH = (s.bandBot - s.bandTop) / BOX_ROWS;
      e.hoverCell = {
        col: Math.min(BOX_COLS - 1, Math.max(0, Math.floor((x - s.nowX) / cellW))),
        row: Math.min(BOX_ROWS - 1, Math.max(0, Math.floor((y - s.bandTop) / cellH))),
      };
    } else {
      e.hoverCell = null;
    }

    if (e.dragging && e.draft) {
      e.draft = { ...e.draft, x1: x, y1: y };
    }
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    const { x, y } = localPoint(ev);
    const s = scales();

    if (e.mode === 'classic') {
      // Click above/below open price in future zone → quick classic
      if (x >= s.nowX) {
        const side = y < s.priceToY(e.startPrice) ? 'up' : 'down';
        placeClassic(side);
      }
      return;
    }

    if (e.mode === 'box' && e.hoverCell && x >= s.nowX) {
      const cellW = (s.W - s.nowX) / BOX_COLS;
      const cellH = (s.bandBot - s.bandTop) / BOX_ROWS;
      const { col, row } = e.hoverCell;
      const x0 = s.nowX + col * cellW;
      const x1 = x0 + cellW;
      const y0 = s.bandTop + row * cellH;
      const y1 = y0 + cellH;
      const bet: RectBet = {
        id: uid(),
        kind: 'box',
        t0: s.xToTime(x0),
        t1: s.xToTime(x1),
        p0: s.yToPrice(y1),
        p1: s.yToPrice(y0),
        status: 'open',
      };
      e.bets = [...e.bets, bet].slice(-24);
      return;
    }

    if (e.mode === 'draw' && x >= s.nowX) {
      e.dragging = true;
      e.draft = { x0: x, y0: y, x1: x, y1: y };
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const e = engineRef.current;
    if (!e.dragging || !e.draft) return;
    const s = scales();
    const { x0, y0, x1, y1 } = e.draft;
    e.dragging = false;
    e.draft = null;
    if (Math.abs(x1 - x0) < 8 || Math.abs(y1 - y0) < 8) return;
    const bet: RectBet = {
      id: uid(),
      kind: 'draw',
      t0: s.xToTime(Math.min(x0, x1)),
      t1: s.xToTime(Math.max(x0, x1)),
      p0: s.yToPrice(Math.max(y0, y1)),
      p1: s.yToPrice(Math.min(y0, y1)),
      status: 'open',
    };
    e.bets = [...e.bets, bet].slice(-24);
  };

  const modes: { id: SpatialMode; label: string }[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'box', label: 'Box' },
    { id: 'draw', label: 'Draw' },
  ];

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
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Invisible interaction overlay — below HUD/mode chrome */}
      <div
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          engineRef.current.hoverCell = null;
          engineRef.current.dragging = false;
          engineRef.current.draft = null;
        }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: mode === 'draw' ? 'crosshair' : 'default' }}
      />

      {/* Mode switcher + classic quick entries — top center */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', border: `1px solid ${INK}`, background: PAPER }}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRight: m.id !== 'draw' ? `1px solid ${INK}` : 'none',
                background: mode === m.id ? INK : 'transparent',
                color: mode === m.id ? PAPER : INK,
                fontFamily: '"Courier New", monospace',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'classic' && !isHistorical && (
          <div style={{ display: 'flex', border: `1px solid ${INK}`, background: PAPER }}>
            <button
              type="button"
              onClick={() => placeClassic('up')}
              style={{
                padding: '8px 18px',
                border: 'none',
                borderRight: `1px solid ${INK}`,
                background: 'transparent',
                color: GREEN,
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              UP
            </button>
            <button
              type="button"
              onClick={() => placeClassic('down')}
              style={{
                padding: '8px 18px',
                border: 'none',
                background: 'transparent',
                color: RED,
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              DOWN
            </button>
          </div>
        )}
      </div>

      {/* Compact live readout (React-throttled) */}
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
        }}
      >
        <span>{market.symbol}</span>
        <span style={{ fontWeight: 900 }}>{fmtUsd(hud.price)}</span>
        <span style={{ color: '#5A554E' }}>{fmtClock(hud.now)}</span>
      </div>
    </div>
  );
}
