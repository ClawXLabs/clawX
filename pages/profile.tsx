import Head from 'next/head';
import AppShell from '../components/AppShell';
import ProfileTerminal from '../components/ProfileTerminal';

export default function ProfilePage() {
  return (
    <>
      <Head>
        <title>Profile · ClawX</title>
        <meta name="description" content="Profile, balances and trade history." />
      </Head>
      <AppShell>
        <ProfileTerminal />
      </AppShell>
    </>
  );
}
