import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import CrabLogo from '../svgs/CrabLogo';
import CrabLogoOutline from '../svgs/CrabLogoOutline';

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
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <nav
        style={{
          position: isMobile ? 'fixed' : 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: scrolled
            ? 'rgba(250, 248, 243, 0.82)'
            : 'rgba(250, 248, 243, 0.95)',
          backdropFilter: scrolled ? 'blur(16px) saturate(1.4)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(1.4)' : 'none',
          borderBottom: scrolled
            ? '1px solid rgba(13, 11, 8, 0.1)'
            : '1px solid transparent',
          transition: 'background 0.35s ease, border-bottom 0.35s ease, backdrop-filter 0.35s ease',
        }}
      >
        {/* ── Left: Logo + Menu Button (Mobile) OR Logo + Wordmark (Desktop) ── */}
        {isMobile ? (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: '2px solid #0D0B08',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.25s ease',
              outline: 'none',
            }}
          >
            {mobileMenuOpen ? (
              <CrabLogoOutline
                width={20}
                height={21}
                style={{
                  display: 'block',
                  transform: 'scaleY(-1)',
                  transition: 'transform 0.25s ease',
                }}
              />
            ) : (
              <CrabLogo
                width={20}
                height={21}
                style={{
                  display: 'block',
                  transform: 'none',
                  transition: 'transform 0.25s ease',
                }}
              />
            )}
          </button>
        ) : (
          <a
            href="https://clawxlab.xyz"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
            }}
          >
            <CrabLogo
              width={32}
              height={33}
              style={{ display: 'block' }}
            />
            <span
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: '#0D0B08',
                lineHeight: 1,
              }}
            >
              CLAW<span style={{ color: '#C0392B' }}>X</span>
            </span>
          </a>
        )}

        {/* ── Center: Nav links (Desktop only) ── */}
        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
            }}
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = router.pathname === href || router.pathname.startsWith(href + '/');
              const isHovered = hoveredLink === href;
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <span
                    onMouseEnter={() => setHoveredLink(href)}
                    onMouseLeave={() => setHoveredLink(null)}
                    style={{
                      display: 'inline-block',
                      padding: '8px 18px',
                      fontFamily: '"Courier New", monospace',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: isActive ? '#C0392B' : (isHovered ? '#0D0B08' : '#666'),
                      position: 'relative',
                      transition: 'color 0.2s ease',
                    }}
                  >
                    {label}
                    {/* Active / hover underline */}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: isActive ? '60%' : (isHovered ? '40%' : '0%'),
                        height: 1.5,
                        background: isActive ? '#C0392B' : '#0D0B08',
                        borderRadius: 1,
                        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── Right: Connect wallet button (Always visible) ── */}
        <button
          onClick={onConnect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: account ? 'transparent' : '#0D0B08',
            color: account ? '#0D0B08' : '#FAF8F3',
            border: account ? '1.5px solid rgba(13, 11, 8, 0.2)' : '1.5px solid #0D0B08',
            borderRadius: 24,
            padding: account ? '6px 14px' : '8px 20px',
            fontFamily: '"Courier New", monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!account) {
              e.currentTarget.style.background = '#C0392B';
              e.currentTarget.style.borderColor = '#C0392B';
            } else {
              e.currentTarget.style.borderColor = 'rgba(13, 11, 8, 0.45)';
            }
          }}
          onMouseLeave={(e) => {
            if (!account) {
              e.currentTarget.style.background = '#0D0B08';
              e.currentTarget.style.borderColor = '#0D0B08';
            } else {
              e.currentTarget.style.borderColor = 'rgba(13, 11, 8, 0.2)';
            }
          }}
        >
          {/* Dot indicator when connected */}
          {account && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#27AE60',
                flexShrink: 0,
              }}
            />
          )}
          {account
            ? `${account.slice(0, 6)}…${account.slice(-4)}`
            : 'Connect Wallet'}
        </button>
      </nav>

      {/* ── Mobile menu dropdown ── */}
      {isMobile && mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: 56,
            left: 0,
            right: 0,
            background: 'rgba(250, 248, 243, 0.97)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '2px solid #0D0B08',
            zIndex: 199,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 24px',
            gap: 12,
            animation: 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideDown {
              from { transform: translateY(-10px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}} />
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = router.pathname === href || router.pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                <span
                  style={{
                    display: 'block',
                    padding: '12px 0',
                    fontFamily: '"Courier New", monospace',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: isActive ? '#C0392B' : '#0D0B08',
                    borderBottom: '1px solid rgba(13, 11, 8, 0.08)',
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
