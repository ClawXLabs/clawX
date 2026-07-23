import Link from 'next/link';
import type { PendingSettlement } from '../../hooks/useAgentStatus';
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

function formatWait(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

interface PendingSettlementsPanelProps {
  items: PendingSettlement[];
}

export default function PendingSettlementsPanel({ items }: PendingSettlementsPanelProps) {
  if (!items.length) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
        No trades awaiting settlement.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <li
          key={`${item.roundId}-${item.side}`}
          style={{
            border: '1px solid #F69D3944', background: 'rgba(246,157,57,0.06)',
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: '#0D0B08' }}>
              {(() => {
                const href = marketTradePath({
                  assetId: item.assetId,
                  symbol: item.symbol,
                  roundId: item.roundId,
                });
                const label = `${item.symbol} · ${item.side} · R#${item.roundId}`;
                return href ? (
                  <Link href={href} style={{ color: '#0D0B08', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {label} ↗
                  </Link>
                ) : (
                  label
                );
              })()}
            </span>
            <span style={{ ...S.mono, fontSize: 9, fontWeight: 700, color: '#F69D39', letterSpacing: '0.1em' }}>
              SETTLEMENT PENDING
            </span>
          </div>
          <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', margin: '6px 0 0' }}>
            {item.amountTusdc} TUSDC staked · waiting {formatWait(item.waitingSec)}
          </p>
          <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '4px 0 0' }}>
            Round will resolve automatically when the 5-minute window ends.
          </p>
          {item.hash ? (
            <a href={`${SNOWTRACE}${item.hash}`} target="_blank" rel="noopener noreferrer" style={{ ...S.mono, fontSize: 10, color: '#F69D39', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>
              View buy tx ↗
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
