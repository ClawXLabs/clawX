import Link from 'next/link';
import type { MatchRow } from '../../hooks/useAgentStatus';
import { marketTradePath } from '../../utils/marketLink';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

interface MatchHistoryPanelProps {
  open: boolean;
  filter: 'win' | 'loss' | 'all';
  matches: MatchRow[];
  onClose: () => void;
}

export default function MatchHistoryPanel({ open, filter, matches, onClose }: MatchHistoryPanelProps) {
  if (!open) return null;

  const filtered = filter === 'all'
    ? matches
    : matches.filter((m) => m.outcome === filter);

  const title = filter === 'win' ? 'Win History' : filter === 'loss' ? 'Loss History' : 'Match History';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(13,11,8,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#FAF8F3', border: '2px solid #0D0B08', maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #0D0B08', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ ...S.serif, fontSize: 20, fontWeight: 900, margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', ...S.mono, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
          {filtered.length === 0 ? (
            <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>No settled matches yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((m) => (
                <li key={`${m.roundId}-${m.side}-${m.at}`} style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: '#0D0B08' }}>
                      {(() => {
                        const href = marketTradePath({
                          assetId: m.assetId,
                          symbol: m.symbol,
                          roundId: m.roundId,
                        });
                        const label = `${m.symbol} · ${m.side} · R#${m.roundId}`;
                        return href ? (
                          <Link href={href} style={{ color: '#0D0B08', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                            {label} ↗
                          </Link>
                        ) : (
                          label
                        );
                      })()}
                    </span>
                    <span style={{
                      ...S.mono, fontSize: 9, fontWeight: 700,
                      color: m.outcome === 'win' ? '#27AE60' : '#C0392B',
                    }}>
                      {m.outcome === 'win' ? 'WIN' : 'LOSS'}
                    </span>
                  </div>
                  <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', margin: '6px 0 0' }}>
                    Stake: {m.amountTusdc} TUSDC
                    {m.pnlTusdc != null ? ` · P&L: ${m.pnlTusdc >= 0 ? '+' : ''}${m.pnlTusdc} TUSDC` : ''}
                  </p>
                  {m.hash ? (
                    <a href={`${SNOWTRACE}${m.hash}`} target="_blank" rel="noopener noreferrer" style={{ ...S.mono, fontSize: 10, color: '#F69D39', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>
                      Tx ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
