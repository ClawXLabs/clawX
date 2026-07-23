import AgentIcon from './AgentIcon';
import type { AgentData } from './AgentCard';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
};

interface AgentBadgeRowProps {
  agents: AgentData[];
  selectedId?: string | null;
  activeId?: string | null;
  onSelect?: (agent: AgentData) => void;
  loading?: boolean;
  /** Put the running agent first in the row */
  activeFirst?: boolean;
}

/** Four agents in one row on large screens (flex wrap on small). Accessible badge buttons. */
export default function AgentBadgeRow({
  agents,
  selectedId,
  activeId,
  onSelect,
  loading,
  activeFirst,
}: AgentBadgeRowProps) {
  const ordered =
    activeFirst && activeId
      ? [...agents].sort((a, b) => {
          if (a.id === activeId) return -1;
          if (b.id === activeId) return 1;
          return 0;
        })
      : agents;
  const badgeBase = (selected: boolean, active: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    padding: '14px 14px',
    border: selected || active ? '2px solid #C0392B' : '1px solid #0D0B08',
    background: selected || active ? 'rgba(192,57,43,0.06)' : '#FAF8F3',
    cursor: onSelect ? 'pointer' : 'default',
    textAlign: 'left',
    width: '100%',
    minHeight: 96,
    color: 'inherit',
  });

  const skeleton = (
    <>
      <style>{`
        .agent-badge-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 900px) {
          .agent-badge-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 520px) {
          .agent-badge-row { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="agent-badge-row" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              minHeight: 96,
              border: '1px solid #0D0B08',
              background: 'rgba(13,11,8,0.03)',
            }}
          />
        ))}
      </div>
    </>
  );

  if (loading && agents.length === 0) return skeleton;

  return (
    <>
      <style>{`
        .agent-badge-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 900px) {
          .agent-badge-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 520px) {
          .agent-badge-row { grid-template-columns: 1fr; }
        }
      `}</style>
      <div role="listbox" aria-label="Available agents" className="agent-badge-row">
        {ordered.map((agent) => {
          const selected = selectedId === agent.id;
          const active = activeId === agent.id;
          return (
            <button
              key={agent.id}
              type="button"
              role="option"
              aria-selected={selected || active}
              disabled={!onSelect}
              onClick={() => onSelect?.(agent)}
              style={badgeBase(selected, active)}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #0D0B08',
                  background: `${agent.color}18`,
                }}
              >
                <AgentIcon agentId={agent.id} size={18} color={agent.color} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...S.serif, fontSize: 15, fontWeight: 900, margin: 0, color: '#0D0B08' }}>
                  {agent.name}
                </p>
                <p style={{ ...S.mono, fontSize: 9, color: '#888', margin: '2px 0 0', letterSpacing: '0.08em' }}>
                  {agent.style}
                </p>
              </div>
            </div>
            {(() => {
              const pct = agent.returnPct ?? 0;
              const up = pct >= 0;
              const returnColor = up ? '#27AE60' : '#C0392B';
              return (
                <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: returnColor, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span aria-hidden>{up ? '▲' : '▼'}</span>
                    {up ? '+' : ''}{pct}%
                  </span>
                  <span>· {agent.openPositionCount ?? 0} open{agent.points != null ? ` · ${agent.points} pts` : ''}</span>
                </p>
              );
            })()}
              {active ? (
                <span style={{ ...S.mono, fontSize: 9, fontWeight: 700, color: '#C0392B', letterSpacing: '0.12em' }}>
                  ACTIVE
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
