import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

import AgentCard, { AgentData } from './AgentCard';
import AgentIcon from './AgentIcon';

import AgentFeed from './AgentFeed';

import MyAgentBar from './MyAgentBar';

import AgentControlBar from './AgentControlBar';

import PendingSettlementsPanel from './PendingSettlementsPanel';

import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';

import { useAgentFeedBroadcast } from '../../hooks/useAgentFeedBroadcast';



const S = {

  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,

  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,

  label: {

    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,

    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',

  } as React.CSSProperties,

  section: { border: '1px solid #0D0B08', padding: '20px' } as React.CSSProperties,

};



export default function AgentsLobby() {

  const { enrolled, status, account, refresh } = useAgentEnrollment(4000);

  const [agents, setAgents] = useState<AgentData[]>([]);

  const [loading, setLoading] = useState(true);

  const { messages: feed, connected, error: feedError } = useAgentFeedBroadcast({ limit: 50 });



  useEffect(() => {

    let cancelled = false;

    const load = async () => {

      try {

        const catalogRes = await fetch('/api/agents/catalog');

        const catalog = await catalogRes.json() as { agents?: AgentData[] };

        if (!cancelled) setAgents(catalog.agents || []);

      } catch {

        if (!cancelled) setAgents([]);

      } finally {

        if (!cancelled) setLoading(false);

      }

    };

    load();

    const timer = setInterval(load, 30000);

    return () => { cancelled = true; clearInterval(timer); };

  }, []);



  const agent = status?.agent;

  const delegate = status?.delegate;

  const tr = status?.trackRecord;



  return (

    <>

      <div style={{ borderBottom: '2px solid #0D0B08', padding: '48px 24px 32px' }}>

        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>

          <div style={{
            width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #C0392B', color: '#C0392B',
          }}>
            <Bot size={28} strokeWidth={1.5} />
          </div>

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



      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px' }}>

        {enrolled && account && status ? (

          <section style={{ ...S.section, borderWidth: 2, marginBottom: 32 }}>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

                <div style={{
                  width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid #0D0B08', background: `${agent?.color || '#27AE60'}15`,
                }}>
                  <AgentIcon agentId={agent?.id} size={22} color={agent?.color || '#27AE60'} />
                </div>

                <div>

                  <p style={{ ...S.label, color: delegate?.needsRedeploy ? '#C0392B' : delegate?.paused ? '#F69D39' : '#27AE60' }}>

                    {delegate?.needsRedeploy ? 'Re-deploy required' : delegate?.paused ? 'Paused' : 'Your agent is live'}

                  </p>

                  <h2 style={{ ...S.serif, fontSize: 22, fontWeight: 900, margin: '4px 0 0', color: '#0D0B08' }}>{agent?.name}</h2>

                  <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 4 }}>

                    ${status.aum?.toLocaleString() ?? '—'} AUM · {(status.returnPct ?? 0) >= 0 ? '+' : ''}{status.returnPct ?? 0}% ·{' '}

                    {tr?.wins ?? 0}W/{tr?.losses ?? 0}L · {status.openPositions?.length ?? 0} open

                  </p>

                </div>

              </div>

              <Link href="/agents/dashboard" style={{ textDecoration: 'none' }}>

                <span style={{

                  display: 'inline-block', background: '#0D0B08', color: '#FAF8F3',

                  padding: '10px 20px', ...S.mono, fontSize: 10, fontWeight: 700,

                  letterSpacing: '0.14em', textTransform: 'uppercase',

                }}>Open Dashboard</span>

              </Link>

            </div>



            <AgentControlBar wallet={account} delegate={delegate} onRefresh={() => refresh({ silent: true })} />



            {(status.pendingSettlements?.length ?? 0) > 0 ? (

              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(13,11,8,0.15)' }}>

                <p style={{ ...S.label, marginBottom: 12 }}>Awaiting settlement ({status.pendingSettlements?.length})</p>

                <PendingSettlementsPanel items={status.pendingSettlements || []} />

              </div>

            ) : null}

          </section>

        ) : null}



        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>

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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

                {Array.from({ length: 4 }).map((_, i) => (

                  <div key={i} style={{ border: '1px solid #0D0B08', padding: 20 }}>

                    <div style={{ height: 48, background: 'rgba(13,11,8,0.06)', marginBottom: 12 }} />

                    <div style={{ height: 14, background: 'rgba(13,11,8,0.04)', width: '70%', marginBottom: 8 }} />

                    <div style={{ height: 14, background: 'rgba(13,11,8,0.04)', width: '50%' }} />

                  </div>

                ))}

              </div>

            ) : (

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

                {agents.map((agentRow, index) => (

                  <AgentCard key={agentRow.id} agent={agentRow} rank={index + 1} href={`/agents/${agentRow.id}`} />

                ))}

              </div>

            )}

          </div>



          <div>

            <AgentFeed messages={feed} connected={connected} error={feedError} />

          </div>

        </div>

      </div>

    </>

  );

}


