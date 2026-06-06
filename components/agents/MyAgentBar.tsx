import Link from 'next/link';
import { useAgentEnrollment, EnrollmentStatus } from '../../hooks/useAgentEnrollment';

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

/* ─── Component ─────────────────────────────────────────────────── */

export default function MyAgentBar() {
  const { enrolled, status, account } = useAgentEnrollment(4000);
  if (!account) return null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px 0' }}>
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
          <ActiveAgentPanel status={status} />
        )}
      </div>
    </div>
  );
}

function ActiveAgentPanel({ status }: { status: EnrollmentStatus | null }) {
  const agent = status?.agent;
  const latestThought = status?.enrollment?.agentMemory?.recentThoughts?.[0];

  return (
    <>
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
            <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#27AE60', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} />
              Your agent is working
            </p>
            <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: '2px 0 0' }}>{agent?.name}</p>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '2px 0 0' }}>
              {status?.openPositions?.length || 0} open · ${status?.aum?.toLocaleString() ?? '-'} AUM ·{' '}
              {(status?.returnPct ?? 0) >= 0 ? '+' : ''}{status?.returnPct ?? 0}% return
            </p>
          </div>
        </div>
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
      {latestThought && (
        <p style={{ ...S.serif, fontSize: 13, fontStyle: 'italic', color: '#888', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(13,11,8,0.1)' }}>
          ● {latestThought.text}
        </p>
      )}
    </>
  );
}
