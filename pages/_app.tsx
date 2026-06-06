import type { AppProps } from 'next/app';
import Head from 'next/head';
import { WalletProvider } from '../contexts/WalletContext';
import { MarketDataProvider } from '../contexts/MarketDataContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <MarketDataProvider>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <link
            rel="icon"
            href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='0' fill='%23ff2d3b'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='12' font-family='system-ui' font-weight='700'%3ECX%3C/text%3E%3C/svg%3E"
          />
        </Head>
        <Component {...pageProps} />
      </MarketDataProvider>
    </WalletProvider>
  );
}

