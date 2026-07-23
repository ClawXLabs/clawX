import { useState } from 'react';
import { useRouter } from 'next/router';
import type { DelegateStatus, WalletLimitsStatus } from '../../hooks/useAgentStatus';
import { clearAgentStatusCache } from '../../hooks/useAgentStatus';
import AgentSwitchModal from './AgentSwitchModal';

const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

interface PendingControl {
  action: 'kill' | 'switch';
  timing: 'immediate' | 'next_market';
  targetAgentId?: string | null;
  tradeSizeTusdc?: number | null;
  ready?: boolean;
}

interface AgentControlBarProps {
  wallet: string;
  activeAgentId?: string | null;
  currentTradeSizeTusdc?: number | null;
  forcedTradeSizeTusdc?: number | null;
  delegate?: DelegateStatus;
  walletLimits?: WalletLimitsStatus;
  pendingControl?: PendingControl | null;
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
  currentTradeSizeTusdc,
  forcedTradeSizeTusdc,
  delegate,
  walletLimits,
  pendingControl,
  onRefresh,
}: AgentControlBarProps) {
  const router = useRouter();
  const [pausing, setPausing] = useState(false);
  const [modalMode, setModalMode] = useState<'switch' | 'kill' | null>(null);
  const [busy, setBusy] = useState(false);
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

  const cancelPending = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/agents/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, action: 'cancel_pending' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      setMsg(data.message || 'Cancelled');
      onRefresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err.message || 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const completeSwitch = async () => {
    const targetId = pendingControl?.targetAgentId;
    if (!targetId) {
      setMsg('Missing target agent — cancel and switch again.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/agents/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet,
          action: 'complete_switch',
          targetAgentId: targetId,
          tradeSizeTusdc: pendingControl?.tradeSizeTusdc ?? currentTradeSizeTusdc ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Switch failed');
      clearAgentStatusCache(wallet);
      const dest = data.redirectTo || `/agents/new?agent=${encodeURIComponent(targetId)}`;
      await router.push(dest);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err.message || 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {modalMode ? (
        <AgentSwitchModal
          open
          mode={modalMode}
          wallet={wallet}
          activeAgentId={activeAgentId}
          currentTradeSizeTusdc={currentTradeSizeTusdc}
          forcedTradeSizeTusdc={forcedTradeSizeTusdc}
          onClose={() => setModalMode(null)}
          onDone={onRefresh}
        />
      ) : null}

      {pendingControl ? (
        <div
          style={{
            border: `2px solid ${RED}`,
            background: 'rgba(192,57,43,0.08)',
            padding: '14px 16px',
            marginBottom: 16,
          }}
        >
          <p style={{ ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: RED, margin: 0 }}>
            {pendingControl.ready
              ? pendingControl.action === 'switch'
                ? 'SWITCH READY'
                : 'KILL READY'
              : pendingControl.action === 'switch'
                ? 'SWITCH SCHEDULED'
                : 'KILL SCHEDULED'}
          </p>
          <p style={{ ...S.serif, fontSize: 14, color: '#0D0B08', margin: '8px 0 0' }}>
            {pendingControl.action === 'switch'
              ? pendingControl.ready
                ? 'Live markets cleared. Complete switch to deploy the new agent.'
                : 'Waiting for live markets to finish — or complete switch now to cut over early.'
              : pendingControl.ready
                ? 'Live markets cleared. Confirm to retire this agent.'
                : 'No new trades. Waiting for live markets to finish.'}
            {pendingControl.action === 'switch' && pendingControl.tradeSizeTusdc
              ? ` Trade size: ${pendingControl.tradeSizeTusdc} TUSDC.`
              : ''}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {pendingControl.action === 'switch' && pendingControl.targetAgentId ? (
              <button type="button" onClick={completeSwitch} disabled={busy} style={redBtn(true, busy)}>
                {busy ? '…' : pendingControl.ready ? 'Complete switch' : 'Complete switch now'}
              </button>
            ) : null}
            {pendingControl.ready && pendingControl.action === 'kill' ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await fetch('/api/agents/control', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ wallet, action: 'kill', timing: 'immediate' }),
                    });
                    clearAgentStatusCache(wallet);
                    router.push('/agents');
                  } finally {
                    setBusy(false);
                  }
                }}
                style={redBtn(true, busy)}
              >
                Confirm kill
              </button>
            ) : null}
            <button type="button" onClick={cancelPending} disabled={busy} style={redBtn(false, busy)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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
            onClick={() => setModalMode('switch')}
            style={{ ...redBtn(true), marginTop: 12 }}
          >
            Re-deploy / Switch
          </button>
        </div>
      ) : null}

      {delegate && !delegate.needsRedeploy ? (
        <p style={{ ...S.mono, fontSize: 10, color: '#888', marginBottom: 10 }}>
          Trade size {currentTradeSizeTusdc ?? '—'} TUSDC
          {' · '}
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
          disabled={pausing || !!delegate?.needsRedeploy || !!pendingControl}
          style={redBtn(!delegate?.paused, pausing || !!delegate?.needsRedeploy || !!pendingControl)}
        >
          {pausing ? '…' : delegate?.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={() => setModalMode('switch')}
          disabled={!!pendingControl}
          style={redBtn(false, !!pendingControl)}
        >
          Switch
        </button>
        <button
          type="button"
          onClick={() => setModalMode('kill')}
          disabled={!!pendingControl}
          style={redBtn(true, !!pendingControl)}
        >
          Kill
        </button>
      </div>

      {msg ? (
        <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', marginTop: 10 }}>{msg}</p>
      ) : null}
    </div>
  );
}
