import Head from 'next/head';
import AppShell from '../../components/AppShell';
import AgentsLobby from '../../components/agents/AgentsLobby';

export default function AgentsLobbyPage() {
  return (
    <>
      <Head>
        <title>Agents · ClawX</title>
        <meta name="description" content="Top autonomous agents on Fuji — live AUM, returns, and positions." />
      </Head>
      <AppShell>
        <AgentsLobby />
      </AppShell>
    </>
  );
}
