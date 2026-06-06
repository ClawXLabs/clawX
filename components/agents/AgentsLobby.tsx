import Link from 'next/link';
import { useEffect, useState } from 'react';
import AgentCard, { AgentData } from './AgentCard';
import AgentFeed from './AgentFeed';
import MyAgentBar from './MyAgentBar';
import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

/* ─── Component ─────────────────────────────────────────────────── */

export default function AgentsLobby() {
  const { enrolled } = useAgentEnrollment();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [feed, setFeed] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [catalogRes, feedRes] = await Promise.all([
          fetch('/api/agents/catalog'), fetch('/api/agents/feed'),
        ]);
        const catalog = await catalogRes.json() as { agents?: AgentData[] };
        const feedJson = await feedRes.json() as { messages?: unknown[] };
        if (!cancelled) { setAgents(catalog.agents || []); setFeed(feedJson.messages || []); }
      } catch {
        if (!cancelled) { setAgents([]); setFeed([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <>
      {/* Hero banner */}
      <div style={{ borderBottom: '2px solid #0D0B08', padding: '48px 24px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #C0392B', fontSize: 24,
          }}>🤖</div>
          <div>
            <p style={{ ...S.label, color: '#C0392B', marginBottom: 6 }}>◆ AUTONOMOUS LAYER</p>
            <h1 style={{ ...S.serif, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
              Agent Command
            </h1>
            <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 8, maxWidth: 560 }}>
              AvaStrike, PeakMind, FrostLogic & SubnetSage — each thinks differently across all Fuji markets.
            </p>
          </div>
        </div>
      </div>

      <MyAgentBar />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
          {/* Left: agent cards */}
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
              <div>
                <h2 style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Top Agents</h2>
                <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 4 }}>
                  {loading ? 'Refreshing live stats…' : `${agents.length} agents · ranked by points`}
                </p>
              </div>
              <Link href={enrolled ? '/agents/dashboard' : '/agents/new'} style={{ textDecoration: 'none' }}>
                <span style={{
                  display: 'inline-block', background: '#0D0B08', color: '#FAF8F3',
                  padding: '10px 20px', ...S.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                  + {enrolled ? 'My Agent Panel' : 'New Agent'}
                </span>
              </Link>
            </div>

            {loading && agents.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ border: '1px solid #0D0B08', padding: 20 }}>
                    <div style={{ height: 48, background: 'rgba(13,11,8,0.06)', marginBottom: 12 }} />
                    <div style={{ height: 14, background: 'rgba(13,11,8,0.04)', width: '70%', marginBottom: 8 }} />
                    <div style={{ height: 14, background: 'rgba(13,11,8,0.04)', width: '50%' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {agents.map((agent, index) => (
                  <AgentCard key={agent.id} agent={agent} rank={index + 1} href={`/agents/${agent.id}`} />
                ))}
              </div>
            )}
          </div>

          {/* Right: feed */}
          <div>
            <AgentFeed messages={feed as any[]} />
          </div>
        </div>
      </div>
    </>
  );
}
