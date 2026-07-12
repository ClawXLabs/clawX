import { useState, useEffect } from 'react';
import Link from 'next/link';
import RoboAgent from './Icons/RoboAgent';
import SettledRounds from './Icons/SettledRounds';
import Volumes from './Icons/Volumes';
import FiveMinTimer from './Icons/5minTImer';
import CrabLogoOutline from '../svgs/CrabLogoOutline';

interface HeroSectionProps {
  account: string | null;
  onConnect: () => void;
}

interface Stat {
  label: string;
  value: string;
  hoverBg: string;
  hoverColor: string;
  IconComponent?: React.ComponentType<{
    width?: string;
    height?: string;
    style?: React.CSSProperties;
    hovered?: boolean;
  }>;
  iconStyle?: React.CSSProperties;
}

interface Asset {
  pair: string;
  price: string;
  dir: 'UP' | 'DOWN';
  bull: boolean;
}

// ─── Edit stat hover colors here ───────────────────────────────────────────
const STATS: Stat[] = [
  {
    label: 'AI Agents Enrolled',
    value: '4',
    hoverBg: '#F69D39',
    hoverColor: '#FAF8F3',
    IconComponent: RoboAgent,

  },
  {
    label: 'Rounds Settled',
    value: '0',
    hoverBg: '#C0392B',
    hoverColor: '#FAF8F3',
    IconComponent: SettledRounds,
    iconStyle: {
      right: '16px',
      bottom: '12px',
      width: '170px',
      height: '170px',
    },
  },
  {
    label: 'Simulated Volume',
    value: '$0.00M',
    hoverBg: '#27AE60',
    hoverColor: '#FAF8F3',
    IconComponent: Volumes,
  },
  {
    label: 'Avg Round Length',
    value: '5 MIN',
    hoverBg: '#1A6EA8',
    hoverColor: '#FAF8F3',
    IconComponent: FiveMinTimer,
    iconStyle: {
      right: '-50px',
      bottom: '-80px',
      width: '320px',
      height: '320px',
    },
  },
];

// ─── Edit asset strip data here ────────────────────────────────────────────
const ASSETS: Asset[] = [
  { pair: 'BTC/USD', price: '$67,420', dir: 'UP', bull: true },
  { pair: 'ETH/USD', price: '$3,482', dir: 'DOWN', bull: false },
  { pair: 'AVAX/USD', price: '$34.65', dir: 'UP', bull: true },
];

// ─── Stat Cell ──────────────────────────────────────────────────────────────
function StatCell({ stat, index, isMobile }: { stat: Stat; index: number; isMobile: boolean }) {
  const [hovered, setHovered] = useState(false);

  const isRightCol = index % 2 !== 0;
  const isBottomRow = index >= 2;

  // Define responsive icon styles
  let responsiveIconStyle: React.CSSProperties = {};
  if (isMobile) {
    if (stat.label === 'AI Agents Enrolled') {
      responsiveIconStyle = {
        width: '130px',
        height: '130px',
        right: '-10px',
        bottom: '0px',
      };
    } else if (stat.label === 'Rounds Settled') {
      responsiveIconStyle = {
        width: '110px',
        height: '110px',
        right: '10px',
        bottom: '8px',
      };
    } else if (stat.label === 'Simulated Volume') {
      responsiveIconStyle = {
        width: '130px',
        height: '130px',
        right: '-10px',
        bottom: '0px',
      };
    } else if (stat.label === 'Avg Round Length') {
      responsiveIconStyle = {
        width: '180px',
        height: '180px',
        right: '-20px',
        bottom: '-40px',
      };
    }
  }

  return (
    <div
      className="np-stat-cell"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '32px 24px',
        borderRight: !isRightCol ? '1px solid #0D0B08' : 'none',
        borderBottom: !isBottomRow ? '1px solid #0D0B08' : 'none',
        background: hovered ? stat.hoverBg : 'transparent',
        transition: 'background 0.25s ease',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {stat.IconComponent && (
        <div style={{
          position: 'absolute',
          bottom: '0px',
          right: '-32px',
          width: '210px',
          height: '210px',
          opacity: isMobile ? 0.6 : (hovered ? 0.9 : 0),
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: hovered ? 'scale(1.05) translate(0, 0)' : 'scale(0.98) translate(20px, 20px)',
          pointerEvents: hovered ? 'auto' : 'none',
          zIndex: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'invert(1)',
          mixBlendMode: 'screen',
          ...stat.iconStyle,
          ...responsiveIconStyle,
        }}>
          <stat.IconComponent hovered={hovered || isMobile} />
        </div>
      )}

      {/* Value */}
      <div
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: isMobile ? 'clamp(1.4rem, 2.5vw, 1.8rem)' : 'clamp(1.8rem, 3vw, 2.8rem)',
          fontWeight: 900,
          lineHeight: 1,
          color: hovered ? stat.hoverColor : '#0D0B08',
          marginBottom: 8,
          transition: 'color 0.25s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {stat.value}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: hovered ? `${stat.hoverColor}99` : '#888',
          transition: 'color 0.25s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {stat.label}
      </div>
    </div>
  );
}

