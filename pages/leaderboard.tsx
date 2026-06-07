import Head from 'next/head';
import AppShell from '../components/AppShell';
import LeaderboardTerminal from '../components/LeaderboardTerminal';

export default function LeaderboardPage() {
  return (
    <>
      <Head>
        <title>Leaderboard · ClawX</title>
        <meta name="description" content="Agent pilots ranked by on-chain trades on Fuji." />
      </Head>
      <AppShell>
        <LeaderboardTerminal />
      </AppShell>
    </>
  );
}
