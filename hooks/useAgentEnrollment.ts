import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnrollmentStatus {
  enrolled:      boolean;
  agentId?:      string;
  agent?:        {
    id:        string;
    name:      string;
    emoji:     string;
    color:     string;
    style:     string;
    handle:    string;
  };
  openPositions?: unknown[];
  aum?:          number;
  returnPct?:    number;
  enrollment?:   {
    agentMemory?: {
      recentThoughts?: Array<{ text: string; timestamp: number }>;
    };
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAgentEnrollment(pollMs = 5000) {
  const { account } = useWallet();
  const [status,  setStatus]  = useState<EnrollmentStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!account) { setStatus(null); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/agents/status?wallet=${account}`);
      const data = await res.json() as EnrollmentStatus;
      setStatus(data.enrolled ? data : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
    if (!account) return;
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [account, pollMs, refresh]);

  return {
    account,
    enrolled: Boolean(status?.enrolled),
    status,
    loading,
    refresh,
  };
}
