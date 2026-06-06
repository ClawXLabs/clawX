import Head from 'next/head';
import AppShell from '../../components/AppShell';
import MarketsHubTerminal from '../../components/MarketsHubTerminal';

export default function MarketsIndexPage() {
  return (
    <>
      <Head>
        <title>Markets · ClawX</title>
        <meta name="description" content="Browse live Fuji markets and open the trading desk." />
      </Head>
      <AppShell>
        <MarketsHubTerminal />
      </AppShell>
    </>
  );
}
