import { useRouter } from 'next/router';
import { useState } from 'react';
import { clearAgentStatusCache } from '../../hooks/useAgentStatus';
import type { DelegateStatus } from '../../hooks/useAgentStatus';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

interface AgentControlBarProps {
  wallet: string;
  delegate?: DelegateStatus;
  onRefresh: () => void;
}

export default function AgentControlBar({ wallet, delegate, onRefresh }: AgentControlBarProps) {
  const router = useRouter();
  const [pausing, setPausing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState('');

  const togglePause = async () => {
    setPausing(true);
    setMsg('');
    try {
      const res = await fetch('/api/agents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, paused: !delegate?.paused }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pause failed');
      setMsg(data.message);
      onRefresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err.message || 'Pause failed');
    } finally {
      setPausing(false);
    }
  };

  const switchAgent = async () => {
    const ok = window.confirm(
      'Switch to a different agent? Your transaction history stays with this wallet. Only agent memory and settings are cleared.'
    );
    if (!ok) return;
    setResetting(true);
    setMsg('');
    try {
      const res = await fetch('/api/agents/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      clearAgentStatusCache(wallet);
      router.push('/agents/new');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const redeploy = async () => {
    const ok = window.confirm(
      'Re-deploy your agent? This refreshes your spending delegation. Your trade history is preserved.'
    );
    if (!ok) return;
    await switchAgent();
  };

  const btnStyle = (variant: 'dark' | 'warn' | 'ghost') => ({
    ...S.mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    padding: '10px 16px',
    cursor: 'pointer',
    border: variant === 'ghost' ? '1px solid rgba(13,11,8,0.25)' : 'none',
    background: variant === 'dark' ? '#0D0B08' : variant === 'warn' ? '#C0392B' : 'transparent',
    color: variant === 'ghost' ? '#0D0B08' : '#FAF8F3',
    opacity: pausing || resetting ? 0.6 : 1,
  });

  return (
    <div>
      {(delegate?.needsRedeploy || delegate?.capReached || delegate?.delegateExpired) ? (
        <div style={{
          border: '2px solid #C0392B', background: 'rgba(192,57,43,0.08)',
          padding: '14px 16px', marginBottom: 16,
        }}>
          <p style={{ ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#C0392B', margin: 0 }}>
            ⚠ AGENT ACTION REQUIRED
          </p>
          <p style={{ ...S.serif, fontSize: 14, color: '#0D0B08', margin: '8px 0 0' }}>
            {delegate.delegateExpired
              ? 'Your delegation signature has expired. Re-deploy to resume trading.'
              : `Spending cap reached (${delegate.spentTusdc} / ${delegate.maxTusdc} TUSDC). Re-deploy to refresh your budget.`}
          </p>
          <button type="button" onClick={redeploy} disabled={resetting} style={{ ...btnStyle('warn'), marginTop: 12 }}>
            {resetting ? 'Re-deploying…' : 'Re-deploy Agent'}
          </button>
        </div>
      ) : null}

      {delegate && !delegate.needsRedeploy ? (
        <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 12 }}>
          Budget: {delegate.spentTusdc} / {delegate.maxTusdc} TUSDC used · {delegate.remainingTusdc} remaining
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={togglePause} disabled={pausing || delegate?.needsRedeploy} style={btnStyle(delegate?.paused ? 'dark' : 'ghost')}>
          {pausing ? '…' : delegate?.paused ? 'Resume Trading' : 'Pause Next Trade'}
        </button>
        <button type="button" onClick={switchAgent} disabled={resetting} style={btnStyle('ghost')}>
          {resetting ? 'Switching…' : 'Switch Agent'}
        </button>
      </div>

      {msg ? <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', marginTop: 10 }}>{msg}</p> : null}
    </div>
  );
}
