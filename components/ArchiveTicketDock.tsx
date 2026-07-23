import { useState } from 'react';
import { ChevronLeft, Archive } from 'lucide-react';
import { MarketInfo } from '../contexts/MarketDataContext';

const NP = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  bg: '#FAF8F3',
  ink: '#0D0B08',
  green: '#1E5E3A',
  red: '#8A1C14',
  border: '1px solid #0D0B08',
};

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

interface ArchiveTicketDockProps {
  market: MarketInfo;
  onClaimWinnings: (assetId: number) => Promise<void>;
  onReturnToLive: () => void;
  /** Full-width in-flow layout for mobile trade stack */
  stacked?: boolean;
}

/** Collapsed right-edge dock for archive rounds — expands to claim / return. */
export default function ArchiveTicketDock({
  market,
  onClaimWinnings,
  onReturnToLive,
  stacked = false,
}: ArchiveTicketDockProps) {
  const [expanded, setExpanded] = useState(stacked);
  const wentUp = market.currentPrice >= market.startPrice;
  const showBody = stacked || expanded;

  return (
    <div
      style={
        stacked
          ? {
              position: 'relative',
              width: '100%',
              maxWidth: '100%',
              border: 'none',
              background: 'transparent',
              overflow: 'hidden',
            }
          : {
              position: 'absolute',
              top: '50%',
              right: 12,
              transform: 'translateY(-50%)',
              zIndex: 20,
              width: expanded ? 280 : 44,
              maxWidth: 'min(280px, 40vw)',
              border: NP.border,
              background: 'rgba(250,248,243,0.96)',
              transition: 'width 0.18s ease',
              overflow: 'hidden',
            }
      }
    >
      {!stacked ? (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse archive panel' : 'Expand archive panel'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          gap: 8,
          padding: expanded ? '10px 12px' : '14px 0',
          background: expanded ? 'rgba(13,11,8,0.04)' : 'transparent',
          border: 'none',
          borderBottom: expanded ? '1px solid rgba(13,11,8,0.12)' : 'none',
          cursor: 'pointer',
          color: NP.ink,
        }}
      >
        {expanded ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Archive size={15} strokeWidth={2.5} />
              <span style={{ ...NP.serif, fontSize: 14, fontWeight: 900 }}>Archive</span>
              <span style={{ ...NP.mono, fontSize: 9, fontWeight: 700, color: '#5A554E' }}>
                #{market.roundNumber}
              </span>
            </span>
            <ChevronLeft
              size={16}
              strokeWidth={2.5}
              style={{ transform: 'rotate(180deg)' }}
            />
          </>
        ) : (
          <Archive size={18} strokeWidth={2.5} />
        )}
      </button>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            borderBottom: '1px solid rgba(13,11,8,0.12)',
            background: 'rgba(13,11,8,0.04)',
          }}
        >
          <Archive size={15} strokeWidth={2.5} />
          <span style={{ ...NP.serif, fontSize: 14, fontWeight: 900 }}>Archive</span>
          <span style={{ ...NP.mono, fontSize: 9, fontWeight: 700, color: '#5A554E' }}>
            #{market.roundNumber}
          </span>
        </div>
      )}

      {showBody && (
        <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              ...NP.mono,
              fontSize: 11,
              fontWeight: 900,
              padding: '9px 10px',
              border: NP.border,
              background: wentUp ? 'rgba(30,94,58,0.08)' : 'rgba(138,28,20,0.08)',
              color: wentUp ? NP.green : NP.red,
            }}
          >
            {wentUp ? '▲ UP' : '▼ DOWN'} · {fmtUsd(market.startPrice)} → {fmtUsd(market.currentPrice)}
          </div>
          <button
            type="button"
            onClick={() => onClaimWinnings(market.assetId)}
            style={{
              width: '100%',
              padding: '12px 0',
              background: '#1D4ED8',
              color: '#FAF8F3',
              border: NP.border,
              ...NP.mono,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            CLAIM WINNINGS →
          </button>
          <button
            type="button"
            onClick={onReturnToLive}
            style={{
              width: '100%',
              padding: '11px 0',
              background: 'transparent',
              color: NP.ink,
              border: NP.border,
              ...NP.mono,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            ← LIVE MARKET
          </button>
        </div>
      )}
    </div>
  );
}
