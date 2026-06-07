import { useState } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { WalletProvider } from '../contexts/WalletContext';
import { MarketDataProvider } from '../contexts/MarketDataContext';
import AutoSettlementWatcher from '../components/AutoSettlementWatcher';
import Loading from '../components/Loading';
import '../styles/globals.css';

let initialLoadPlayed = false;

export default function App({ Component, pageProps }: AppProps) {
  const [showLoading, setShowLoading] = useState(!initialLoadPlayed);

  const handleLoadingComplete = () => {
    initialLoadPlayed = true;
    setShowLoading(false);
  };

  return (
    <WalletProvider>
      <MarketDataProvider>
        <AutoSettlementWatcher />
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <link
            rel="icon"
            href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='0' fill='%23ff2d3b'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='12' font-family='system-ui' font-weight='700'%3ECX%3C/text%3E%3C/svg%3E"
          />
        </Head>
        <Component {...pageProps} />
        {showLoading && <Loading onComplete={handleLoadingComplete} />}
      </MarketDataProvider>
    </WalletProvider>
  );
}
