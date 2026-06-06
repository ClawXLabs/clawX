import Link from 'next/link';

const MARKETS = [
  {
    pair: 'BTC/USD',
    name: 'Bitcoin',
    price: '$67,420.50',
    chg: '+0.31%',
    bull: true,
    bullPct: 64,
    bearPct: 36,
    round: '5 MIN',
  },
  {
    pair: 'ETH/USD',
    name: 'Ethereum',
    price: '$3,482.20',
    chg: '−0.15%',
    bull: false,
    bullPct: 42,
    bearPct: 58,
    round: '5 MIN',
  },
  {
    pair: 'AVAX/USD',
    name: 'Avalanche',
    price: '$34.65',
    chg: '+0.88%',
    bull: true,
    bullPct: 72,
    bearPct: 28,
    round: '5 MIN',
  },
];

export default function MarketsPreview() {
  return (
    <section
      id="markets"
      className="np-markets-section"
      style={{
        background: '#FAF8F3',
        borderBottom: '3px solid #0D0B08',
      }}
    >
      {/* Section header */}
      <div
        style={{
          borderBottom: '1px solid #0D0B08',
          padding: '10px 32px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 0, width: 40, height: 1, background: '#0D0B08' }} />
          <span
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: '#0D0B08',
            }}
          >
            LIVE MARKETS
          </span>
        </div>
        <Link href="/markets" style={{ textDecoration: 'none' }}>
          <span
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#C0392B',
            }}
          >
            VIEW ALL →
          </span>
        </Link>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr',
          borderBottom: '1px solid #0D0B08',
          padding: '8px 32px',
          gap: 16,
        }}
      >
        {['PAIR', 'PRICE', 'CHANGE', 'POOL SENTIMENT', 'ROUND'].map(col => (
          <span
            key={col}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 8, fontWeight: 700,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#888',
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Market rows */}
      {MARKETS.map((m, i) => (
        <Link key={m.pair} href="/markets" style={{ textDecoration: 'none', display: 'block' }}>
          <div
            className="np-market-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr',
              padding: '20px 32px',
              gap: 16,
              borderBottom: i < MARKETS.length - 1 ? '1px solid rgba(13,11,8,0.12)' : 'none',
              alignItems: 'center',
            }}
          >
            {/* Pair */}
            <div>
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 17, fontWeight: 900, color: '#0D0B08', letterSpacing: '-0.01em' }}>
                {m.pair}
              </div>
              <div style={{ fontFamily: '"Courier New", monospace', fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                {m.name}
              </div>
            </div>

            {/* Price */}
            <div style={{ fontFamily: '"Courier New", monospace', fontSize: 13, fontWeight: 700, color: '#0D0B08' }}>
              {m.price}
            </div>

            {/* Change */}
            <div
              style={{
                display: 'inline-flex',
                background: m.bull ? '#27AE60' : '#C0392B',
                color: '#fff',
                padding: '3px 10px',
                fontFamily: '"Courier New", monospace',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em',
              }}
            >
              {m.chg}
            </div>

            {/* Pool bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700, color: '#27AE60' }}>BULL {m.bullPct}%</span>
                <span style={{ fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700, color: '#C0392B' }}>BEAR {m.bearPct}%</span>
              </div>
              <div style={{ height: 4, background: '#E8E5DF', display: 'flex' }}>
                <div style={{ width: `${m.bullPct}%`, background: '#27AE60' }} />
                <div style={{ width: `${m.bearPct}%`, background: '#C0392B' }} />
              </div>
            </div>

            {/* Round */}
            <div style={{ fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#888' }}>
              {m.round}
            </div>
          </div>
        </Link>
      ))}

      {/* Footer row */}
      <div style={{ borderTop: '1px solid #0D0B08', padding: '12px 32px', display: 'flex', justifyContent: 'center' }}>
        <Link href="/markets" style={{ textDecoration: 'none' }}>
          <span
            style={{
              display: 'inline-block',
              background: '#0D0B08', color: '#FAF8F3',
              padding: '10px 32px',
              fontFamily: '"Courier New", monospace',
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
            }}
          >
            OPEN TRADING TERMINAL →
          </span>
        </Link>
      </div>
    </section>
  );
}
