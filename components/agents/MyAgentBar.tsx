import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AgentIcon from './AgentIcon';
import { useAgentEnrollment, EnrollmentStatus } from '../../hooks/useAgentEnrollment';
import { clearAgentStatusCache } from '../../hooks/useAgentStatus';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

export default function MyAgentBar() {
  const { enrolled, status, account } = useAgentEnrollment(4000);
  if (!account) return null;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 24px 0' }}>
      <div style={{
        border: enrolled ? '1px solid #27AE60' : '1px solid #F69D39',
        background: enrolled ? 'rgba(39,174,96,0.04)' : 'rgba(246,157,57,0.04)',
        padding: '12px 16px',
      }}>
        {!enrolled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...S.mono, fontSize: 12, color: '#F69D39' }}>
            ⚠ No active agent on this wallet.{' '}
            <Link href="/agents/new" style={{ fontWeight: 700, textDecoration: 'underline', color: '#F69D39' }}>
              Deploy one
            </Link>
          </div>
        ) : (
          <ActiveAgentPanel status={status} wallet={account} />
        )}
      </div>
    </div>
  );
}

function ActiveAgentPanel({ status, wallet }: { status: EnrollmentStatus | null; wallet: string }) {
  const router = useRouter();
  const [pausing, setPausing] = useState(false);
  const agent = status?.agent;
  const delegate = status?.delegate;
  const tr = status?.trackRecord;
  const latestThought = status?.enrollment?.agentMemory?.recentThoughts?.[0];
  const needsAlert = delegate?.needsRedeploy;
  const isPaused = delegate?.paused;
  const statusColor = needsAlert ? '#C0392B' : isPaused ? '#F69D39' : '#27AE60';

  const togglePause = async () => {
    setPausing(true);
    try {
      await fetch('/api/agents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, paused: !isPaused }),
      });
    } finally {
      setPausing(false);
    }
  };

  const switchAgent = async () => {
    const ok = window.confirm('Switch agent? Trade history is kept; memory and settings reset.');
    if (!ok) return;
    await fetch('/api/agents/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    clearAgentStatusCache(wallet);
    router.push('/agents/new');
  };

  return (
    <>
      {needsAlert ? (
        <div style={{ ...S.mono, fontSize: 11, color: '#C0392B', marginBottom: 10, fontWeight: 700 }}>
          ⚠ {delegate?.delegateExpired ? 'Delegation expired' : 'Spending cap reached'} —{' '}
          <Link href="/agents/dashboard" style={{ color: '#C0392B' }}>re-deploy from dashboard</Link>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, border: '1px solid #0D0B08',
            background: `${agent?.color || '#27AE60'}15`,
          }}>
            {agent?.emoji || '?'}
          </span>
          <div>
            <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: statusColor, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
              {needsAlert ? 'Action required' : isPaused ? 'Paused' : 'Your agent is running'}
            </p>
            <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: '2px 0 0' }}>{agent?.name}</p>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '2px 0 0' }}>
              {status?.openPositions?.length || 0} open · ${status?.aum?.toLocaleString() ?? '-'} AUM ·{' '}
              {(status?.returnPct ?? 0) >= 0 ? '+' : ''}{status?.returnPct ?? 0}% ·{' '}
              {tr?.wins ?? 0}W/{tr?.losses ?? 0}L
              {status?.poolSummary?.pendingCount ? ` · ${status.poolSummary.pendingCount} pending` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {!needsAlert ? (
            <button
              type="button"
              onClick={togglePause}
              disabled={pausing}
              style={{
                ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                padding: '8px 12px', border: '1px solid rgba(13,11,8,0.25)',
                background: 'transparent', cursor: 'pointer', textTransform: 'uppercase',
              }}
            >
              {pausing ? '…' : isPaused ? 'Resume' : 'Pause'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={switchAgent}
            style={{
              ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              padding: '8px 12px', border: '1px solid rgba(13,11,8,0.25)',
              background: 'transparent', cursor: 'pointer', textTransform: 'uppercase',
            }}
          >
            Switch
          </button>
          <Link href="/agents/dashboard" style={{ textDecoration: 'none' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#27AE60', color: '#FAF8F3',
              padding: '8px 18px', ...S.mono, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              Agent Panel
            </span>
          </Link>
        </div>
      </div>
      {latestThought && (
        <p style={{ ...S.serif, fontSize: 13, fontStyle: 'italic', color: '#888', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(13,11,8,0.1)' }}>
          ● {latestThought.text}
        </p>
      )}
    </>
  );
}
