import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { Flame, Trophy, TrendingUp, Calendar, Star, Twitter, Send, Target, Award, Lock, Sparkles, Activity } from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

interface BreakdownEntry {
  xp: number;
  label: string;
}

interface XpData {
  total: number;
  level: number;
  nextLevelXp: number;
  progressXp: number;
  progressPct: number;
  winRate: number;
  avgDailyTxs: number;
  breakdown: {
    trades: BreakdownEntry;
    wins: BreakdownEntry;
    streak: BreakdownEntry;
    twitter: BreakdownEntry;
    telegram: BreakdownEntry;
    milestones: BreakdownEntry;
  };
  streak: {
    current: number;
    longest: number;
    activeDays: number;
    lastActiveDate: string | null;
  };
}

// ─── style tokens (newspaper ink) ─────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
const serif: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };
const label: React.CSSProperties = {
  ...mono, fontSize: 9, fontWeight: 700,
  letterSpacing: '0.18em', textTransform: 'uppercase', color: '#888',
};
const card: React.CSSProperties = {
  border: '1px solid #0D0B08',
  padding: '18px 22px',
  background: 'transparent',
};

// ─── XP progress bar ──────────────────────────────────────────────────────────

function XpBar({ pct, level }: { pct: number; level: number }) {
  return (
    <div>
      <div
        style={{
          height: 10,
          background: 'rgba(13,11,8,0.08)',
          overflow: 'hidden',
          border: '1px solid #0D0B08',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: '#0D0B08',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 5,
        }}
      >
        <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#0D0B08' }}>LVL {level}</span>
        <span style={{ ...mono, fontSize: 10, color: '#888' }}>
          {pct}% → LVL {level + 1}
        </span>
      </div>
    </div>
  );
}

// ─── Streak flame display ─────────────────────────────────────────────────────

