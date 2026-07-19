import Head from 'next/head';
import { useState } from 'react';
import AppShell from '../components/AppShell';
import ProfileTerminal from '../components/ProfileTerminal';
import PersonalAgentsTab from '../components/PersonalAgentsTab';
import XpDashboard from '../components/XpDashboard';
import AgentSettingsPanel from '../components/AgentSettingsPanel';

import { User, Bot, Star, Settings } from 'lucide-react';

type Tab = 'overview' | 'agents' | 'xp' | 'settings';

const MAIN_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview',   icon: <User size={14} strokeWidth={1.75} /> },
  { id: 'agents',   label: 'My Agents',  icon: <Bot size={14} strokeWidth={1.75} /> },
  { id: 'xp',       label: 'XP & Stats', icon: <Star size={14} strokeWidth={1.75} /> },
];

const SETTINGS_TAB: { id: Tab; label: string; icon: React.ReactNode } =
  { id: 'settings', label: 'Settings', icon: <Settings size={14} strokeWidth={1.75} /> };

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

function TabButton({
  tab, isActive, onClick, alignRight = false,
}: {
  tab: { id: Tab; label: string; icon: React.ReactNode };
  isActive: boolean;
  onClick: () => void;
  alignRight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '10px 18px',
        border: 'none',
        borderBottom: isActive ? '3px solid #0D0B08' : '3px solid transparent',
        marginBottom: -2,
        marginLeft: alignRight ? 'auto' : 0,
        background: 'transparent',
        color: isActive ? '#0D0B08' : '#7B6A52',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>{tab.icon}</span>
      {tab.label}
    </button>
  );
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <>
      <Head>
        <title>Profile · ClawX</title>
        <meta name="description" content="Profile, balances, agents and trade history." />
      </Head>
      <AppShell>
        {/* ── Tab bar — Settings sits apart on the right ─────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 2,
            padding: '0 2px',
            borderBottom: '2px solid #0D0B08',
          }}
        >
          {MAIN_TABS.map((t) => (
            <TabButton
              key={t.id}
              tab={t}
              isActive={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            />
          ))}
          <TabButton
            tab={SETTINGS_TAB}
            isActive={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            alignRight
          />
        </div>

        {/* ── Tab content — same paper background as the market screens ── */}
        <div
          key={activeTab}
          className="np-fade-up"
          style={{
            /* Overview tab manages its own padding internally */
            padding: activeTab === 'overview' ? 0 : '28px 24px 40px',
            maxWidth: activeTab === 'overview' ? undefined : 860,
            margin: activeTab === 'overview' ? undefined : '0 auto',
          }}
        >
          {activeTab === 'overview' && <ProfileTerminal />}
          {activeTab === 'agents'   && <PersonalAgentsTab />}
          {activeTab === 'xp'       && <XpDashboard />}
          {activeTab === 'settings' && <AgentSettingsPanel />}
        </div>
      </AppShell>
    </>
  );
}
