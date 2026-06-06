import Head from 'next/head';
import AppShell from '../components/AppShell';
import FaucetTerminal from '../components/FaucetTerminal';

export default function FaucetPage() {
  return (
    <>
      <Head>
        <title>Faucet · ClawX</title>
        <meta name="description" content="Claim 300 TUSDC on Fuji — no AVAX required, we pay gas." />
      </Head>
      <AppShell>
        <FaucetTerminal />
      </AppShell>
    </>
  );
}
