import Link from 'next/link';
import { useState } from 'react';
import AgentIcon from './AgentIcon';

export interface AgentData {
  id: string;
  name: string;
  emoji: string;
  color: string;
  handle: string;
  style: string;
  returnPct: number;
  aum: number;
  points: number;
  openPositionCount: number;
  openPositions?: Array<{ roundId: string; side: string; roundNumber: number; symbol: string }>;
}

interface AgentCardProps {
  agent: AgentData;
  rank?: number;
  href?: string;
  onSelect?: (agent: AgentData) => void;
  selected?: boolean;
}

/* ─── Shared newspaper styles ───────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

/* ─── Main Card ─────────────────────────────────────────────────── */

export default function AgentCard({ agent, rank, href, onSelect, selected }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const returnPct = agent.returnPct ?? 0;
  const up = returnPct >= 0;
  const aum = agent.aum ?? 0;
  const points = agent.points ?? 0;
  const openPositionCount = agent.openPositionCount ?? 0;

  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', flex: 1 }}>
      <div>
        {/* Rank badge */}
        {rank != null && (
          <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#888', marginBottom: 10 }}>
            #{rank} ranked
          </p>
        )}

        {/* Icon + Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #0D0B08',
            background: `${agent.color}15`,
          }}>
            <AgentIcon agentId={agent.id} size={20} color={agent.color} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </p>
            <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: 0 }}>
              {agent.handle}
            </p>
          </div>
        </div>

        {/* Style tag */}
        <p style={{ ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#aaa', marginBottom: 10 }}>
          {agent.style}
        </p>

        {/* Return badge */}
        <span style={{
          ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          padding: '5px 10px',
          background: up ? '#27AE60' : '#C0392B',
          color: '#FAF8F3',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {up ? '▲' : '▼'} {up ? '+' : ''}{returnPct}%
        </span>

        {/* Position chips */}
        <PositionChips agent={agent} />
      </div>

      <div>
        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
          marginTop: 16, borderTop: '1px solid #0D0B08',
        }}>
          {([
            { label: 'AUM', value: `$${aum.toLocaleString()}` },
            { label: 'Points', value: String(points), color: '#F69D39' },
            { label: 'Live', value: String(openPositionCount), sub: openPositionCount === 1 ? 'position' : 'positions' },
          ] as const).map((stat, i) => (
            <div key={stat.label} style={{
              padding: '12px 10px',
              borderRight: i < 2 ? '1px solid rgba(13,11,8,0.15)' : 'none',
            }}>
              <p style={S.label}>{stat.label}</p>
              <p style={{
                ...S.serif, fontSize: 18, fontWeight: 900, margin: '4px 0 0',
                color: (stat as any).color || '#0D0B08',
              }}>{stat.value}</p>
              {'sub' in stat && stat.sub && (
                <p style={{ ...S.mono, fontSize: 8, color: '#aaa', marginTop: 2 }}>{stat.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <p style={{
          marginTop: 14, ...S.mono, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: hovered ? '#C0392B' : '#888',
          transition: 'color 0.2s ease',
          marginBottom: 0,
        }}>
          {href ? 'View profile →' : selected ? 'Selected ✓' : 'Select agent →'}
        </p>
      </div>
    </div>
  );

  const cardStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: '260px', padding: '20px 18px',
    textAlign: 'left', cursor: 'pointer',
    border: selected ? '2px solid #C0392B' : '1px solid #0D0B08',
    background: selected
      ? 'rgba(192,57,43,0.06)'
      : hovered ? 'rgba(13,11,8,0.03)' : 'transparent',
    transition: 'all 0.2s ease',
    textDecoration: 'none', color: 'inherit',
    boxSizing: 'border-box',
  };

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%' }}>
        <div
          style={cardStyle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {inner}
        </div>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(agent)}
      style={{ ...cardStyle, fontFamily: 'inherit', display: 'flex' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {inner}
    </button>
  );
}




/* ─── Position Chips ────────────────────────────────────────────── */

function PositionChips({ agent }: { agent: AgentData }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {agent.openPositions?.slice(0, 2).map((pos) => (
        <span
          key={`${pos.roundId}-${pos.side}`}
          style={{
            border: '1px solid rgba(13,11,8,0.2)', padding: '3px 10px',
            ...S.mono, fontSize: 9, fontWeight: 700, color: '#5A554E',
          }}
        >
          {pos.symbol} {pos.side} · R#{pos.roundNumber}
        </span>
      ))}
      {agent.openPositionCount > 2 && (
        <span style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '3px 10px', ...S.mono, fontSize: 9, color: '#888' }}>
          +{agent.openPositionCount - 2} live
        </span>
      )}
      {agent.openPositionCount === 0 && (
        <span style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '3px 10px', ...S.mono, fontSize: 9, color: '#888' }}>
          Scanning next round…
        </span>
      )}
    </div>
  );
}
