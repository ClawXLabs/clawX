import React from 'react';
import { useWallet } from '../contexts/WalletContext';

export default function ConnectWalletModal() {
  const { account, connectWallet, disconnectWallet, showConnectModal, setShowConnectModal } = useWallet();

  if (!showConnectModal) return null;

  const handleMetamaskConnect = async () => {
    await connectWallet();
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setShowConnectModal(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(13, 11, 8, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => setShowConnectModal(false)}
    >
      <div
        style={{
          background: '#FAF8F3',
          border: '3px solid #0D0B08',
          boxShadow: '8px 8px 0px #0D0B08',
          width: '100%',
          maxWidth: 420,
          padding: 24,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #0D0B08', paddingBottom: 12, marginBottom: 18 }}>
          <span style={{ fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#C0392B' }}>
            ◆ TERMINAL ACCESS
          </span>
          <button
            onClick={() => setShowConnectModal(false)}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: '#0D0B08',
            }}
          >
            [X]
          </button>
        </div>

        <h3
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 22,
            fontWeight: 900,
            margin: '0 0 8px 0',
            color: '#0D0B08',
            letterSpacing: '-0.02em',
          }}
        >
          {account ? 'Switch Wallet' : 'Connect Wallet'}
        </h3>
        <p
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#555',
            margin: '0 0 20px 0',
          }}
        >
          {account
            ? `Current Connection: ${account.slice(0, 6)}...${account.slice(-4)}. Choose a different wallet or disconnect below.`
            : 'Accessing prediction markets and deploying auto-trading agents requires an authorized wallet on Avalanche Fuji Testnet.'}
        </p>

        {/* Wallets Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleMetamaskConnect}
            style={{
              background: '#FDF6EC',
              border: '1.5px solid #0D0B08',
              borderRadius: 6,
              padding: '14px 18px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'transform 0.1s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FFF';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FDF6EC';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div>
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 15, fontWeight: 900, color: '#0D0B08' }}>
                MetaMask
              </div>
              <div style={{ fontFamily: '"Courier New", monospace', fontSize: 9, color: '#7B6A52', marginTop: 2 }}>
                Browser Extension or App
              </div>
            </div>
            <span style={{ fontSize: 18 }}>🦊</span>
          </button>

          <button
            onClick={handleMetamaskConnect}
            style={{
              background: '#FDF6EC',
              border: '1.5px solid #0D0B08',
              borderRadius: 6,
              padding: '14px 18px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'transform 0.1s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FFF';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FDF6EC';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div>
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 15, fontWeight: 900, color: '#0D0B08' }}>
                Browser Injected Wallet
              </div>
              <div style={{ fontFamily: '"Courier New", monospace', fontSize: 9, color: '#7B6A52', marginTop: 2 }}>
                Core Wallet, Rabby, or other
              </div>
            </div>
            <span style={{ fontSize: 18 }}>🔌</span>
          </button>
        </div>

        {/* Disconnect Option if already connected */}
        {account && (
          <button
            onClick={handleDisconnect}
            style={{
              marginTop: 18,
              background: 'transparent',
              border: '1.5px solid #C0392B',
              borderRadius: 6,
              padding: '10px 14px',
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#C0392B',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#C0392B';
              e.currentTarget.style.color = '#FAF8F3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#C0392B';
            }}
          >
            Disconnect Wallet
          </button>
        )}

        <div style={{ borderTop: '1px solid #E8D5B0', marginTop: 20, paddingTop: 12, textAlign: 'center' }}>
          <p style={{ fontFamily: '"Courier New", monospace', fontSize: 9, color: '#888', margin: 0 }}>
            Avax Fuji Testnet Chain ID: 43113
          </p>
        </div>
      </div>
    </div>
  );
}
