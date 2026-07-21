import { Component as ReactComponent, useState } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { WalletProvider } from '../contexts/WalletContext';
import { MarketDataProvider } from '../contexts/MarketDataContext';
import AutoSettlementWatcher from '../components/AutoSettlementWatcher';
import Loading from '../components/Loading';
import '../styles/globals.css';

class ErrorBoundary extends ReactComponent<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(err: Error) { console.error('[ErrorBoundary]', err); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#888' }}>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

let initialLoadPlayed = false;

export default function App({ Component, pageProps }: AppProps) {
  const [showLoading, setShowLoading] = useState(!initialLoadPlayed);

  const handleLoadingComplete = () => {
    initialLoadPlayed = true;
    setShowLoading(false);
  };

  return (
    <ErrorBoundary>
      <WalletProvider>
        <MarketDataProvider>
          <AutoSettlementWatcher />
          <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
            <link
              rel="icon"
              href="/favicon.svg"
            />
          </Head>
          <Component {...pageProps} />
          {showLoading && <Loading onComplete={handleLoadingComplete} />}
        </MarketDataProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
}
