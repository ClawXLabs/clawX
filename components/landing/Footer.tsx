import Link from 'next/link';

interface FooterProps { account: string | null; onConnect: () => void; }

const COL_LINKS = [
  {
    heading: 'Trade',
    links: [
      { href: '/markets',       label: 'All Markets' },
      { href: '/markets/trade', label: 'BTC/USD'     },
      { href: '/markets/trade', label: 'ETH/USD'     },
      { href: '/markets/trade', label: 'AVAX/USD'    },
    ],
  },
  {
    heading: 'Automate',
    links: [
      { href: '/agents',           label: 'Agent Lobby'  },
      { href: '/agents/dashboard', label: 'Dashboard'    },
      { href: '/agents/new',       label: 'Create Agent' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/profile',      label: 'Profile'      },
      { href: '/leaderboard',  label: 'Leaderboard'  },
      { href: '/faucet',       label: 'Get TUSDC'    },
    ],
  },
];

export default function Footer({ account, onConnect }: FooterProps) {
  return (
    <footer
      className="np-footer"
      style={{
        background: '#0D0B08',
        borderTop: '3px solid #0D0B08',
      }}
    >
      {/* ── Top CTA band ──────────────────────────── */}
      <div
        style={{
          borderBottom: '1px solid rgba(250,248,243,0.1)',
          padding: '52px 32px',
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 32,
        }}
      >
        {/* Left: headline */}
        <div style={{ maxWidth: 580 }}>
          <p
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              color: '#C0392B', marginBottom: 16,
            }}
          >
            ◆ READY TO BEGIN
          </p>
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(2rem, 4vw, 3.6rem)',
              fontWeight: 900, lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: '#FAF8F3', margin: 0,
            }}
          >
            Move Your Positions On-Chain.
          </h2>
          <p
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 14, lineHeight: 1.7,
              color: 'rgba(250,248,243,0.5)',
              marginTop: 16, maxWidth: 420,
            }}
          >
            Connect on Fuji testnet, claim 300 TUSDC from our faucet, and trade 5-minute prediction rounds — all gasless.
          </p>
        </div>

        {/* Right: buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
          <Link href="/markets" style={{ textDecoration: 'none' }}>
            <span
              className="np-footer-cta-primary"
              style={{
                display: 'block', textAlign: 'center',
                background: '#FAF8F3', color: '#0D0B08',
                padding: '14px 28px',
                fontFamily: '"Courier New", monospace',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.16em', textTransform: 'uppercase',
              }}
            >
              ENTER MARKETS →
            </span>
          </Link>
          <Link href="/agents" style={{ textDecoration: 'none' }}>
            <span
              className="np-footer-cta-secondary"
              style={{
                display: 'block', textAlign: 'center',
                background: 'transparent', color: 'rgba(250,248,243,0.5)',
                padding: '12px 28px',
                border: '1px solid rgba(250,248,243,0.12)',
                fontFamily: '"Courier New", monospace',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.16em', textTransform: 'uppercase',
              }}
            >
              DEPLOY AGENT
            </span>
          </Link>
        </div>
      </div>

      {/* ── Nav columns ───────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          borderBottom: '1px solid rgba(250,248,243,0.1)',
          gap: 0,
        }}
      >
        {/* Wordmark column */}
        <div
          style={{
            padding: '36px 32px',
            borderRight: '1px solid rgba(250,248,243,0.1)',
          }}
        >
          <span
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 28, fontWeight: 900,
              letterSpacing: '-0.04em', color: '#FAF8F3',
              display: 'block', marginBottom: 12,
            }}
          >
            CLAW<span style={{ color: '#C0392B' }}>X</span>
          </span>
          <p
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 9, lineHeight: 1.8,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(250,248,243,0.3)', margin: 0,
            }}
          >
            Avalanche Fuji<br />Prediction Protocol<br />v2.0.0
          </p>
        </div>

        {/* Link columns */}
        {COL_LINKS.map(col => (
          <div
            key={col.heading}
            style={{
              padding: '36px 24px',
              borderRight: '1px solid rgba(250,248,243,0.1)',
            }}
          >
            <p
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 8, fontWeight: 700,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'rgba(250,248,243,0.35)',
                marginBottom: 16,
              }}
            >
              {col.heading}
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map(l => (
                <Link key={l.label} href={l.href} style={{ textDecoration: 'none' }}>
                  <span
                    className="np-footer-link"
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: 14, color: 'rgba(250,248,243,0.55)',
                    }}
                  >
                    {l.label}
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* ── Legal bar ─────────────────────────────── */}
      <div
        style={{
          padding: '16px 32px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(250,248,243,0.2)',
          }}
        >
          © 2026 CLAWX · FUJI TESTNET ONLY · ALL ROUNDS SIMULATED
        </span>
        <span
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#27AE60',
          }}
        >
          ● ORACLE LIVE
        </span>
      </div>
    </footer>
  );
}
