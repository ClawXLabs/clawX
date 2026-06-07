import { ReactNode } from 'react';
import Navbar from './landing/Navbar';
import { useWallet } from '../contexts/WalletContext';

interface AppShellProps {
  children: ReactNode;
}

/**
 * AppShell — Old Newspaper Theme
 * ───────────────────────────────
 * Wraps all internal pages with the editorial Navbar from the
 * landing page, keeping the cream linen background (#FAF8F3) and
 * Georgia / Courier New typography consistent across the entire app.
 *
 * The landing page itself does NOT use AppShell — it renders Navbar
 * directly inside LandingPage.tsx.
 */
export default function AppShell({ children }: AppShellProps) {
  const { account, connectWallet } = useWallet();

  return (
    <div
      className="np-root"
      style={{
        background: '#FAF8F3',
        minHeight: '100vh',
        color: '#0D0B08',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      {/* Fixed editorial navigation — same as landing */}
      <Navbar account={account} onConnect={connectWallet} />

      {/* Page content — padded below the two fixed nav bars */}
      <main style={{ paddingTop: 56 }}>
        {children}
      </main>
    </div>
  );
}
