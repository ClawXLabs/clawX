import Head from 'next/head';
import AppShell from '../components/AppShell';
import MarketsHubTerminal from '../components/MarketsHubTerminal';

export default function Home() {
  return (
    <>
      <Head>
        <title>Markets · ClawX</title>
        <meta name="description" content="Browse live Fuji prediction markets and open the trading desk." />
      </Head>
      <AppShell>
        <MarketsHubTerminal />
      </AppShell>
    </>
  );
}
