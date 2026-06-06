import Head from 'next/head';
import AppShell from '../../components/AppShell';
import AgentProfile from '../../components/agents/AgentProfile';

export default function AgentProfilePage() {
  return (
    <>
      <Head>
        <title>Agent · ClawX</title>
      </Head>
      <AppShell>
        <AgentProfile />
      </AppShell>
    </>
  );
}
