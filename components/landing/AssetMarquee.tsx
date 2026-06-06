/* ─── AssetMarquee ─────────────────────────────────────────────
   Scrolling ticker band. Animation added later via GSAP.
   CSS lives in globals.css (.np-marquee-track).
───────────────────────────────────────────────────────────────── */
const ASSETS = [
  { sym: 'BTC/USD', price: '$67,420',  chg: '+0.31%', bull: true  },
  { sym: 'ETH/USD', price: '$3,482',   chg: '−0.15%', bull: false },
  { sym: 'AVAX/USD',price: '$34.65',   chg: '+0.88%', bull: true  },
  { sym: 'BNB/USD', price: '$612.40',  chg: '+0.22%', bull: true  },
  { sym: 'SOL/USD', price: '$172.90',  chg: '−0.44%', bull: false },
];

/* Triplicate for seamless CSS loop */
const ITEMS = [...ASSETS, ...ASSETS, ...ASSETS];

export default function AssetMarquee() {
  return (
    <div
      className="np-marquee-section"
      style={{
        background: '#0D0B08',
        borderTop: '2px solid #0D0B08',
        borderBottom: '2px solid #0D0B08',
        overflow: 'hidden',
        padding: '10px 0',
      }}
    >
      <div className="np-marquee-track" style={{ display: 'flex', width: 'max-content', gap: 0 }}>
        {ITEMS.map((a, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '0 32px',
              borderRight: '1px solid rgba(250,248,243,0.12)',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#FAF8F3',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'rgba(250,248,243,0.45)' }}>{a.sym}</span>
            <span>{a.price}</span>
            <span style={{ color: a.bull ? '#27AE60' : '#C0392B' }}>{a.chg}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
