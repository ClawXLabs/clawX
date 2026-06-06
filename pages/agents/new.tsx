import Head from 'next/head';
import AppShell from '../../components/AppShell';
import AgentCreator from '../../components/agents/AgentCreator';

export default function NewAgentPage() {
  return (
    <>
      <Head>
        <title>New Agent · ClawX</title>
      </Head>
      <AppShell>
        <AgentCreator />
      </AppShell>
    </>
  );
}
