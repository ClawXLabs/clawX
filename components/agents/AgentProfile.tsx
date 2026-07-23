import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AgentCard, { AgentData } from './AgentCard';
import AgentFeed from './AgentFeed';
import { getAgentById } from '../../utils/agents/config';
import { useAgentFeedBroadcast } from '../../hooks/useAgentFeedBroadcast';
import { useIsMobile } from '../../hooks/useIsMobile';

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

export default function AgentProfile() {
  const router = useRouter();
  const isMobile = useIsMobile(768);
  const { id } = router.query;
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const agentId = typeof id === 'string' ? id : undefined;
  const { messages: feed, connected, error: feedError } = useAgentFeedBroadcast({
    agentId,
    limit: 30,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const catalogRes = await fetch('/api/agents/catalog');
        const catalog = await catalogRes.json() as { agents?: AgentData[] };
        const found = (catalog.agents || []).find((row) => row.id === id) || getAgentById(id as string);
        if (!cancelled) setAgent((found as AgentData) || null);
      } catch {
        if (!cancelled) setAgent((getAgentById(id as string) as unknown as AgentData) || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const staticAgent = getAgentById(id as string) as unknown as AgentData | undefined;
  const displayAgent = agent || staticAgent;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '32px 24px 64px' }}>
      <Link href="/agents" style={{ textDecoration: 'none' }}>
        <span style={{ ...S.mono, fontSize: 11, color: '#888', display: 'inline-block', marginBottom: 28 }}>← All agents</span>
      </Link>

      {loading && !displayAgent ? (
        <div style={{ marginTop: 32 }}>
          <div style={{ border: '1px solid #0D0B08', padding: 32 }}>
            <div style={{ height: 200, background: 'rgba(13,11,8,0.04)', marginBottom: 16 }} />
            <div style={{ height: 16, background: 'rgba(13,11,8,0.04)', width: '60%' }} />
          </div>
        </div>
      ) : !displayAgent ? (
        <p style={{ ...S.mono, fontSize: 12, color: '#888', textAlign: 'center', marginTop: 48 }}>Agent not found</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
            gap: isMobile ? 20 : 32,
            alignItems: 'start',
            marginTop: 8,
          }}
        >
          <div>
            <AgentCard agent={displayAgent} />
            <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 24 }}>
              {(displayAgent as any).tagline}
            </p>
            <Link href="/agents/new" style={{ textDecoration: 'none' }}>
              <span style={{
                display: 'inline-block', marginTop: 24,
                background: '#0D0B08', color: '#FAF8F3',
                padding: '14px 28px', ...S.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>
                Start with this agent
              </span>
            </Link>
          </div>
          <div>
            <AgentFeed messages={feed} title={`${displayAgent.name} comms`} connected={connected} error={feedError} />
          </div>
        </div>
      )}
    </div>
  );
}