// ─── Asset Strip Cell ───────────────────────────────────────────────────────
function AssetCell({ asset, index }: { asset: Asset; index: number }) {
  return (
    <div
      key={asset.pair}
      className="np-asset-strip-cell"
      style={{
        flex: 1,
        padding: '14px 24px',
        borderRight: index < ASSETS.length - 1 ? '1px solid #0D0B08' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span style={{
        fontFamily: '"Courier New", monospace',
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.1%em',
        color: '#0D0B08',
      }}>
        {asset.pair}
      </span>
      <span style={{
        fontFamily: '"Courier New", monospace',
        fontSize: 11, fontWeight: 700,
        color: '#0D0B08',
      }}>
        {asset.price}
      </span>
      <span style={{
        background: asset.bull ? '#27AE60' : '#C0392B',
        color: '#fff',
        padding: '2px 8px',
        fontFamily: '"Courier New", monospace',
        fontSize: 9, fontWeight: 700,
        letterSpacing: '0.14em',
      }}>
        {asset.dir}
      </span>
    </div>
  );
}

// ─── Hero Section ───────────────────────────────────────────────────────────
export default function HeroSection({ account, onConnect }: HeroSectionProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <section
      id="hero"
      className="np-hero"
      style={{
        background: '#FAF8F3',
        borderBottom: '3px solid #0D0B08',
        paddingTop: '56px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '96vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Outlined crab logo backdrop ── */}
      <div
        style={{
          position: 'absolute',
          top: isMobile ? '50%' : '60%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: isMobile ? '340px' : '680px',
          height: isMobile ? '350px' : '700px',
          opacity: 0.15,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <CrabLogoOutline
          width="100%"
          height="100%"
          style={{ display: 'block' }}
        />
      </div>

      {/* Dateline / edition rule */}
      <div
        style={{
          borderBottom: '1px solid #0D0B08',
          padding: isMobile ? '6px 16px' : '6px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'nowrap',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span style={{
          fontFamily: '"Courier New", monospace',
          fontSize: isMobile ? '8px' : '12px',
          fontWeight: 700,
          letterSpacing: isMobile ? '0.08em' : '0.2em',
          textTransform: 'uppercase',
          color: '#666',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}>
          AVALANCHE FUJI TESTNET — 5-MIN ROUNDS
        </span>
        <span style={{
          fontFamily: '"Courier New", monospace',
          fontSize: isMobile ? '8px' : '12px',
          fontWeight: 700,
          letterSpacing: isMobile ? '0.08em' : '0.16em',
          textTransform: 'uppercase',
          color: '#666',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}>
          ORACLE-SETTLED · GASLESS
        </span>
      </div>

      {/* Main editorial grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gridTemplateRows: isMobile ? '1fr 1fr' : 'none',
          borderBottom: '1px solid #0D0B08',
          position: 'relative',
          flex: 1,
        }}
      >
        {/* LEFT: headline column */}
        <div
          className="np-hero-headline"
          style={{
            borderRight: isMobile ? 'none' : '1px solid #0D0B08',
            borderBottom: isMobile ? '1px solid #0D0B08' : 'none',
            padding: isMobile ? '32px 24px' : '96px 48px',
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <p style={{
            fontFamily: '"Courier New", monospace',
            fontSize: isMobile ? 10 : 12, fontWeight: 700,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            color: '#C0392B', marginBottom: isMobile ? 10 : 16,
          }}>
            ◆ PREDICTION MARKETS
          </p>

          <h1
            className="np-hero-h1"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: isMobile ? 'clamp(1.8rem, 6vw, 2.2rem)' : 'clamp(3.5rem, 5vw, 4.5rem)',
              fontWeight: 900, lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#0D0B08',
              marginBottom: isMobile ? 16 : 44,
            }}
          >
            Trade the Market&rsquo;s Next Move On-Chain
          </h1>

          <p
            className="np-hero-deck"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: isMobile ? 14 : 18, lineHeight: 1.4,
              color: '#3A3530', marginBottom: isMobile ? 20 : 32,
              maxWidth: 480,
            }}
          >
            Predict BTC, ETH, and AVAX price direction in 5-minute windows.
            Powered by Chainlink oracles on the Avalanche Fuji testnet —
            no gas required from your wallet.
          </p>

          <Link href="/markets" style={{ textDecoration: 'none' }}>
            <span
              className="np-cta-primary"
              style={{
                display: 'inline-block',
                background: '#E74141', color: '#FAF8F3',
                padding: isMobile ? '10px 20px' : '12px 28px',
                fontFamily: '"Courier New", monospace',
                fontSize: isMobile ? 9 : 11, fontWeight: 700,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#C0392B'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#E74141'; }}
            >
              ENTER MARKETS →
            </span>
          </Link>
        </div>

        {/* RIGHT: stats grid — positioned above the outlined crab */}
        <div
          className="np-hero-stats"
          style={{
            display: 'grid',
            background: '#FAF8F3',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: isMobile ? 'auto' : '1fr 1fr',
            position: 'relative',
            zIndex: 1,
            // background: 'transparent',
          }}
        >
          {STATS.map((stat, i) => (
            <StatCell key={stat.label} stat={stat} index={i} isMobile={isMobile} />
          ))}
        </div>
      </div>

      {/* Asset strip */}
      {/* <div
        style={{
          display: 'flex', alignItems: 'stretch',
          borderBottom: '1px solid #0D0B08',
          overflow: 'hidden',
        }}
      >
        {ASSETS.map((asset, i) => (
          <AssetCell key={asset.pair} asset={asset} index={i} />
        ))}
      </div> */}
    </section>
  );
}