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
 * - Polls CEX prices every 3s (lightweight: one /api/prices call)
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

const HISTORY_MAX   = 300;
const PREFILL_TICKS = 60;   // synthetic ticks seeded at startup
const CEX_POLL_MS   = 3_000;
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
let cexTimer: ReturnType<typeof setInterval> | null = null;
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
  const count   = Math.min(PREFILL_TICKS, Math.floor(elapsed / CEX_POLL_MS));
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

async function fetchCexPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
    if (!res.ok) return {};
    const data = await res.json();
    const out: Record<string, number> = {};
    for (const sym of symbols) {
      const p8 = data.prices?.[sym]?.price8;
      if (p8 != null) out[sym] = Number(p8); // raw 8-decimal integer
    }
    return out;
  } catch {
    return {};
  }
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

    const symbols = assetMap.map(a => a.symbol);
    const [roundResults, cexPrices] = await Promise.all([
      Promise.all(assetMap.map(({ roundId }) => contract!.getRoundInfo(roundId))),
      fetchCexPrices(symbols),
    ]);

    const newMarkets: Record<number, MarketInfo> = { ...snapshot.markets };

    for (let i = 0; i < assetMap.length; i++) {
      const { assetId, symbol, roundId } = assetMap[i];
      const round = roundResults[i];
      const meta  = ASSET_META[symbol] || { color: '#5A554E' };

      const startPrice  = Number(round.startPrice)  / 1e8;
      const chainPrice  = Number(round.currentPrice) / 1e8;
      const rawCex      = cexPrices[symbol] ?? 0;
      const currentPrice = rawCex > 0 ? rawCex / 1e8 : chainPrice;
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

async function fetchCexOnly() {
  const markets = snapshot.markets;
  const symbols = [...new Set(Object.values(markets).map(m => m.symbol))];
  if (symbols.length === 0) return;

  const cexPrices = await fetchCexPrices(symbols);
  if (Object.keys(cexPrices).length === 0) return;

  const newMarkets = { ...markets };
  for (const market of Object.values(newMarkets)) {
    const rawCex = cexPrices[market.symbol];
    if (!rawCex) continue;
    const currentPrice = rawCex / 1e8;
    newMarkets[market.assetId] = { ...market, currentPrice };
    pushTick(market.assetId, currentPrice);
  }

  notify({
    markets:     newMarkets,
    history:     { ...snapshot.history },
    lastUpdated: Date.now(),
  });
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

  // Start both polling loops (only once, at module level)
  if (!cexTimer)   cexTimer   = setInterval(fetchCexOnly, CEX_POLL_MS);
  if (!chainTimer) chainTimer = setInterval(fetchChain,   CHAIN_POLL_MS);
}

/* ─── React context ──────────────────────────────────────────────── */

const MarketDataContext = createContext<MarketSnapshot>(snapshot);

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MarketSnapshot>(snapshot);

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
