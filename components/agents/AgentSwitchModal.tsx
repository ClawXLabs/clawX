import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AgentBadgeRow from './AgentBadgeRow';
import type { AgentData } from './AgentCard';
import { clearAgentStatusCache } from '../../hooks/useAgentStatus';
import { readBrowserCache, writeBrowserCache } from '../../utils/browserCache';

const CATALOG_NS = 'agent-catalog';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

interface AgentSwitchModalProps {
  open: boolean;
  wallet: string;
  activeAgentId?: string | null;
  onClose: () => void;
}

export default function AgentSwitchModal({ open, wallet, activeAgentId, onClose }: AgentSwitchModalProps) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const cached = readBrowserCache<{ agents: AgentData[] }>(CATALOG_NS);
    if (cached?.agents?.length) {
      setAgents(cached.agents);
      setLoading(false);
    }
    fetch('/api/agents/catalog')
      .then((r) => r.json())
      .then((data: { agents?: AgentData[] }) => {
        const next = data.agents || [];
        setAgents(next);
        writeBrowserCache(CATALOG_NS, { agents: next });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const pick = async (agent: AgentData) => {
    if (agent.id === activeAgentId) {
      onClose();
      return;
    }
    const ok = window.confirm(
      `Switch to ${agent.name}? Trade history stays with this wallet. Agent memory resets.`
    );
    if (!ok) return;
    setBusyId(agent.id);
    setError('');
    try {
      const res = await fetch('/api/agents/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      clearAgentStatusCache(wallet);
      onClose();
      router.push(`/agents/new?agent=${encodeURIComponent(agent.id)}`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Could not switch');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch agent"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(13,11,8,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(1100px, 100%)',
          background: '#FAF8F3',
          border: '2px solid #0D0B08',
          padding: '22px 22px 24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ ...S.serif, fontSize: 20, fontWeight: 900, margin: 0, color: '#0D0B08' }}>
              Switch agent
            </h2>
            <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '6px 0 0' }}>
              Pick a badge to deploy a different agent on this wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...S.mono,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid #0D0B08',
              background: 'transparent',
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
        {error ? <p style={{ ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 12 }}>{error}</p> : null}
        {busyId ? (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', marginBottom: 12 }}>Switching…</p>
        ) : null}
        <AgentBadgeRow
          agents={agents}
          activeId={activeAgentId}
          loading={loading}
          onSelect={busyId ? undefined : pick}
        />
      </div>
    </div>
  );
}
