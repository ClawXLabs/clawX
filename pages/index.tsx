import Head from 'next/head';
import LandingPage from '../components/LandingPage';
import { useWallet } from '../contexts/WalletContext';

export default function Home() {
  const { account, connectWallet } = useWallet();

  return (
    <>
      <Head>
        <title>ClawX – Prediction Markets on Avalanche</title>
        <meta name="description" content="5-minute prediction markets on Avalanche Fuji with fast median oracle prices. Pick UP or DOWN, settle on-chain." />
      </Head>
      <LandingPage onConnectWallet={connectWallet} account={account ?? null} />
    </>
  );
}
