import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ADDRESS } from '../utils/contract';

const SNOWTRACE_ADDRESS = 'https://testnet.snowtrace.io/address/';
const SNOWTRACE_TX = 'https://testnet.snowtrace.io/tx/';

interface LeaderboardStats {
  agentPersonas: number;
  activePilots: number;
  enrolledWallets: number;
  totalTransactions: number;
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
}

interface LeaderboardData {
  stats: LeaderboardStats;
  rows: LeaderboardRow[];
}

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

function shortAddr(addr: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardTerminal() {
  const { account } = useWallet();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [error, setError] = useState('');

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
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!account) {
      setDisplayName('');
      setNameInput('');
      return;
    }
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
    setSavingName(true);
    setNameMsg('');
    try {
      const res = await fetch('/api/agents/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: account, displayName: nameInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save name');
      setDisplayName(json.displayName);
      setNameMsg('Display name saved — it will show on the leaderboard.');
    } catch (e: any) {
      setNameMsg(e.message || 'Save failed');
    } finally {
      setSavingName(false);
    }
  };

  const stats = data?.stats;
  const rows = data?.rows || [];
  const needsName = account && !displayName;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 64px' }}>
      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ PILOT RANKINGS</p>
        <h1 style={{ ...S.serif, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
          Leaderboard
        </h1>
        <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10, maxWidth: 620 }}>
          Pilots ranked by confirmed agent trades on this app. No baskets — only real buy transactions from our players.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, border: '2px solid #0D0B08', marginBottom: 24 }}>
        <StatBlock label="Agent personas" value={stats?.agentPersonas ?? '—'} hint="AvaStrike, PeakMind, FrostLogic, SubnetSage" />
        <StatBlock label="Active pilots" value={stats?.activePilots ?? '—'} hint={`${stats?.enrolledWallets ?? 0} wallets enrolled`} border />
        <StatBlock label="Total transactions" value={stats?.totalTransactions?.toLocaleString() ?? '—'} hint="Agent BUY clips on-chain" border />
      </div>

      {/* First-time / display name setup */}
      {account ? (
        <div style={{
          border: needsName ? '2px solid #F69D39' : '1px solid #0D0B08',
          background: needsName ? 'rgba(246,157,57,0.06)' : 'transparent',
          padding: '20px 24px', marginBottom: 24,
        }}>
          <p style={{ ...S.label, color: needsName ? '#C0392B' : '#888' }}>
            {needsName ? '◆ Set up your pilot name' : 'Your display name'}
          </p>
          <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', marginTop: 6 }}>
            {needsName
              ? 'First time here? Pick a name — saved to your wallet and shown on the leaderboard.'
              : 'Shown on the leaderboard next to your wallet address.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={displayName || 'e.g. Bruceeee'}
              maxLength={32}
              style={{
                flex: '1 1 200px', border: '1px solid #0D0B08', background: '#FAF8F3',
                padding: '10px 14px', ...S.mono, fontSize: 13, color: '#0D0B08', outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingName}
              style={{
                background: '#0D0B08', color: '#FAF8F3', border: 'none',
                padding: '10px 24px', ...S.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                opacity: savingName ? 0.5 : 1,
              }}
            >
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </div>
          {nameMsg ? (
            <p style={{ ...S.mono, fontSize: 11, color: '#27AE60', marginTop: 8 }}>{nameMsg}</p>
          ) : null}
        </div>
      ) : (
        <p style={{ ...S.mono, fontSize: 11, color: '#888', marginBottom: 24 }}>
          Connect your wallet to set your pilot name and appear on the board.
        </p>
      )}

      {/* Snowtrace links */}
      <div style={{ border: '1px solid rgba(13,11,8,0.2)', padding: '14px 18px', marginBottom: 24, ...S.mono, fontSize: 11, color: '#888' }}>
        <p style={{ fontWeight: 700, color: '#0D0B08', marginBottom: 6 }}>View transactions on Snowtrace (Fuji)</p>
        <p>
          Market contract:{' '}
          <a href={`${SNOWTRACE_ADDRESS}${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: '#27AE60' }}>
            {shortAddr(CONTRACT_ADDRESS)}
          </a>
        </p>
        {account ? (
          <p style={{ marginTop: 4 }}>
            Your wallet:{' '}
            <a href={`${SNOWTRACE_ADDRESS}${account}`} target="_blank" rel="noopener noreferrer" style={{ color: '#27AE60' }}>
              {shortAddr(account)}
            </a>
          </p>
        ) : null}
      </div>

      {error ? (
        <div style={{ border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 24 }}>
          {error}
        </div>
      ) : null}

      {/* Rankings table */}
      <div style={{ border: '2px solid #0D0B08', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #0D0B08', padding: '12px 16px', background: 'rgba(13,11,8,0.04)' }}>
          <p style={S.label}>Ranked pilots</p>
          <p style={{ ...S.mono, fontSize: 10, color: '#888' }}>
            Showing {rows.length} wallet{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #0D0B08' }}>
              {['#', 'Pilot', 'Agent', 'Transactions'].map((h, i) => (
                <th key={h} style={{
                  ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#888', padding: '12px 16px',
                  textAlign: i === 3 ? 'right' : 'left',
                  borderRight: i < 3 ? '1px solid rgba(13,11,8,0.12)' : 'none',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.wallet}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(13,11,8,0.1)' : 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,11,8,0.03)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#F69D39', padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>
                  {row.rank}
                </td>
                <td style={{ padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>
                  <p style={{ ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                    {row.displayName || 'Anonymous pilot'}
                  </p>
                  <a
                    href={`${SNOWTRACE_ADDRESS}${row.wallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...S.mono, fontSize: 10, color: '#888', textDecoration: 'none' }}
                  >
                    {row.wallet}
                  </a>
                </td>
                <td style={{ ...S.mono, fontSize: 12, color: '#5A554E', padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>
                  {row.agentName || row.agentId}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                  <span style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: '#27AE60' }}>
                    {row.txCount} tx
                  </span>
                  {row.lastTxHash ? (
                    <a
                      href={`${SNOWTRACE_TX}${row.lastTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', ...S.mono, fontSize: 9, color: '#888', marginTop: 4, textDecoration: 'none' }}
                    >
                      latest on Snowtrace
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', padding: '40px 16px', textAlign: 'center' }}>
            No agent trades yet.{' '}
            <Link href="/agents/new" style={{ color: '#C0392B' }}>Deploy an agent</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatBlock({ label, value, hint, border }: { label: string; value: string | number; hint: string; border?: boolean }) {
  return (
    <div style={{
      padding: '20px 24px',
      borderLeft: border ? '1px solid #0D0B08' : 'none',
    }}>
      <p style={S.label}>{label}</p>
      <p style={{ ...S.serif, fontSize: 32, fontWeight: 900, color: '#0D0B08', margin: '6px 0 0' }}>{value}</p>
      <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 6 }}>{hint}</p>
    </div>
  );
}
