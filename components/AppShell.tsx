import { ReactNode, useEffect } from 'react';
import Navbar from './landing/Navbar';
import { useWallet } from '../contexts/WalletContext';
import ConnectWalletModal from './ConnectWalletModal';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { account, connectWallet, setShowConnectModal } = useWallet();

  useEffect(() => {
    if (!account) {
      setShowConnectModal(true);
    }
  }, [account, setShowConnectModal]);

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

      {/* Connect Wallet Modal Popup */}
      <ConnectWalletModal />

      {/* Page content — padded below the two fixed nav bars */}
      <main style={{ paddingTop: 56 }}>
        {children}
      </main>
    </div>
  );
}
