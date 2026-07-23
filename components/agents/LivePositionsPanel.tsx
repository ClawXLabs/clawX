import Link from 'next/link';
import type { AgentStatusData } from '../../hooks/useAgentStatus';
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

type OpenPosition = NonNullable<AgentStatusData['openPositions']>[number];

function shortHash(hash?: string | null) {
  if (!hash) return null;
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatEndsIn(endTime?: number) {
  if (!endTime || !Number.isFinite(endTime)) return null;
  const left = Math.max(0, endTime - Math.floor(Date.now() / 1000));
  if (left < 60) return `${left}s`;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}m ${s}s`;
}

interface LivePositionsPanelProps {
  positions: OpenPosition[];
}

export default function LivePositionsPanel({ positions }: LivePositionsPanelProps) {
  if (!positions.length) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
        No open positions — scanning next 5m round.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {positions.map((pos) => {
        const href = marketTradePath({
          assetId: pos.assetId,
          symbol: pos.symbol,
          roundId: pos.roundId,
        });
        const hashShort = shortHash(pos.hash);
        const endsIn = formatEndsIn(pos.endTime);
        return (
          <li
            key={String(pos.roundId)}
            style={{
              border: '1px solid rgba(13,11,8,0.2)',
              padding: '14px 16px',
              background: '#FAF8F3',
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
                      {pos.symbol} ↗
                    </Link>
                  ) : (
                    pos.symbol
                  )}{' '}
                  <span style={{ color: pos.side === 'UP' ? '#27AE60' : RED }}>{pos.side}</span>
                </p>
                <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  Round #{pos.roundNumber}
                  {pos.roundId != null ? ` · id ${pos.roundId}` : ''}
                  {endsIn ? ` · ends in ${endsIn}` : ''}
                </p>
              </div>
              <span
                style={{
                  ...S.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '4px 10px',
                  background: pos.side === 'UP' ? '#27AE60' : RED,
                  color: '#FAF8F3',
                  flexShrink: 0,
                }}
              >
                LIVE
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
              {pos.amountTusdc != null ? (
                <div>
                  <p style={S.label}>Stake</p>
                  <p style={{ ...S.mono, fontSize: 12, color: '#0D0B08', margin: '2px 0 0' }}>
                    {pos.amountTusdc} TUSDC
                  </p>
                </div>
              ) : null}
              {pos.shares != null ? (
                <div>
                  <p style={S.label}>Shares</p>
                  <p style={{ ...S.mono, fontSize: 12, color: '#0D0B08', margin: '2px 0 0' }}>
                    {pos.shares}
                  </p>
                </div>
              ) : null}
              <div>
                <p style={S.label}>Buy tx</p>
                {pos.hash && hashShort ? (
                  <p style={{ ...S.mono, fontSize: 12, margin: '2px 0 0' }}>
                    <a
                      href={`${SNOWTRACE}${pos.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: RED, textDecoration: 'none', fontWeight: 700 }}
                      title={pos.hash}
                    >
                      {hashShort} ↗
                    </a>
                  </p>
                ) : (
                  <p style={{ ...S.mono, fontSize: 12, color: '#888', margin: '2px 0 0' }}>Not available</p>
                )}
              </div>
            </div>

            {pos.hash ? (
              <p
                style={{
                  ...S.mono,
                  fontSize: 10,
                  color: '#5A554E',
                  margin: '10px 0 0',
                  wordBreak: 'break-all',
                }}
              >
                {pos.hash}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
