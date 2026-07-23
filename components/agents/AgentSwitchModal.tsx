import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AgentBadgeRow from './AgentBadgeRow';
import type { AgentData } from './AgentCard';
import { clearAgentStatusCache } from '../../hooks/useAgentStatus';
import { readBrowserCache, writeBrowserCache } from '../../utils/browserCache';

const CATALOG_NS = 'agent-catalog';
const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

type Timing = 'immediate' | 'next_market';

interface AgentSwitchModalProps {
  open: boolean;
  wallet: string;
  activeAgentId?: string | null;
  mode?: 'switch' | 'kill';
  onClose: () => void;
  onDone?: () => void;
}

export default function AgentSwitchModal({
  open,
  wallet,
  activeAgentId,
  mode = 'switch',
  onClose,
  onDone,
}: AgentSwitchModalProps) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timing, setTiming] = useState<Timing>('next_market');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setTiming('next_market');
    setSelectedId(null);
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

  const isKill = mode === 'kill';

  const submit = async () => {
    if (!isKill && !selectedId) {
      setError('Pick an agent to switch to.');
      return;
    }
    if (!isKill && selectedId === activeAgentId) {
      onClose();
      return;
    }

    const confirmMsg = isKill
      ? timing === 'immediate'
        ? 'Kill this agent now? No further trades. History stays on this wallet.'
        : 'Kill after current markets finish? The agent will take no new trades, then stop.'
      : timing === 'immediate'
        ? `Switch to the selected agent now? You will re-sign to deploy.`
        : `Schedule switch after current markets finish? No new trades until then.`;

    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/agents/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet,
          action: isKill ? 'kill' : 'switch',
          timing,
          targetAgentId: isKill ? undefined : selectedId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      if (data.applied) {
        clearAgentStatusCache(wallet);
        onClose();
        onDone?.();
        if (data.redirectTo) router.push(data.redirectTo);
        else router.push('/agents');
        return;
      }

      onClose();
      onDone?.();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Could not apply');
    } finally {
      setBusy(false);
    }
  };

  const timingOpt = (value: Timing, label: string, hint: string) => {
    const on = timing === value;
    return (
      <button
        type="button"
        onClick={() => setTiming(value)}
        style={{
          flex: '1 1 180px',
          textAlign: 'left',
          padding: '12px 14px',
          border: on ? `2px solid ${RED}` : '1px solid #0D0B08',
          background: on ? 'rgba(192,57,43,0.06)' : '#FAF8F3',
          cursor: 'pointer',
        }}
      >
        <p style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: on ? RED : '#0D0B08', margin: 0 }}>
          {label}
        </p>
        <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '6px 0 0' }}>{hint}</p>
      </button>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isKill ? 'Kill agent' : 'Switch agent'}
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
          maxHeight: '90vh',
          overflow: 'auto',
          background: '#FAF8F3',
          border: '2px solid #0D0B08',
          padding: '22px 22px 24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ ...S.serif, fontSize: 20, fontWeight: 900, margin: 0, color: '#0D0B08' }}>
              {isKill ? 'Kill agent' : 'Switch agent'}
            </h2>
            <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '6px 0 0' }}>
              {isKill
                ? 'Stop this agent from trading. Choose when it takes effect.'
                : 'Pick a badge, then choose this market or next market.'}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {timingOpt(
            'immediate',
            'This market',
            isKill ? 'Stop immediately — no more trades.' : 'Clear now and deploy the new agent.'
          )}
          {timingOpt(
            'next_market',
            'Next market',
            isKill
              ? 'Finish open markets, then kill — no new entries.'
              : 'Finish open markets, then switch — no new entries until then.'
          )}
        </div>

        {!isKill ? (
          <>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 10 }}>Select agent</p>
            <AgentBadgeRow
              agents={agents}
              activeId={activeAgentId}
              selectedId={selectedId}
              loading={loading}
              activeFirst
              onSelect={(a) => setSelectedId(a.id)}
            />
          </>
        ) : null}

        {error ? <p style={{ ...S.mono, fontSize: 12, color: RED, marginTop: 14 }}>{error}</p> : null}

        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            disabled={busy || (!isKill && !selectedId)}
            onClick={submit}
            style={{
              ...S.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '12px 18px',
              border: `1px solid ${RED}`,
              background: RED,
              color: '#FAF8F3',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy || (!isKill && !selectedId) ? 0.5 : 1,
            }}
          >
            {busy ? 'Working…' : isKill ? 'Confirm kill' : 'Confirm switch'}
          </button>
        </div>
      </div>
    </div>
  );
}