function StreakDisplay({ streak }: { streak: XpData['streak'] }) {
  const { current, longest, activeDays, lastActiveDate } = streak;

  const today = new Date().toISOString().split('T')[0];
  const isActiveToday = lastActiveDate === today;

  const flameColor = current >= 7 ? '#C0392B' : current >= 3 ? '#F69D39' : '#888';

  return (
    <div style={card}>
      <p style={{ ...label, marginBottom: 14 }}>Trading Streak</p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Current streak */}
        <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 34,
              filter: current === 0 ? 'grayscale(1) opacity(0.4)' : 'none',
            }}
          >
            <Flame size={26} color={flameColor} strokeWidth={1.5} />
          </div>
          <div style={{ ...serif, fontSize: 28, fontWeight: 900, color: current > 0 ? '#0D0B08' : '#888', lineHeight: 1.1, marginTop: 4 }}>
            {current}
          </div>
          <div style={{ ...label, marginTop: 4 }}>Day Streak</div>
          {isActiveToday && current > 0 && (
            <div style={{ ...mono, fontSize: 9, color: '#27AE60', marginTop: 3 }}>
              ✓ Active today
            </div>
          )}
          {!isActiveToday && current === 0 && (
            <div style={{ ...mono, fontSize: 9, color: '#888', marginTop: 3 }}>
              Trade today to start!
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 60, background: 'rgba(13,11,8,0.15)' }} />

        {/* Longest streak */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ ...serif, fontSize: 24, fontWeight: 900, color: '#0D0B08' }}>{longest}</div>
          <div style={{ ...label, marginTop: 4 }}>Best Streak</div>
        </div>

        <div style={{ width: 1, height: 60, background: 'rgba(13,11,8,0.15)' }} />

        {/* Active days */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ ...serif, fontSize: 24, fontWeight: 900, color: '#0D0B08' }}>{activeDays}</div>
          <div style={{ ...label, marginTop: 4 }}>Active Days</div>
        </div>
      </div>

      {/* Streak milestones */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(13,11,8,0.1)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[3, 7, 14, 30].map((n) => (
          <div
            key={n}
            style={{
              ...mono,
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 10px',
              border: `1px solid ${current >= n ? '#0D0B08' : 'rgba(13,11,8,0.2)'}`,
              background: current >= n ? '#0D0B08' : 'transparent',
              color: current >= n ? '#FAF8F3' : '#B0A894',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {current >= n ? <Award size={11} strokeWidth={1.5} /> : <Lock size={10} strokeWidth={1.5} />} {n}-day
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── XP breakdown table ───────────────────────────────────────────────────────

function XpBreakdown({ breakdown }: { breakdown: XpData['breakdown'] }) {
  const rows = Object.entries(breakdown) as [string, BreakdownEntry][];
  const icons: Record<string, React.ReactNode> = {
    trades: <TrendingUp size={14} strokeWidth={1.5} />,
    wins: <Trophy size={14} strokeWidth={1.5} />,
    streak: <Flame size={14} strokeWidth={1.5} />,
    twitter: <Twitter size={14} strokeWidth={1.5} />,
    telegram: <Send size={14} strokeWidth={1.5} />,
    milestones: <Target size={14} strokeWidth={1.5} />,
  };

  return (
    <div style={card}>
      <p style={{ ...label, marginBottom: 12 }}>XP Breakdown</p>
      {rows.map(([key, entry], i) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 0',
            borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(13,11,8,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', color: '#5A554E' }}>{icons[key] || <Star size={14} strokeWidth={1.5} />}</span>
            <span style={{ ...mono, fontSize: 11, color: '#0D0B08' }}>{entry.label}</span>
          </div>
          <span
            style={{
              ...mono,
              fontSize: 12,
              fontWeight: 700,
              color: entry.xp > 0 ? '#27AE60' : '#B0A894',
              minWidth: 55,
              textAlign: 'right',
            }}
          >
            +{entry.xp} XP
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Activity stats — ruled columnar strip ───────────────────────────────────

function ActivityStats({ xp }: { xp: XpData }) {
  const cells = [
    {
      icon: <Activity size={16} strokeWidth={1.5} />,
      value: xp.winRate !== null ? `${xp.winRate}%` : '–',
      label: 'Win Rate',
      color: xp.winRate >= 60 ? '#27AE60' : xp.winRate >= 45 ? '#F69D39' : '#C0392B',
    },
    {
      icon: <TrendingUp size={16} strokeWidth={1.5} />,
      value: xp.avgDailyTxs,
      label: 'Avg Daily Txs',
      color: '#0D0B08',
    },
    {
      icon: <Flame size={16} strokeWidth={1.5} />,
      value: xp.streak.current,
      label: 'Current Streak',
      color: '#F69D39',
    },
    {
      icon: <Calendar size={16} strokeWidth={1.5} />,
      value: xp.streak.activeDays,
      label: 'Active Days',
      color: '#0D0B08',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        border: '1px solid #0D0B08',
        marginBottom: 16,
      }}
    >
      {cells.map(({ icon, value, label: cellLabel, color }, idx) => (
        <div
          key={cellLabel}
          style={{
            textAlign: 'center',
            padding: '16px 10px',
            borderLeft: idx === 0 ? 'none' : '1px solid rgba(13,11,8,0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', color: '#888', marginBottom: 6 }}>
            {icon}
          </div>
          <div style={{ ...serif, fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
          <div style={{ ...label, marginTop: 6 }}>{cellLabel}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Level card with progress ─────────────────────────────────────────────────

function LevelCard({ xp }: { xp: XpData }) {
  const rankLabel =
    xp.level >= 20 ? 'Legendary Trader' :
    xp.level >= 15 ? 'Elite Strategist' :
    xp.level >= 10 ? 'Market Maven' :
    xp.level >= 7  ? 'Sharp Analyst' :
    xp.level >= 4  ? 'Active Trader' :
    xp.level >= 2  ? 'Emerging Pilot' :
    'Rookie Pilot';

  const renderRankIcon = () => {
    const props = { size: 26, strokeWidth: 1.5, color: '#FAF8F3' };
    if (xp.level >= 20) return <Trophy {...props} />;
    if (xp.level >= 15) return <Sparkles {...props} />;
    if (xp.level >= 10) return <Star {...props} />;
    if (xp.level >= 7) return <Flame {...props} />;
    if (xp.level >= 4) return <Activity {...props} />;
    return <Star {...props} />;
  };

  return (
    <div
      style={{
        border: '2px solid #0D0B08',
        padding: '20px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          background: '#0D0B08',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {renderRankIcon()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ ...label, marginBottom: 4 }}>
          Level {xp.level} · {rankLabel}
        </div>
        <div style={{ ...serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', lineHeight: 1.1 }}>
          {xp.total.toLocaleString()} XP
        </div>
        <div style={{ ...mono, fontSize: 10, color: '#888', marginTop: 2 }}>
          {xp.progressXp} / 500 XP toward Level {xp.level + 1}
        </div>
        <div style={{ marginTop: 10 }}>
          <XpBar pct={xp.progressPct} level={xp.level} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function XpDashboard() {
  const { account: address, connectWallet } = useWallet();
  const isConnected = !!address;
  const [xp, setXp] = useState<XpData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/history?wallet=${address}`);
      if (r.ok) {
        const d = await r.json();
        if (d.xp) setXp(d.xp);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  if (!isConnected || !address) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: '#5A554E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#888', marginBottom: 12 }}>
          <Star size={30} strokeWidth={1.5} />
        </div>
        <div style={{ ...serif, fontSize: 15, marginBottom: 16 }}>Connect your wallet to see your XP & stats.</div>
        <button
          onClick={connectWallet}
          style={{
            ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
            background: '#0D0B08', color: '#FAF8F3', border: 'none',
            padding: '12px 28px', cursor: 'pointer',
          }}
        >
          CONNECT WALLET
        </button>
      </div>
    );
  }

  if (loading && !xp) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 40, color: '#5A554E' }}>
        <div style={{ ...mono, fontSize: 12 }}>Loading XP data…</div>
      </div>
    );
  }

  if (!xp) return null;

  const hintIcons: Record<string, React.ReactNode> = {
    trades: <TrendingUp size={13} strokeWidth={1.5} />,
    wins: <Trophy size={13} strokeWidth={1.5} />,
    streak: <Flame size={13} strokeWidth={1.5} />,
    twitter: <Twitter size={13} strokeWidth={1.5} />,
    telegram: <Send size={13} strokeWidth={1.5} />,
    milestones: <Target size={13} strokeWidth={1.5} />,
    rate: <Activity size={13} strokeWidth={1.5} />,
  };

  return (
    <div>
      {/* Section header + refresh */}
      <div className="np-fade-up" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '3px double #0D0B08', paddingBottom: 10, marginBottom: 18 }}>
        <h2 style={{ ...serif, fontSize: 22, fontWeight: 900, color: '#0D0B08', margin: 0 }}>XP & Standing</h2>
        <button
          onClick={load}
          style={{
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            border: '1px solid #0D0B08',
            cursor: 'pointer',
            background: 'transparent',
            color: '#5A554E',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Level card */}
      <div className="np-fade-up-1">
        <LevelCard xp={xp} />
      </div>

      {/* Activity stats strip */}
      <div className="np-fade-up-2">
        <ActivityStats xp={xp} />
      </div>

      {/* Streak + breakdown side by side on wide screens */}
      <div className="np-fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StreakDisplay streak={xp.streak} />
        <XpBreakdown breakdown={xp.breakdown} />
      </div>

      {/* Unlock hints */}
      <div className="np-fade-up-4" style={card}>
        <p style={{ ...label, marginBottom: 14 }}>How to earn more XP</p>
        {[
          { key: 'trades', text: '2 XP per trade placed by your agent' },
          { key: 'wins', text: '5 XP per winning round' },
          { key: 'streak', text: 'Up to 100 XP from daily streak bonuses' },
          { key: 'twitter', text: '50 XP for following @clawxlabs on X' },
          { key: 'telegram', text: '50 XP for joining ClawXLabs🔺 on Telegram' },
          { key: 'milestones', text: 'Milestone bonuses at 10, 50, 100, 500 trades' },
          { key: 'rate', text: 'Win-rate bonuses: 50 XP at ≥50%, up to 200 XP at ≥70%' },
        ].map(({ key, text }) => (
          <div key={text} style={{ ...mono, fontSize: 11, color: '#0D0B08', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', color: '#888' }}>{hintIcons[key]}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
