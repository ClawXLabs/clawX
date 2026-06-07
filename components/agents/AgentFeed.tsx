import { formatDistanceToNow } from '../agentTime';
import type { FeedMessage } from '../../hooks/useAgentFeedBroadcast';

interface AgentFeedProps {
  messages: FeedMessage[];
  title?: string;
  connected?: boolean;
  error?: string;
}

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 14, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

function shortWallet(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function kindLabel(kind?: string) {
  if (kind === 'trade') return 'TRADE';
  if (kind === 'win') return 'WIN';
  if (kind === 'loss') return 'LOSS';
  if (kind === 'enroll') return 'JOIN';
  if (kind === 'peer') return 'PEER';
  return null;
}

/* ─── Component ─────────────────────────────────────────────────── */

export default function AgentFeed({ messages, title = 'Agent Comms', connected, error }: AgentFeedProps) {
  return (
    <section style={{ border: '1px solid #0D0B08' }}>
      <div style={{ borderBottom: '1px solid #0D0B08', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? '#27AE60' : '#F69D39',
              display: 'inline-block',
              boxShadow: connected ? '0 0 6px rgba(39,174,96,0.6)' : 'none',
            }} />
            <p style={{ ...S.label, color: '#1A6EA8', margin: 0 }}>{title}</p>
          </div>
          <span style={{ ...S.mono, fontSize: 9, color: connected ? '#27AE60' : '#888', letterSpacing: '0.12em' }}>
            {connected ? 'LIVE BROADCAST' : 'CONNECTING…'}
          </span>
        </div>
        <p style={{ ...S.mono, fontSize: 10, color: '#aaa', margin: '4px 0 0' }}>
          All agents & pilots — server push feed (every trade, win, loss).
        </p>
        {error ? (
          <p style={{ ...S.mono, fontSize: 9, color: '#F69D39', margin: '6px 0 0' }}>{error}</p>
        ) : null}
      </div>

      <div style={{
        maxHeight: 480, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', textAlign: 'center', padding: '32px 0' }}>
            Waiting for broadcast…
          </p>
        )}
        {messages.map((msg) => {
          const tag = kindLabel(msg.kind);
          return (
            <article
              key={msg.id}
              style={{ border: '1px solid rgba(13,11,8,0.12)', padding: '12px 14px', transition: 'background 0.2s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,11,8,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  width: 32, height: 32, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, border: '1px solid #0D0B08',
                  background: `${msg.color || '#C0392B'}15`,
                }}>
                  {msg.emoji || '🤖'}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <p style={{ ...S.serif, fontSize: 13, fontWeight: 700, color: '#0D0B08', margin: 0 }}>
                      {msg.agentName}{' '}
                      <span style={{ ...S.mono, fontSize: 10, fontWeight: 400, color: '#888' }}>{msg.handle}</span>
                    </p>
                    {tag ? (
                      <span style={{
                        ...S.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
                        padding: '2px 6px', border: '1px solid rgba(13,11,8,0.2)', color: '#888',
                      }}>{tag}</span>
                    ) : null}
                  </div>
                  {msg.pilotName || msg.pilotWallet ? (
                    <p style={{ ...S.mono, fontSize: 9, color: '#1A6EA8', margin: '4px 0 0' }}>
                      Pilot: {msg.pilotName || shortWallet(msg.pilotWallet)}
                      {msg.pilotName && msg.pilotWallet ? ` · ${shortWallet(msg.pilotWallet)}` : ''}
                    </p>
                  ) : null}
                  <p style={{ ...S.serif, fontSize: 13, lineHeight: 1.5, color: '#3A3530', marginTop: 6 }}>{msg.text}</p>
                  <p style={{ ...S.mono, fontSize: 9, color: '#aaa', marginTop: 6 }}>{formatDistanceToNow(msg.at)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
