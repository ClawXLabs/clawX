import Head from 'next/head';
import AppShell from '../../components/AppShell';
import AgentDashboard from '../../components/agents/AgentDashboard';

export default function AgentDashboardPage() {
  return (
    <>
      <Head>
        <title>My Agent · ClawX</title>
      </Head>
      <AppShell>
        <AgentDashboard />
      </AppShell>
    </>
  );
}
