/**
 * MarketDataContext
 * ─────────────────
 * Global singleton that prefetches and caches all active market data.
 *
 * Architecture:
 * - A MODULE-LEVEL singleton (not React state) drives polling. This is immune
 *   to React StrictMode's double-invoke-and-cleanup pattern which breaks
 *   interval management inside useEffect.
 * - Components subscribe to the singleton via a React context + useState.
 * - Receives backend-aggregated CEX prices over a single WebSocket
 * - Polls chain data every 12s (heavier: Fuji RPC round info)
 * - Back-fills price history on first load so the chart is never empty.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  FUJI_RPC_PUBLIC,
  COLLATERAL_TOKEN_ADDRESS,
} from '../utils/contract';
import { usePriceStream, StreamPrices } from '../hooks/usePriceStream';

/* ─── Public types ───────────────────────────────────────────────── */

export interface PriceTick {
  t: number;     // epoch ms
  price: number; // USD float
}

export interface MarketInfo {
  assetId: number;
  symbol: string;
  color: string;
  roundId: number;
  roundNumber: number;
  startPrice: number;   // USD float
  currentPrice: number; // USD float (live CEX median)
  startTime: number;    // unix seconds
  endTime: number;      // unix seconds
  resolved: boolean;
  upPool: number;       // token float (TUSDC)
  downPool: number;
  totalPool: number;
  decimals: number;
}

export interface MarketSnapshot {
  markets: Record<number, MarketInfo>;
  history: Record<number, PriceTick[]>;
  decimals: number;
  lastUpdated: number;
  ready: boolean;
  error: string;
}

/* ─── Module-level singleton ─────────────────────────────────────── */

const ASSET_META: Record<string, { color: string }> = {
  BTC:  { color: '#f7931a' },
  ETH:  { color: '#627eea' },
  AVAX: { color: '#E84142' },
  BNB:  { color: '#f3ba2f' },
  NEAR: { color: '#00C08B' },
};

const HISTORY_MAX   = 600;  // ~3×5m rounds at 3s ticks
const PREFILL_TICKS = 60;   // synthetic ticks seeded at startup
const PRICE_TICK_MS = 3_000;
const CHAIN_POLL_MS = 12_000;

// Snapshot held outside React — survives StrictMode unmount/remount
let snapshot: MarketSnapshot = {
  markets: {},
  history: {},
  decimals: 6,
  lastUpdated: 0,
  ready: false,
  error: '',
};

// Subscriber set — components that need to re-render when snapshot updates
type Listener = (s: MarketSnapshot) => void;
const listeners = new Set<Listener>();

function notify(next: Partial<MarketSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach(fn => fn(snapshot));
}

// Polling state
let chainTimer: ReturnType<typeof setInterval> | null = null;
let contract: ethers.Contract | null = null;
let decimals = 6;
let started = false;    // true once bootstrap() has been called

/* ─── Helpers ────────────────────────────────────────────────────── */

function pushTick(assetId: number, price: number, t = Date.now()) {
  if (!snapshot.history[assetId]) snapshot.history[assetId] = [];
  const hist = snapshot.history[assetId];
  const last = hist[hist.length - 1];
  if (!last || last.price !== price || t - last.t > 1500) {
    hist.push({ t, price });
  }
  if (hist.length > HISTORY_MAX) {
    snapshot.history[assetId] = hist.slice(-HISTORY_MAX);
  }
}

function seedHistory(assetId: number, startPrice: number, currentPrice: number, startTime: number) {
  if ((snapshot.history[assetId]?.length ?? 0) > 0) return;
  const now  = Date.now();
  const t0   = startTime * 1000;
  const elapsed = Math.max(0, now - t0);
  const count   = Math.min(PREFILL_TICKS, Math.floor(elapsed / PRICE_TICK_MS));
  if (count <= 0) {
    pushTick(assetId, startPrice, t0);
    return;
  }
  for (let i = 0; i <= count; i++) {
    const frac  = i / Math.max(count, 1);
    const t     = t0 + frac * elapsed;
    const noise = (Math.random() - 0.5) * Math.abs(currentPrice - startPrice) * 0.12;
    const p     = startPrice + (currentPrice - startPrice) * frac + noise;
    pushTick(assetId, Math.max(p, 0.0001), t);
  }
}

