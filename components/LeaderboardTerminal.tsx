import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ADDRESS } from '../utils/contract';

const SNOWTRACE_ADDRESS = 'https://testnet.snowtrace.io/address/';
const SNOWTRACE_TX      = 'https://testnet.snowtrace.io/tx/';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardStats {
  agentPersonas: number;
  activePilots: number;
  enrolledWallets: number;
  totalTransactions: number;
}

interface SymbolStat {
  symbol: string;
  wins: number;
  losses: number;
  trades: number;
  spend: number;
  winRate: number | null;
}

interface LeaderboardRow {
  rank: number;
  wallet: string;
  displayName: string | null;
  agentId: string;
  agentName: string;
  txCount: number;
  lastTxHash: string;
  status: string;
  wins: number;
  losses: number;
  winRate: number | null;
  bySymbol: SymbolStat[];
  xp: number;
  xpLevel: number;
  streak: number;
  longestStreak: number;
  avgDailyTxs: number;
}

interface AgentPersona {
  agentId: string;
  agentName: string;
  emoji: string;
  color: string;
  pilots: number;
  activePilots: number;
  txCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  bySymbol: SymbolStat[];
}

interface LeaderboardData {
  stats: LeaderboardStats;
  rows: LeaderboardRow[];
  agentRankings: AgentPersona[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  mono:  { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' }  as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

type Tab = 'pilots' | 'agents';

// ─── Small helpers ────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function WinRatePill({ rate }: { rate: number | null }) {
  if (rate === null) return <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>–</span>;
  const color = rate >= 60 ? '#22c55e' : rate >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      ...S.mono, fontSize: 10, fontWeight: 700, color,
      background: `${color}1a`, border: `1px solid ${color}44`,
      borderRadius: 4, padding: '1px 6px',
    }}>{rate}%</span>
  );
}

function XpBadge({ xp, level }: { xp: number; level: number }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{
        ...S.mono, fontSize: 12, fontWeight: 700, color: '#D4A96A',
      }}>
        {xp.toLocaleString()}
      </span>
      <span style={{
        ...S.mono, fontSize: 9, color: '#7B6A52',
        border: '1px solid #D4A96A55', borderRadius: 4,
        padding: '1px 5px', marginLeft: 5,
      }}>
        LVL {level}
      </span>
    </div>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>—</span>;
  const color = streak >= 7 ? '#E84142' : streak >= 3 ? '#f59e0b' : '#D4A96A';
  return (
    <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color }}>
      🔥 {streak}d
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 16 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 16 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 16 }}>🥉</span>;
  return (
    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#F69D39' }}>
      #{rank}
    </span>
  );
}

// ─── Stat block ───────────────────────────────────────────────────────────────

function StatBlock({ label, value, hint, border }: {
  label: string; value: string | number; hint: string; border?: boolean;
}) {
  return (
    <div style={{ padding: '20px 24px', borderLeft: border ? '1px solid #0D0B08' : 'none' }}>
      <p style={S.label}>{label}</p>
      <p style={{ ...S.serif, fontSize: 32, fontWeight: 900, color: '#0D0B08', margin: '6px 0 0' }}>{value}</p>
      <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 6 }}>{hint}</p>
    </div>
  );
}

// ─── Your rank card (shown when connected user is not in top view) ────────────

