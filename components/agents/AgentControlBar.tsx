import { useState } from 'react';
import type { DelegateStatus, WalletLimitsStatus } from '../../hooks/useAgentStatus';
import AgentSwitchModal from './AgentSwitchModal';

const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

interface AgentControlBarProps {
  wallet: string;
  activeAgentId?: string | null;
  delegate?: DelegateStatus;
  walletLimits?: WalletLimitsStatus;
  onRefresh: () => void;
}

function redBtn(solid: boolean, disabled?: boolean): React.CSSProperties {
  return {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${RED}`,
    background: solid ? RED : 'transparent',
    color: solid ? '#FAF8F3' : RED,
    opacity: disabled ? 0.55 : 1,
  };
}

export default function AgentControlBar({
  wallet,
  activeAgentId,
  delegate,
  walletLimits,
  onRefresh,
}: AgentControlBarProps) {
  const [pausing, setPausing] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
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

  return (
    <div>
      <AgentSwitchModal
        open={switchOpen}
        wallet={wallet}
        activeAgentId={activeAgentId}
        onClose={() => setSwitchOpen(false)}
      />

      {delegate?.needsRedeploy || delegate?.capReached || delegate?.delegateExpired ? (
        <div
          style={{
            border: `2px solid ${RED}`,
            background: 'rgba(192,57,43,0.08)',
            padding: '14px 16px',
            marginBottom: 16,
          }}
        >
          <p
            style={{
              ...S.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: RED,
              margin: 0,
            }}
          >
            AGENT ACTION REQUIRED
          </p>
          <p style={{ ...S.serif, fontSize: 14, color: '#0D0B08', margin: '8px 0 0' }}>
            {delegate.delegateExpired
              ? 'Your delegation signature has expired. Re-deploy to resume trading.'
              : `Spending cap reached (${delegate.spentTusdc} / ${delegate.maxTusdc} TUSDC). Re-deploy to refresh your budget.`}
          </p>
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            style={{ ...redBtn(true), marginTop: 12 }}
          >
            Re-deploy / Switch
          </button>
        </div>
      ) : null}

      {delegate && !delegate.needsRedeploy ? (
        <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 10 }}>
          Budget {delegate.spentTusdc}/{delegate.maxTusdc} TUSDC
          {walletLimits
            ? ` · Txn ${
                walletLimits.txUnlimited ? 'None' : `${walletLimits.txRemaining ?? 0} left`
              }`
            : ''}
          {walletLimits && !walletLimits.agentSpendUnlimited
            ? ` · Cap ${walletLimits.agentSpendLimitTusdc} TUSDC`
            : ''}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={togglePause}
          disabled={pausing || !!delegate?.needsRedeploy}
          style={redBtn(!delegate?.paused, pausing || !!delegate?.needsRedeploy)}
        >
          {pausing ? '…' : delegate?.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={() => setSwitchOpen(true)} style={redBtn(false)}>
          Switch
        </button>
      </div>

      {msg ? (
        <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', marginTop: 10 }}>{msg}</p>
      ) : null}
    </div>
  );
}