async function hydrateCandleHistory(assetMap: Array<{ assetId: number; symbol: string }>) {
  await Promise.all(
    assetMap.map(async ({ assetId, symbol }) => {
      if (snapshot.history[assetId]?.length) return;
      try {
        const response = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=120`);
        if (!response.ok) return;
        const body = await response.json();
        for (const candle of body.candles || []) {
          pushTick(assetId, Number(candle.close), Number(candle.openTime));
        }
      } catch {
        // Synthetic round history remains available when candle storage is empty.
      }
    })
  );
}

async function fetchChain() {
  if (!contract) return;
  try {
    const assetCountBn = await contract.getAssetCount();
    const assetCount = Number(assetCountBn);
    if (assetCount === 0) {
      notify({ ready: true, error: '' });
      return;
    }

    const assetMap: Array<{ assetId: number; symbol: string; roundId: number }> = [];
    for (let assetId = 0; assetId < assetCount; assetId++) {
      const asset  = await contract.getAsset(assetId);
      const roundId = Number(asset.currentRoundId);
      if (roundId === 0) continue;
      const sym = String(asset.symbol ?? '').trim();
      assetMap.push({ assetId, symbol: sym, roundId });
    }
    if (assetMap.length === 0) {
      notify({ ready: true, error: '' });
      return;
    }

    const roundResults = await Promise.all(
      assetMap.map(({ roundId }) => contract!.getRoundInfo(roundId))
    );
    await hydrateCandleHistory(assetMap);

    const newMarkets: Record<number, MarketInfo> = { ...snapshot.markets };

    for (let i = 0; i < assetMap.length; i++) {
      const { assetId, symbol, roundId } = assetMap[i];
      const round = roundResults[i];
      const meta  = ASSET_META[symbol] || { color: '#5A554E' };

      const startPrice  = Number(round.startPrice)  / 1e8;
      const chainPrice  = Number(round.currentPrice) / 1e8;
      const currentPrice = snapshot.markets[assetId]?.currentPrice || chainPrice;
      const startTime   = Number(round.startTime);

      seedHistory(assetId, startPrice, currentPrice, startTime);
      pushTick(assetId, currentPrice);

      newMarkets[assetId] = {
        assetId, symbol,
        color: meta.color,
        roundId,
        roundNumber: Number(round.roundNumber),
        startPrice, currentPrice, startTime,
        endTime:   Number(round.endTime),
        resolved:  Boolean(round.resolved),
        upPool:    Number(ethers.formatUnits(round.upPool,   decimals)),
        downPool:  Number(ethers.formatUnits(round.downPool, decimals)),
        totalPool: Number(ethers.formatUnits(round.collateralPool, decimals)),
        decimals,
      };
    }

    notify({
      markets:     newMarkets,
      history:     { ...snapshot.history },
      decimals,
      lastUpdated: Date.now(),
      ready:       true,
      error:       '',
    });
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || 'Chain fetch failed';
    console.error('[MarketData] chain fetch error:', msg);
    // Still mark ready so UI doesn't hang forever; show error banner
    notify({ error: msg, ready: true });
  }
}

/** Call once — safe to call multiple times (no-op after first call). */
async function bootstrap() {
  if (started) return;
  started = true;

  try {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    // Fetch decimals once
    try {
      const token = new ethers.Contract(
        COLLATERAL_TOKEN_ADDRESS,
        ['function decimals() view returns (uint8)'],
        provider,
      );
      decimals = Number(await token.decimals());
    } catch {
      decimals = 6;
    }

    await fetchChain(); // first full load
  } catch (err: any) {
    const msg = err?.message || 'Bootstrap failed';
    console.error('[MarketData] bootstrap error:', msg);
    notify({ error: msg, ready: true });
  }

  // Chain state remains polled; prices arrive exclusively over WebSocket.
  if (!chainTimer) chainTimer = setInterval(fetchChain,   CHAIN_POLL_MS);
}

/* ─── React context ──────────────────────────────────────────────── */

const MarketDataContext = createContext<MarketSnapshot>(snapshot);

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MarketSnapshot>(snapshot);
  const { prices, connected, error: streamError } = usePriceStream();
  const [polledPrices, setPolledPrices] = useState<StreamPrices>({});

  useEffect(() => {
    // Subscribe to singleton updates
    const listener: Listener = s => setState({ ...s });
    listeners.add(listener);

    // Start bootstrap (no-op if already running)
    bootstrap();

    return () => {
      listeners.delete(listener);
      // NOTE: We intentionally do NOT stop the polling timers here.
      // The singleton keeps running as long as the app is alive.
      // This survives StrictMode unmount/remount cycles correctly.
    };
  }, []);

  // Fallback: when the /ws gateway is unavailable (e.g. `npm run dev:ui`
  // without server.js/Redis), poll /api/prices so charts stay live.
  useEffect(() => {
    if (connected) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/prices');
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled || !body?.prices) return;
        const mapped: StreamPrices = {};
        for (const [symbol, p] of Object.entries<any>(body.prices)) {
          mapped[symbol] = {
            symbol,
            price: Number(p.price),
            price8: String(p.price8),
            updatedAt: Number(p.updatedAt),
          };
        }
        setPolledPrices(mapped);
      } catch {
        // Offline — keep whatever data we already have.
      }
    };
    poll();
    const timer = setInterval(poll, PRICE_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connected]);

  const livePrices = connected ? prices : polledPrices;

  useEffect(() => {
    if (!Object.keys(livePrices).length) return;
    const markets = { ...snapshot.markets };
    let changed = false;
    for (const market of Object.values(markets)) {
      const tick = livePrices[market.symbol];
      if (!tick || !Number.isFinite(tick.price) || tick.price <= 0) continue;
      markets[market.assetId] = { ...market, currentPrice: tick.price };
      pushTick(market.assetId, tick.price, tick.updatedAt * 1_000);
      changed = true;
    }
    if (changed) {
      notify({
        markets,
        history: { ...snapshot.history },
        lastUpdated: Date.now(),
        error: '',
      });
    }
  }, [livePrices]);

  useEffect(() => {
    // Suppress the "reconnecting" banner while the HTTP polling fallback is
    // delivering prices — it only matters if we truly have no price source.
    if (streamError && snapshot.ready && !Object.keys(polledPrices).length) {
      notify({ error: streamError });
    }
  }, [streamError, polledPrices]);

  return (
    <MarketDataContext.Provider value={state}>
      {children}
    </MarketDataContext.Provider>
  );
}

/* ─── Hooks ─────────────────────────────────────────────────────── */

export function useMarketData(): MarketSnapshot {
  return useContext(MarketDataContext);
}

export function useMarket(assetId: number | null): MarketInfo | null {
  const { markets } = useContext(MarketDataContext);
  if (assetId === null) return null;
  return markets[assetId] ?? null;
}

export function useMarketHistory(assetId: number | null): PriceTick[] {
  const { history } = useContext(MarketDataContext);
  if (assetId === null) return [];
  return history[assetId] ?? [];
}

/** Force chain refresh (used after settlement). */
export async function refreshMarketData(): Promise<void> {
  await fetchChain();
}

/** True if any live round has passed endTime but is not resolved. */
export function hasExpiredMarkets(nowSec = Math.floor(Date.now() / 1000)): boolean {
  return Object.values(snapshot.markets).some((m) => !m.resolved && m.endTime <= nowSec);
}
