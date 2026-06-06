import Navbar from './landing/Navbar';
import HeroSection from './landing/HeroSection';
import AssetMarquee from './landing/AssetMarquee';
import RoleCards from './landing/RoleCards';
import MarketsPreview from './landing/MarketsPreview';
import TimelineSection from './landing/TimelineSection';
import Footer from './landing/Footer';

interface LandingPageProps {
  onConnectWallet: () => void;
  account: string | null;
}

/**
 * LandingPage — Old Newspaper Theme
 * ──────────────────────────────────
 * Structure is intentionally flat and static so that GSAP ScrollTrigger
 * animations can be attached later via class hooks.
 *
 * GSAP hook classes to target:
 *   .np-hero            → Hero entrance
 *   .np-hero-headline   → Headline stagger
 *   .np-hero-h1         → Display headline word-split
 *   .np-hero-deck       → Sub-copy fade
 *   .np-stat-cell       → Stats count-up
 *   .np-marquee-track   → Horizontal scroll override
 *   .np-role-card       → Slide-up stagger on scroll
 *   .np-market-row      → Row stagger on scroll
 *   .np-step            → Column stagger on scroll
 *   .np-footer          → Footer entrance
 */
export default function LandingPage({ onConnectWallet, account }: LandingPageProps) {
  return (
    <div
      className="np-root"
      style={{ background: '#FAF8F3', minHeight: '100vh' }}
    >
      {/* Fixed navigation */}
      <Navbar account={account} onConnect={onConnectWallet} />

      {/* Main editorial content */}
      <main>
        {/* 1 — Hero: editorial headline + stats grid */}
        <HeroSection account={account} onConnect={onConnectWallet} />

        {/* 2 — Scrolling ticker band */}
        <AssetMarquee />

        {/* 3 — Two-mode cards */}
        <RoleCards />

        {/* 4 — Live markets table */}
        {/* <MarketsPreview /> */}

        {/* 5 — How it works: 4-step grid */}
        <TimelineSection />
      </main>

      {/* Dark editorial footer */}
      <Footer account={account} onConnect={onConnectWallet} />
    </div>
  );
}
