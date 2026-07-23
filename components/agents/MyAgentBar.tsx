import Link from 'next/link';
import AgentIcon from './AgentIcon';
import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

/**
 * Compact strip for pages that are not the lobby/dashboard (e.g. New Agent).
 * Lobby and dashboard render their own status hero to avoid duplication.
 */
export default function MyAgentBar() {
  const { enrolled, status, account } = useAgentEnrollment(4000);
  if (!account) return null;

  if (!enrolled) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 24px 0' }}>
        <div
          style={{
            border: '1px solid #F69D39',
            background: 'rgba(246,157,57,0.04)',
            padding: '12px 14px',
            ...S.mono,
            fontSize: 12,
            color: '#F69D39',
          }}
        >
          No active agent.{' '}
          <Link href="/agents/new" style={{ fontWeight: 700, textDecoration: 'underline', color: '#F69D39' }}>
            Deploy one
          </Link>
        </div>
      </div>
    );
  }

  const agent = status?.agent;
  const delegate = status?.delegate;
  const needsAlert = delegate?.needsRedeploy;
  const isPaused = delegate?.paused;
  const statusColor = needsAlert ? '#C0392B' : isPaused ? '#F69D39' : '#27AE60';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 24px 0' }}>
      <div
        style={{
          border: `1px solid ${statusColor}`,
          background: 'rgba(13,11,8,0.02)',
          padding: '12px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #0D0B08',
              background: `${agent?.color || '#27AE60'}15`,
            }}
          >
            <AgentIcon agentId={agent?.id} size={18} color={agent?.color || '#27AE60'} />
          </div>
          <div>
            <p style={{ ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
              {agent?.name}
            </p>
            <p style={{ ...S.mono, fontSize: 10, color: statusColor, margin: '2px 0 0' }}>
              {needsAlert ? 'Action required' : isPaused ? 'Paused' : 'Running'}
              {' · '}
              ${status?.aum?.toLocaleString() ?? '—'} AUM
            </p>
          </div>
        </div>
        <Link href="/agents/dashboard" style={{ textDecoration: 'none' }}>
          <span
            style={{
              display: 'inline-block',
              background: '#0D0B08',
              color: '#FAF8F3',
              padding: '8px 14px',
              ...S.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Dashboard
          </span>
        </Link>
      </div>
    </div>
  );
}
