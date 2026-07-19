import Head from 'next/head';
import { useState } from 'react';
import AppShell from '../components/AppShell';
import ProfileTerminal from '../components/ProfileTerminal';
import PersonalAgentsTab from '../components/PersonalAgentsTab';
import XpDashboard from '../components/XpDashboard';
import AgentSettingsPanel from '../components/AgentSettingsPanel';

import { User, Bot, Star, Settings } from 'lucide-react';

type Tab = 'overview' | 'agents' | 'xp' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview',    icon: <User size={15} strokeWidth={1.5} /> },
  { id: 'agents',   label: 'My Agents',   icon: <Bot size={15} strokeWidth={1.5} /> },
  { id: 'xp',       label: 'XP & Stats',  icon: <Star size={15} strokeWidth={1.5} /> },
  { id: 'settings', label: 'Agent AI', icon: <Settings size={15} strokeWidth={1.5} /> },
];

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <>
      <Head>
        <title>Profile · ClawX</title>
        <meta name="description" content="Profile, balances, agents and trade history." />
      </Head>
      <AppShell>
        {/* ── Tab bar ───────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '0 0 0 2px',
            marginBottom: 0,
            borderBottom: '2px solid #D4A96A',
          }}
        >
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  ...mono,
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 500,
                  padding: '9px 20px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #D4A96A' : '2px solid transparent',
                  marginBottom: -2,
                  background: isActive ? '#FDF6EC' : 'transparent',
                  color: isActive ? '#0D0B08' : '#7B6A52',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ───────────────────────────────────────────── */}
        <div
          style={{
            background: '#FDF6EC',
            border: '1.5px solid #D4A96A',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            /* Overview tab manages its own padding internally */
            padding: activeTab === 'overview' ? 0 : '24px 24px 32px',
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
