import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { clearBrowserCache, readBrowserCache, writeBrowserCache } from '../utils/browserCache';

const CACHE_NS = 'agent-status';
const LEGACY_PREFIX = 'clawx-agent-status:';

export interface TradeRow {
  at: number | string;
  action: string;
  side: string;
  symbol: string;
  amountTusdc: number;
  hash?: string;
  roundId?: number;
  assetId?: number;
  outcome?: 'win' | 'loss' | 'pending' | null;
  settledAt?: number;
  outcomeNote?: string;
  pnlTusdc?: number | null;
  pendingSettlement?: boolean;
}

export interface DelegateStatus {
  spentTusdc: number;
  maxTusdc: number;
  remainingTusdc: number;
  capReached: boolean;
  delegateExpired: boolean;
  delegateDeadline: number;
  paused: boolean;
  canTrade: boolean;
  needsRedeploy: boolean;
}

export interface WalletLimitsStatus {
  txUnlimited: boolean;
  txLimit: number | null;
  txUsed: number;
  txRemaining: number | null;
  agentSpendUnlimited: boolean;
  agentSpendLimitTusdc: number | null;
  agentTradeSizeTusdc?: number | null;
}

export interface PendingSettlement {
  roundId: number;
  symbol: string;
  side: string;
  amountTusdc: number;
  hash: string;
  placedAt: number;
  waitingSec: number;
  assetId?: number;
}

export interface MatchRow {
  roundId?: number;
  symbol: string;
  side: string;
  amountTusdc: number;
  outcome: 'win' | 'loss';
  pnlTusdc: number | null;
  hash?: string;
  at: number | string;
  settledAt?: number;
  outcomeNote?: string;
  assetId?: number;
}

export interface AgentStatusData {
  enrolled: boolean;
  retired?: boolean;
  agent?: { id?: string; name: string; emoji: string; handle: string; color: string };
  aum?: number;
  returnPct?: number;
  openPositions?: Array<{
    roundId: string | number;
    symbol: string;
    roundNumber: number;
    side: string;
    assetId?: number;
  }>;
  tradeLog?: TradeRow[];
  enrichedTradeLog?: TradeRow[];
  matchHistory?: MatchRow[];
  pendingSettlements?: PendingSettlement[];
  poolSummary?: {
    totalPoolTusdc: number;
    totalWonTusdc: number;
    totalLostTusdc: number;
    netPnlTusdc: number;
    pendingCount: number;
  };
  delegate?: DelegateStatus;
  walletLimits?: WalletLimitsStatus;
  pendingControl?: {
    action: 'kill' | 'switch';
    timing: 'immediate' | 'next_market';
    targetAgentId?: string | null;
    tradeSizeTusdc?: number | null;
    requestedAt?: number;
    ready?: boolean;
    readyAt?: number;
  } | null;
  enrollment?: {
    tradeSizeTusdc?: number;
    paused?: boolean;
    agentMemory?: {
      aiMode?: string;
      recentThoughts?: Array<{ at: string; text: string }>;
      journal?: Array<{ at: number; type: string; text: string }>;
    };
  };
  trackRecord?: {
    wins: number;
    losses: number;
    settled: number;
    winRate: number | null;
    totalTrades: number;
    pendingOutcomes: number;
    summary: string;
    bySymbol: Array<{ symbol: string; wins: number; losses: number; lastResult: string | null; lastSide: string | null }>;
  };
  updatedAt?: number;
}

function migrateLegacyCache(wallet: string): AgentStatusData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${LEGACY_PREFIX}${wallet.toLowerCase()}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as AgentStatusData;
    writeBrowserCache(CACHE_NS, data, wallet);
    sessionStorage.removeItem(`${LEGACY_PREFIX}${wallet.toLowerCase()}`);
    return data;
  } catch {
    return null;
  }
}

function readCache(wallet: string): AgentStatusData | null {
  return readBrowserCache<AgentStatusData>(CACHE_NS, wallet) || migrateLegacyCache(wallet);
}

function writeCache(wallet: string, data: AgentStatusData) {
  writeBrowserCache(CACHE_NS, data, wallet);
}

export function clearAgentStatusCache(wallet?: string) {
  clearBrowserCache(CACHE_NS, wallet);
  if (typeof window === 'undefined') return;
  if (wallet) {
    sessionStorage.removeItem(`${LEGACY_PREFIX}${wallet.toLowerCase()}`);
    return;
  }
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith(LEGACY_PREFIX)) sessionStorage.removeItem(key);
  });
}

export function useAgentStatus(pollMs = 3000) {
  const { account } = useWallet();
  const [status, setStatus] = useState<AgentStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasCacheRef = useRef(false);

  // Paint cached status before paint so Agent pages don't flash empty.
  useLayoutEffect(() => {
    if (!account) {
      setStatus(null);
      hasCacheRef.current = false;
      setLoading(false);
      setError('');
      setStale(false);
      return;
    }
    const cached = readCache(account);
    if (cached) {
      setStatus(cached);
      hasCacheRef.current = true;
      setLoading(false);
    } else {
      hasCacheRef.current = false;
      setLoading(true);
    }
  }, [account]);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!account) {
      setStatus(null);
      setError('');
      setStale(false);
      return null;
    }

    const silent = opts?.silent ?? hasCacheRef.current;
    if (!silent) setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/agents/status?wallet=${account}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = (await res.json()) as AgentStatusData;
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to load agent status');

      setStatus(data);
      writeCache(account, data);
      hasCacheRef.current = true;
      setError('');
      setStale(false);
      return data;
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === 'AbortError') return null;
      const cached = readCache(account);
      if (cached) {
        setStatus(cached);
        hasCacheRef.current = true;
        setStale(true);
        setError(err.message || 'Showing saved agent data — syncing…');
      } else {
        setError(err.message || 'Failed to load agent status');
      }
      return cached;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) return undefined;
    refresh({ silent: true });
    const timer = setInterval(() => refresh({ silent: true }), pollMs);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [account, pollMs, refresh]);

  return {
    account,
    status,
    enrolled: Boolean(status?.enrolled),
    loading: loading && !status,
    error,
    stale,
    refresh,
  };
}
