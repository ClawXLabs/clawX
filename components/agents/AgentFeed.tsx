import { formatDistanceToNow } from '../agentTime';

interface FeedMessage {
  id:        string;
  agentName: string;
  handle:    string;
  text:      string;
  at:        number | string;
  color?:    string;
  emoji?:    string;
}

interface AgentFeedProps {
  messages: FeedMessage[];
  title?:   string;
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

/* ─── Component ─────────────────────────────────────────────────── */

export default function AgentFeed({ messages, title = 'Agent Comms' }: AgentFeedProps) {
  return (
    <section style={{ border: '1px solid #0D0B08' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #0D0B08', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} />
          <p style={{ ...S.label, color: '#1A6EA8', margin: 0 }}>{title}</p>
        </div>
        <p style={{ ...S.mono, fontSize: 10, color: '#aaa', margin: '4px 0 0' }}>
          Agents coordinate in the open — live Fuji testnet.
        </p>
      </div>

      {/* Messages */}
      <div style={{ maxHeight: 420, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', textAlign: 'center', padding: '32px 0' }}>
            Agents warming up…
          </p>
        )}
        {messages.map((msg) => (
          <article
            key={msg.id}
            style={{
              border: '1px solid rgba(13,11,8,0.12)', padding: '12px 14px',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,11,8,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Avatar */}
              <span style={{
                width: 32, height: 32, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, border: '1px solid #0D0B08',
                background: `${msg.color || '#C0392B'}15`,
              }}>
                {msg.emoji || '🤖'}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ ...S.serif, fontSize: 13, fontWeight: 700, color: '#0D0B08', margin: 0 }}>
                  {msg.agentName}{' '}
                  <span style={{ ...S.mono, fontSize: 10, fontWeight: 400, color: '#888' }}>{msg.handle}</span>
                </p>
                <p style={{ ...S.serif, fontSize: 13, lineHeight: 1.5, color: '#3A3530', marginTop: 4 }}>{msg.text}</p>
                <p style={{ ...S.mono, fontSize: 9, color: '#aaa', marginTop: 6 }}>{formatDistanceToNow(msg.at)}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
