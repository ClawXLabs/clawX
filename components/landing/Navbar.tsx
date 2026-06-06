import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NavbarProps { account: string | null; onConnect: () => void; }

const NAV_LINKS = [
  { href: '/markets', label: 'Markets' },
  { href: '/agents', label: 'Agents' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/faucet', label: 'Faucet' },
  { href: '/profile', label: 'Profile' },
];

export default function Navbar({ account, onConnect }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <>
      {/* ── Masthead top bar ── */}
      <div
        className="np-masthead-bar"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
          borderBottom: '3px solid #0D0B08',
          background: '#FAF8F3',
          display: 'flex', alignItems: 'stretch',
        }}
      >
        {/* Date / edition */}
        <div
          className="np-edition"
          style={{
            padding: '0 16px',
            borderRight: '1px solid #0D0B08',
            display: 'flex', alignItems: 'center',
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: 9, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: '#0D0B08', whiteSpace: 'nowrap',
          }}
        >
          FUJI TESTNET · v2.0
        </div>

        {/* Wordmark */}
        <div
          className="np-wordmark"
          style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '8px 16px',
          }}
        >
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 26, fontWeight: 900,
                letterSpacing: '-0.04em', color: '#0D0B08',
                lineHeight: 1,
              }}
            >
              CLAW<span style={{ color: '#C0392B' }}>X</span>
            </span>
          </Link>
        </div>

        {/* Right: connect */}
        <div
          style={{
            borderLeft: '1px solid #0D0B08',
            display: 'flex', alignItems: 'center', padding: '0 12px',
          }}
        >
          <button
            onClick={onConnect}
            className="np-connect-btn"
            style={{
              background: '#0D0B08', color: '#FAF8F3',
              border: 'none',
              padding: '7px 16px',
              fontFamily: '"Courier New", monospace',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'CONNECT'}
          </button>
        </div>
      </div>

      {/* ── Nav rule ── */}
      <div
        className="np-nav-row"
        style={{
          position: 'fixed', top: 49, left: 0, right: 0, zIndex: 199,
          background: '#FAF8F3',
          borderBottom: '1px solid #0D0B08',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {NAV_LINKS.map(({ href, label }, i) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <span
              className="np-nav-link"
              style={{
                display: 'inline-block',
                padding: '7px 20px',
                fontFamily: '"Courier New", monospace',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: '#0D0B08',
                borderRight: i < NAV_LINKS.length - 1 ? '1px solid rgba(13,11,8,0.2)' : 'none',
              }}
            >
              {label}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
