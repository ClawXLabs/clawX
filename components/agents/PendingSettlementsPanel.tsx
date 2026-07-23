import Link from 'next/link';
import type { PendingSettlement } from '../../hooks/useAgentStatus';
import { marketTradePath } from '../../utils/marketLink';

const SNOWTRACE = 'https://testnet.snowtrace.io/tx/';
const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#888',
  } as React.CSSProperties,
};

function formatWait(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function shortHash(hash?: string) {
  if (!hash) return null;
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
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
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => {
        const href = marketTradePath({
          assetId: item.assetId,
          symbol: item.symbol,
          roundId: item.roundId,
        });
        const hashShort = shortHash(item.hash);
        return (
          <li
            key={`${item.roundId}-${item.side}`}
            style={{
              border: '1px solid #F69D3944',
              background: 'rgba(246,157,57,0.06)',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                  {href ? (
                    <Link
                      href={href}
                      style={{ color: '#0D0B08', textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {item.symbol} ↗
                    </Link>
                  ) : (
                    item.symbol
                  )}{' '}
                  <span style={{ color: item.side === 'UP' ? '#27AE60' : RED }}>{item.side}</span>
                </p>
                <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  Round #{item.roundId} · waiting {formatWait(item.waitingSec)}
                </p>
              </div>
              <span
                style={{
                  ...S.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#F69D39',
                  padding: '4px 10px',
                  border: '1px solid #F69D3955',
                  flexShrink: 0,
                }}
              >
                SETTLEMENT PENDING
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                marginTop: 12,
              }}
            >
              <div>
                <p style={S.label}>Stake</p>
                <p style={{ ...S.mono, fontSize: 12, color: '#0D0B08', margin: '2px 0 0' }}>
                  {item.amountTusdc} TUSDC
                </p>
              </div>
              <div>
                <p style={S.label}>Buy tx</p>
                {item.hash && hashShort ? (
                  <p style={{ ...S.mono, fontSize: 12, margin: '2px 0 0' }}>
                    <a
                      href={`${SNOWTRACE}${item.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#F69D39', textDecoration: 'none', fontWeight: 700 }}
                      title={item.hash}
                    >
                      {hashShort} ↗
                    </a>
                  </p>
                ) : (
                  <p style={{ ...S.mono, fontSize: 12, color: '#888', margin: '2px 0 0' }}>Not available</p>
                )}
              </div>
            </div>

            <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '10px 0 0' }}>
              Round resolves automatically when the 5-minute window ends.
            </p>
            {item.hash ? (
              <p
                style={{
                  ...S.mono,
                  fontSize: 10,
                  color: '#5A554E',
                  margin: '6px 0 0',
                  wordBreak: 'break-all',
                }}
              >
                {item.hash}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