function MyRankCard({ row }: { row: LeaderboardRow }) {
  return (
    <div style={{
      border: '2px solid #D4A96A', background: 'rgba(212,169,106,0.07)',
      padding: '12px 16px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ ...S.mono, fontSize: 10, color: '#7B6A52', fontWeight: 700 }}>YOUR RANK</span>
      <RankMedal rank={row.rank} />
      <span style={{ ...S.serif, fontSize: 14, fontWeight: 800, color: '#0D0B08' }}>
        {row.displayName || shortAddr(row.wallet)}
      </span>
      <span style={{ ...S.mono, fontSize: 10, color: '#7B6A52' }}>·</span>
      <XpBadge xp={row.xp} level={row.xpLevel} />
      <span style={{ ...S.mono, fontSize: 10, color: '#7B6A52' }}>·</span>
      <StreakBadge streak={row.streak} />
      <span style={{ ...S.mono, fontSize: 10, color: '#7B6A52' }}>·</span>
      <WinRatePill rate={row.winRate} />
      <span style={{ ...S.mono, fontSize: 10, color: '#7B6A52' }}>·</span>
      <span style={{ ...S.mono, fontSize: 11, color: '#27AE60', fontWeight: 700 }}>
        {row.txCount} tx
      </span>
    </div>
  );
}

// ─── Pilot rankings table ─────────────────────────────────────────────────────

function PilotTable({
  rows, account,
}: {
  rows: LeaderboardRow[];
  account: string | null;
}) {
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const myRow = account ? rows.find((r) => r.wallet?.toLowerCase() === account?.toLowerCase()) : null;
  const myRankVisible = myRow && myRow.rank <= rows.length;

  const columns = ['#', 'Pilot', 'Agent', 'XP', 'Streak', 'Win Rate', 'Txs'];

  return (
    <>
      {/* My rank banner if not on screen */}
      {myRow && (
        <MyRankCard row={myRow} />
      )}

      <div style={{ border: '2px solid #0D0B08', overflow: 'hidden', overflowX: 'auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #0D0B08', padding: '12px 16px',
          background: 'rgba(13,11,8,0.04)',
        }}>
          <p style={S.label}>Ranked pilots — sorted by XP</p>
          <p style={{ ...S.mono, fontSize: 10, color: '#888' }}>
            {rows.length} wallet{rows.length === 1 ? '' : 's'}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #0D0B08' }}>
              {columns.map((h, i) => (
                <th key={h} style={{
                  ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#888', padding: '10px 14px',
                  textAlign: i >= 3 ? 'right' : 'left',
                  borderRight: i < columns.length - 1 ? '1px solid rgba(13,11,8,0.10)' : 'none',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isMe = account && row.wallet?.toLowerCase() === account?.toLowerCase();
              const isExpanded = expandedWallet === row.wallet;

              return (
                <>
                  <tr
                    key={row.wallet}
                    onClick={() => setExpandedWallet(isExpanded ? null : row.wallet)}
                    style={{
                      borderBottom: '1px solid rgba(13,11,8,0.08)',
                      background: isMe
                        ? 'rgba(212,169,106,0.12)'
                        : isExpanded ? 'rgba(13,11,8,0.03)' : 'transparent',
                      cursor: 'pointer',
                      outline: isMe ? '2px solid #D4A96A' : 'none',
                      outlineOffset: -2,
                    }}
                  >
                    {/* Rank */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)', width: 42 }}>
                      <RankMedal rank={row.rank} />
                    </td>

                    {/* Pilot */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isMe && (
                          <span style={{
                            ...S.mono, fontSize: 8, fontWeight: 700, color: '#D4A96A',
                            border: '1px solid #D4A96A', borderRadius: 3, padding: '1px 5px',
                          }}>YOU</span>
                        )}
                        <div>
                          <p style={{ ...S.serif, fontSize: 14, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                            {row.displayName || 'Anonymous pilot'}
                          </p>
                          <a
                            href={`${SNOWTRACE_ADDRESS}${row.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ ...S.mono, fontSize: 9, color: '#888', textDecoration: 'none' }}
                          >
                            {shortAddr(row.wallet)}
                          </a>
                        </div>
                      </div>
                    </td>

                    {/* Agent */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)' }}>
                      <span style={{ ...S.mono, fontSize: 11, color: '#5A554E' }}>
                        {row.agentName || row.agentId}
                      </span>
                    </td>

                    {/* XP */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)', textAlign: 'right' }}>
                      <XpBadge xp={row.xp} level={row.xpLevel} />
                    </td>

                    {/* Streak */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)', textAlign: 'right' }}>
                      <StreakBadge streak={row.streak} />
                    </td>

                    {/* Win Rate */}
                    <td style={{ padding: '12px 14px', borderRight: '1px solid rgba(13,11,8,0.10)', textAlign: 'right' }}>
                      <WinRatePill rate={row.winRate} />
                    </td>

                    {/* Txs */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#27AE60' }}>
                        {row.txCount}
                      </span>
                      {row.lastTxHash ? (
                        <a
                          href={`${SNOWTRACE_TX}${row.lastTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'block', ...S.mono, fontSize: 9, color: '#888', marginTop: 3, textDecoration: 'none' }}
                        >
                          last tx ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>

                  {/* Expanded row: symbol breakdown */}
                  {isExpanded && row.bySymbol && row.bySymbol.length > 0 && (
                    <tr key={`${row.wallet}-expand`} style={{ background: 'rgba(13,11,8,0.02)', borderBottom: '1px solid rgba(13,11,8,0.10)' }}>
                      <td colSpan={7} style={{ padding: '10px 14px 14px 60px' }}>
                        <p style={{ ...S.label, marginBottom: 8 }}>Markets traded</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {row.bySymbol.map((s) => (
                            <div key={s.symbol} style={{
                              background: '#FDF6EC', border: '1px solid #D4A96A55',
                              borderRadius: 7, padding: '6px 12px', minWidth: 80, textAlign: 'center',
                            }}>
                              <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#0D0B08' }}>{s.symbol}</div>
                              <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52', marginTop: 2 }}>
                                {s.trades} tx · {Math.round(s.spend * 10) / 10}T
                              </div>
                              {s.winRate !== null && (
                                <WinRatePill rate={s.winRate} />
                              )}
                            </div>
                          ))}
                        </div>
                        <p style={{ ...S.mono, fontSize: 9, color: '#888', marginTop: 8 }}>
                          Avg {row.avgDailyTxs} tx/day · Best streak {row.longestStreak}d
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', padding: '40px 16px', textAlign: 'center' }}>
            No agent trades yet.{' '}
            <Link href="/agents" style={{ color: '#C0392B' }}>Deploy an agent</Link>
          </p>
        )}
      </div>
    </>
  );
}

// ─── Agent persona rankings ───────────────────────────────────────────────────

function AgentPersonaRankings({ agents }: { agents: AgentPersona[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!agents || agents.length === 0) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888', padding: '40px 0', textAlign: 'center' }}>
        No agent data yet.
      </p>
    );
  }

  return (
    <div>
      <p style={{ ...S.label, marginBottom: 16 }}>Agent personas ranked by total transactions</p>
      {agents.map((agent, i) => {
        const isExpanded = expanded === agent.agentId;
        return (
          <div
            key={agent.agentId}
            style={{
              border: '1.5px solid #D4A96A',
              borderLeft: `4px solid ${agent.color}`,
              borderRadius: 10,
              marginBottom: 12,
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(isExpanded ? null : agent.agentId)}
          >
            {/* Agent header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '14px 18px',
              background: isExpanded ? 'rgba(13,11,8,0.03)' : '#FDF6EC',
            }}>
              {/* Rank */}
              <span style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#D4A96A', width: 28, textAlign: 'center' }}>
                {i + 1 === 1 ? '🥇' : i + 1 === 2 ? '🥈' : i + 1 === 3 ? '🥉' : `#${i + 1}`}
              </span>

              {/* Emoji + Name */}
              <span style={{ fontSize: 24 }}>{agent.emoji}</span>
              <div style={{ flex: 1, minWidth: 100 }}>
                <p style={{ ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                  {agent.agentName}
                </p>
                <p style={{ ...S.mono, fontSize: 10, color: '#7B6A52', margin: 0 }}>
                  @{agent.agentId}
                </p>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...S.mono, fontSize: 18, fontWeight: 700, color: '#0D0B08' }}>{agent.txCount}</div>
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52' }}>TOTAL TXS</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>{agent.pilots}</div>
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52' }}>PILOTS</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{agent.activePilots}</div>
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52' }}>ACTIVE</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{agent.wins}W</div>
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52' }}>WINS</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{agent.losses}L</div>
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52' }}>LOSSES</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <WinRatePill rate={agent.winRate} />
                  <div style={{ ...S.mono, fontSize: 9, color: '#7B6A52', marginTop: 2 }}>WIN %</div>
                </div>
              </div>

              <span style={{ ...S.mono, fontSize: 11, color: '#7B6A52', marginLeft: 'auto' }}>
                {isExpanded ? '▲' : '▼'}
              </span>
            </div>

            {/* Expanded: per-token breakdown */}
            {isExpanded && (
              <div style={{ padding: '14px 18px 18px', borderTop: '1px solid #E8D5B0' }}>
                <p style={{ ...S.label, marginBottom: 10 }}>Token performance</p>
                {agent.bySymbol.length === 0 ? (
                  <p style={{ ...S.mono, fontSize: 11, color: '#888' }}>No resolved trade data yet.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E8D5B0' }}>
                          {['Token', 'Trades', 'W / L', 'Win %', 'Pool Spend'].map((h, idx) => (
                            <th key={h} style={{
                              ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                              textTransform: 'uppercase', color: '#888',
                              padding: '6px 12px', textAlign: idx > 0 ? 'right' : 'left',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {agent.bySymbol.map((s) => (
                          <tr key={s.symbol} style={{ borderBottom: '1px solid #F0E4CE' }}>
                            <td style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#0D0B08', padding: '7px 12px' }}>
                              {s.symbol}
                            </td>
                            <td style={{ ...S.mono, fontSize: 12, color: '#0D0B08', padding: '7px 12px', textAlign: 'right' }}>
                              {s.trades}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                              <span style={{ ...S.mono, fontSize: 11, color: '#22c55e', fontWeight: 700 }}>{s.wins}W</span>
                              {' / '}
                              <span style={{ ...S.mono, fontSize: 11, color: '#ef4444', fontWeight: 700 }}>{s.losses}L</span>
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                              <WinRatePill rate={s.winRate} />
                            </td>
                            <td style={{ ...S.mono, fontSize: 11, color: '#7B6A52', padding: '7px 12px', textAlign: 'right' }}>
                              {Math.round((s.spend || 0) * 10) / 10} TUSDC
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeaderboardTerminal() {
  const { account } = useWallet();
  const [data, setData]             = useState<LeaderboardData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput]   = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg]       = useState('');
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState<Tab>('pilots');

  // Auto-load + poll
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/agents/leaderboard', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load leaderboard');
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Load display name
  useEffect(() => {
    if (!account) { setDisplayName(''); setNameInput(''); return; }
    fetch(`/api/agents/profile?wallet=${account}`)
      .then((r) => r.json())
      .then((json) => {
        setDisplayName(json.displayName || '');
        setNameInput(json.displayName || '');
      })
      .catch(() => {});
  }, [account]);

  const saveName = async () => {
    if (!account) return;
    setSavingName(true); setNameMsg('');
    try {
      const res = await fetch('/api/agents/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: account, displayName: nameInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save name');
      setDisplayName(json.displayName);
      setNameMsg('Saved — your name will show on the leaderboard.');
    } catch (e: any) {
      setNameMsg(e.message || 'Save failed');
    } finally {
      setSavingName(false);
    }
  };

  const stats   = data?.stats;
  const rows    = data?.rows || [];
  const agents  = data?.agentRankings || [];
  const needsName = account && !displayName;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'pilots', label: 'Pilot Rankings', icon: '🏆' },
    { id: 'agents', label: 'Agent Rankings', icon: '🤖' },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 24px 64px' }}>
      {/* Page header */}
      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ PILOT RANKINGS</p>
        <h1 style={{ ...S.serif, fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
          Leaderboard
        </h1>
        <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10, maxWidth: 620 }}>
          Pilots ranked by XP earned — from real agent trades, wins, streaks, and social milestones on Fuji.
        </p>
      </div>

      {/* Global stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0, border: '2px solid #0D0B08', marginBottom: 24 }}>
        <StatBlock label="Agent personas"     value={stats?.agentPersonas     ?? '—'} hint="AvaStrike · PeakMind · FrostLogic · SubnetSage" />
        <StatBlock label="Active pilots"      value={stats?.activePilots      ?? '—'} hint={`${stats?.enrolledWallets ?? 0} wallets enrolled`} border />
        <StatBlock label="Total transactions" value={stats?.totalTransactions?.toLocaleString() ?? '—'} hint="Agent BUY clips on-chain" border />
      </div>

      {/* Name setup */}
      {account ? (
        <div style={{
          border: needsName ? '2px solid #F69D39' : '1px solid rgba(13,11,8,0.2)',
          background: needsName ? 'rgba(246,157,57,0.06)' : 'transparent',
          padding: '16px 20px', marginBottom: 20,
        }}>
          <p style={{ ...S.label, color: needsName ? '#C0392B' : '#888' }}>
            {needsName ? '◆ Set your pilot name' : 'Your display name'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={displayName || 'e.g. Bruceeee'}
              maxLength={32}
              style={{
                flex: '1 1 200px', border: '1px solid #0D0B08', background: '#FAF8F3',
                padding: '9px 14px', ...S.mono, fontSize: 13, color: '#0D0B08', outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingName}
              style={{
                background: '#0D0B08', color: '#FAF8F3', border: 'none',
                padding: '9px 22px', ...S.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                opacity: savingName ? 0.5 : 1,
              }}
            >
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </div>
          {nameMsg ? <p style={{ ...S.mono, fontSize: 11, color: '#27AE60', marginTop: 6 }}>{nameMsg}</p> : null}
        </div>
      ) : (
        <p style={{ ...S.mono, fontSize: 11, color: '#888', marginBottom: 16 }}>
          Connect your wallet to set your pilot name and appear on the board.
        </p>
      )}

      {/* Snowtrace links */}
      <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 16px', marginBottom: 24, ...S.mono, fontSize: 11, color: '#888' }}>
        <span style={{ fontWeight: 700, color: '#0D0B08' }}>Fuji contracts: </span>
        Market{' '}
        <a href={`${SNOWTRACE_ADDRESS}${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: '#27AE60' }}>
          {shortAddr(CONTRACT_ADDRESS)}
        </a>
        {account && (
          <>
            {' · '}Your wallet{' '}
            <a href={`${SNOWTRACE_ADDRESS}${account}`} target="_blank" rel="noopener noreferrer" style={{ color: '#27AE60' }}>
              {shortAddr(account)}
            </a>
          </>
        )}
      </div>

      {error && (
        <div style={{ border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '10px 14px', ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #D4A96A', marginBottom: 20 }}>
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                ...S.mono, fontSize: 12, fontWeight: isActive ? 800 : 500,
                padding: '8px 18px', border: 'none',
                borderBottom: isActive ? '2px solid #D4A96A' : '2px solid transparent',
                marginBottom: -2,
                background: isActive ? '#FDF6EC' : 'transparent',
                color: isActive ? '#0D0B08' : '#7B6A52',
                cursor: 'pointer', borderRadius: '7px 7px 0 0',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{t.icon}</span>{t.label}
              {t.id === 'pilots' && rows.length > 0 && (
                <span style={{
                  background: '#D4A96A', color: '#fff', borderRadius: 20,
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', marginLeft: 2,
                }}>{rows.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'pilots' && (
        <PilotTable rows={rows} account={account || null} />
      )}
      {activeTab === 'agents' && (
        <AgentPersonaRankings agents={agents} />
      )}
    </div>
  );
}
