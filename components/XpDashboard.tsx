import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { Flame, Trophy, TrendingUp, Calendar, Star, Milestone, Twitter, Send, Target, Award, Lock, Sparkles, Activity } from 'lucide-react';

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

// ─── style tokens ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
const serif: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };
const card: React.CSSProperties = {
  background: '#FDF6EC',
  border: '1.5px solid #D4A96A',
  borderRadius: 10,
  padding: '18px 22px',
};

// ─── XP progress bar ──────────────────────────────────────────────────────────

function XpBar({ pct, level }: { pct: number; level: number }) {
  return (
    <div>
      <div
        style={{
          height: 12,
          background: '#F0E4CE',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid #D4A96A',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: 'linear-gradient(90deg, #D4A96A 0%, #E8C87A 100%)',
            borderRadius: 6,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
        }}
      >
        <span style={{ ...mono, fontSize: 10, color: '#7B6A52' }}>LVL {level}</span>
        <span style={{ ...mono, fontSize: 10, color: '#7B6A52' }}>
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

  const flameColor = current >= 7 ? '#E84142' : current >= 3 ? '#f59e0b' : '#D4A96A';

  return (
    <div style={{ ...card }}>
      <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 12 }}>TRADING STREAK</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Current streak */}
        <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 36,
              filter: current === 0 ? 'grayscale(1) opacity(0.4)' : 'none',
            }}
          >
            <Flame size={28} color={flameColor} strokeWidth={1.5} />
          </div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 900, color: flameColor, lineHeight: 1.1, marginTop: 4 }}>
            {current}
          </div>
          <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 2 }}>
            {current === 1 ? 'DAY STREAK' : 'DAY STREAK'}
          </div>
          {isActiveToday && current > 0 && (
            <div style={{ ...mono, fontSize: 9, color: '#22c55e', marginTop: 3 }}>
              ✓ Active today
            </div>
          )}
          {!isActiveToday && current === 0 && (
            <div style={{ ...mono, fontSize: 9, color: '#888', marginTop: 3 }}>
              Trade today to start!
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 60, background: '#E8D5B0' }} />

        {/* Longest streak */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: '#0D0B08' }}>{longest}</div>
          <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 2 }}>BEST STREAK</div>
        </div>

        <div style={{ width: 1, height: 60, background: '#E8D5B0' }} />

        {/* Active days */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: '#0D0B08' }}>{activeDays}</div>
          <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 2 }}>ACTIVE DAYS</div>
        </div>
      </div>

      {/* Streak milestones */}
      <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[3, 7, 14, 30].map((n) => (
          <div
            key={n}
            style={{
              ...mono,
              fontSize: 10,
              padding: '4px 8px',
              borderRadius: 5,
              border: `1px solid ${current >= n ? '#D4A96A' : '#E8D5B0'}`,
              background: current >= n ? '#D4A96A22' : 'transparent',
              color: current >= n ? '#7B5E2A' : '#C0A878',
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
    <div style={{ ...card }}>
      <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 12 }}>XP BREAKDOWN</div>
      {rows.map(([key, entry]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: '1px solid #F0E4CE',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', color: '#D4A96A' }}>{icons[key] || <Star size={14} strokeWidth={1.5} />}</span>
            <span style={{ ...mono, fontSize: 11, color: '#0D0B08' }}>{entry.label}</span>
          </div>
          <span
            style={{
              ...mono,
              fontSize: 12,
              fontWeight: 700,
              color: entry.xp > 0 ? '#D4A96A' : '#C0A878',
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

// ─── Activity stats ───────────────────────────────────────────────────────────

function ActivityStats({ xp }: { xp: XpData }) {
  const statCards = [
    {
      icon: <Activity size={20} strokeWidth={1.5} />,
      value: xp.winRate !== null ? `${xp.winRate}%` : '–',
      label: 'Win Rate',
      color: xp.winRate >= 60 ? '#22c55e' : xp.winRate >= 45 ? '#f59e0b' : '#ef4444',
    },
    {
      icon: <Activity size={20} strokeWidth={1.5} />, // fallback/different
      value: xp.avgDailyTxs,
      label: 'Avg Daily Txs',
      color: '#3b82f6',
    },
    {
      icon: <Flame size={20} strokeWidth={1.5} />,
      value: xp.streak.current,
      label: 'Current Streak',
      color: '#f59e0b',
    },
    {
      icon: <Calendar size={20} strokeWidth={1.5} />,
      value: xp.streak.activeDays,
      label: 'Active Days',
      color: '#8b5cf6',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}
    >
      {statCards.map(({ icon, value, label, color }, idx) => (
        <div
          key={label}
          style={{
            ...card,
            textAlign: 'center',
            padding: '14px 10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', color: color || '#7B6A52', marginBottom: 6 }}>
            {idx === 1 ? <TrendingUp size={20} strokeWidth={1.5} /> : icon}
          </div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color }}>{value}</div>
          <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 2 }}>{label}</div>
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
    const props = { size: 28, strokeWidth: 1.5, color: '#FAF8F3' };
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
        ...card,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        marginBottom: 16,
        background: 'linear-gradient(135deg, #FDF6EC 60%, #FFF8E8)',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #D4A96A, #E8C87A)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 12px #D4A96A44',
        }}
      >
        {renderRankIcon()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginBottom: 2 }}>
          LEVEL {xp.level} · {rankLabel}
        </div>
        <div style={{ ...serif, fontSize: 18, fontWeight: 900, color: '#0D0B08' }}>
          {xp.total.toLocaleString()} XP
        </div>
        <div style={{ ...mono, fontSize: 10, color: '#7B6A52', marginTop: 1 }}>
          {xp.progressXp} / 500 XP toward Level {xp.level + 1}
        </div>
        <div style={{ marginTop: 8 }}>
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
      <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: '#7B6A52', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#D4A96A', marginBottom: 12 }}>
          <Star size={32} strokeWidth={1.5} />
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
      <div style={{ ...card, textAlign: 'center', padding: 40, color: '#7B6A52' }}>
        <div style={{ ...mono, fontSize: 13 }}>Loading XP data…</div>
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
      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={load}
          style={{
            ...mono,
            fontSize: 11,
            padding: '5px 12px',
            borderRadius: 7,
            border: '1px solid #D4A96A',
            cursor: 'pointer',
            background: 'transparent',
            color: '#7B6A52',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Level card */}
      <LevelCard xp={xp} />

      {/* Activity stats grid */}
      <ActivityStats xp={xp} />

      {/* Streak */}
      <div style={{ marginBottom: 14 }}>
        <StreakDisplay streak={xp.streak} />
      </div>

      {/* XP breakdown */}
      <XpBreakdown breakdown={xp.breakdown} />

      {/* Unlock hints */}
      <div
        style={{
          marginTop: 14,
          ...card,
          background: '#FFFBF4',
        }}
      >
        <div style={{ ...mono, fontSize: 11, color: '#7B6A52', marginBottom: 14 }}>HOW TO EARN MORE XP</div>
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
            <span style={{ display: 'flex', alignItems: 'center', color: '#D4A96A' }}>{hintIcons[key]}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
