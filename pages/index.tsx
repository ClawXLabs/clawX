import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/markets');
  }, [router]);

  return (
    <>
      <Head>
        <title>Loading... · ClawX</title>
      </Head>
      <div style={{ background: '#FAF8F3', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: '"Courier New", monospace', fontSize: 13, color: '#888' }}>Redirecting to app...</p>
      </div>
    </>
  );
}
