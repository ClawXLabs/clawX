import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';

const CACHE_PREFIX = 'clawx-agent-status:';

export interface TradeRow {
  at: number | string;
  action: string;
  side: string;
  symbol: string;
  amountTusdc: number;
  hash?: string;
  roundId?: number;
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

export interface PendingSettlement {
  roundId: number;
  symbol: string;
  side: string;
  amountTusdc: number;
  hash: string;
  placedAt: number;
  waitingSec: number;
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
}

export interface AgentStatusData {
  enrolled: boolean;
  retired?: boolean;
  agent?: { id?: string; name: string; emoji: string; handle: string; color: string };
  aum?: number;
  returnPct?: number;
  openPositions?: Array<{ roundId: string; symbol: string; roundNumber: number; side: string }>;
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

function readCache(wallet: string): AgentStatusData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${wallet.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as AgentStatusData) : null;
  } catch {
    return null;
  }
}

function writeCache(wallet: string, data: AgentStatusData) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${wallet.toLowerCase()}`, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function clearAgentStatusCache(wallet?: string) {
  if (typeof window === 'undefined') return;
  if (wallet) {
    sessionStorage.removeItem(`${CACHE_PREFIX}${wallet.toLowerCase()}`);
    return;
  }
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
  });
}

export function useAgentStatus(pollMs = 3000) {
  const { account } = useWallet();
  const [status, setStatus] = useState<AgentStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!account) {
      setStatus(null);
      setError('');
      setStale(false);
      return null;
    }

    if (!opts?.silent) setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/agents/status?wallet=${account}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await res.json() as AgentStatusData;
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to load agent status');

      setStatus(data);
      writeCache(account, data);
      setError('');
      setStale(false);
      return data;
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === 'AbortError') return null;
      const cached = readCache(account);
      if (cached?.enrolled) {
        setStatus(cached);
        setStale(true);
        setError(err.message || 'Using cached agent data — reconnecting…');
      } else {
        setError(err.message || 'Failed to load agent status');
      }
      return cached;
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) {
      setStatus(null);
      return undefined;
    }
    const cached = readCache(account);
    if (cached?.enrolled) setStatus(cached);

    refresh({ silent: Boolean(cached?.enrolled) });
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
    loading,
    error,
    stale,
    refresh,
  };
}
