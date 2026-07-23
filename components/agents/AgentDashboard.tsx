import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AgentIcon from './AgentIcon';
import AgentTradeLog from './AgentTradeLog';
import MatchHistoryPanel from './MatchHistoryPanel';
import PendingSettlementsPanel from './PendingSettlementsPanel';
import AgentControlBar from './AgentControlBar';
import { useWallet } from '../../contexts/WalletContext';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { marketTradePath } from '../../utils/marketLink';

const RED = '#C0392B';

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#888',
  } as React.CSSProperties,
  section: { border: '1px solid #0D0B08', padding: '20px 18px' } as React.CSSProperties,
};

export default function AgentDashboard() {
  const router = useRouter();
  const { account, connectWallet } = useWallet();
  const { status, error, stale, refresh } = useAgentStatus(3000);
  const [matchFilter, setMatchFilter] = useState<'win' | 'loss' | 'all'>('all');
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    if (status && !status.enrolled) router.replace('/agents/new');
  }, [status, router]);

  if (!account) {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
          Connect Wallet
        </h1>
        <p style={{ ...S.serif, fontSize: 15, color: '#5A554E', marginTop: 10 }}>
          Connect MetaMask on Fuji to view your agent.
        </p>
        <button
          type="button"
          onClick={connectWallet}
          style={{
            background: RED,
            color: '#FAF8F3',
            border: `1px solid ${RED}`,
            padding: '14px 28px',
            marginTop: 24,
            ...S.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (status && !status.enrolled) return null;

  const agent = status?.agent;
  const up = (status?.returnPct ?? 0) >= 0;
  const tr = status?.trackRecord;
  const delegate = status?.delegate;
  const isPaused = delegate?.paused;
  const statusLabel = delegate?.needsRedeploy
    ? 'Re-deploy required'
    : isPaused
      ? 'Paused'
      : 'Live';
  const statusColor = delegate?.needsRedeploy ? RED : isPaused ? '#F69D39' : '#27AE60';
  const openPositions = status?.openPositions || [];

  const metrics: Array<{
    label: string;
    value: string;
    color?: string;
    clickable?: boolean;
    onClick?: () => void;
  }> = [
    { label: 'AUM', value: `$${status?.aum?.toLocaleString() ?? '—'}` },
    {
      label: 'Return',
      value: `${up ? '▲ +' : '▼ '}${status?.returnPct ?? 0}%`,
      color: up ? '#27AE60' : RED,
    },
    { label: 'Open', value: String(openPositions.length) },
    {
      label: 'Wins',
      value: String(tr?.wins ?? 0),
      color: '#27AE60',
      clickable: true,
      onClick: () => {
        setMatchFilter('win');
        setMatchOpen(true);
      },
    },
    {
      label: 'Losses',
      value: String(tr?.losses ?? 0),
      color: RED,
      clickable: true,
      onClick: () => {
        setMatchFilter('loss');
        setMatchOpen(true);
      },
    },
    {
      label: 'Win rate',
      value: tr?.winRate != null ? `${tr.winRate}%` : '—',
      clickable: true,
      onClick: () => {
        setMatchFilter('all');
        setMatchOpen(true);
      },
    },
    {
      label: 'Budget left',
      value: delegate?.remainingTusdc != null ? `${delegate.remainingTusdc} TUSDC` : '—',
    },
    {
      label: 'Settled',
      value: String(tr?.settled ?? 0),
    },
    {
      label: 'Pending',
      value: String(status?.poolSummary?.pendingCount ?? status?.pendingSettlements?.length ?? 0),
    },
    {
      label: 'Net P&L',
      value:
        status?.poolSummary?.netPnlTusdc != null
          ? `${status.poolSummary.netPnlTusdc >= 0 ? '+' : ''}${status.poolSummary.netPnlTusdc} TUSDC`
          : '—',
      color:
        status?.poolSummary?.netPnlTusdc == null
          ? undefined
          : status.poolSummary.netPnlTusdc >= 0
            ? '#27AE60'
            : RED,
    },
  ];

  return (
    <>
      <MatchHistoryPanel
        open={matchOpen}
        filter={matchFilter}
        matches={status?.matchHistory || []}
        onClose={() => setMatchOpen(false)}
      />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 64px' }}>
        <Link href="/agents" style={{ textDecoration: 'none' }}>
          <span style={{ ...S.mono, fontSize: 11, color: '#888', display: 'inline-block', marginBottom: 16 }}>
            ← Agents
          </span>
        </Link>

        {(error || stale) && (
          <div
            style={{
              border: `1px solid ${stale ? '#F69D39' : RED}`,
              background: stale ? 'rgba(246,157,57,0.06)' : 'rgba(192,57,43,0.06)',
              padding: '12px 16px',
              ...S.mono,
              fontSize: 12,
              color: stale ? '#F69D39' : RED,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <section style={{ ...S.section, borderWidth: 2, marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  width: 52,
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #0D0B08',
                  background: `${agent?.color || RED}18`,
                }}
              >
                <AgentIcon agentId={agent?.id} size={26} color={agent?.color || RED} />
              </span>
              <div>
                <p
                  style={{
                    ...S.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: statusColor,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    margin: 0,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: statusColor,
                      display: 'inline-block',
                    }}
                  />
                  {statusLabel}
                </p>
                <h1
                  style={{
                    ...S.serif,
                    fontSize: 24,
                    fontWeight: 900,
                    color: '#0D0B08',
                    margin: '4px 0 0',
                  }}
                >
                  {agent?.name}
                </h1>
                <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  {agent?.handle} · {status?.enrollment?.tradeSizeTusdc ?? '—'} TUSDC / trade
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <AgentControlBar
              wallet={account}
              activeAgentId={agent?.id}
              currentTradeSizeTusdc={status?.enrollment?.tradeSizeTusdc ?? null}
              forcedTradeSizeTusdc={status?.walletLimits?.agentTradeSizeTusdc ?? null}
              delegate={delegate}
              walletLimits={status?.walletLimits}
              pendingControl={status?.pendingControl}
              onRefresh={() => refresh({ silent: true })}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 0,
              marginTop: 20,
              borderTop: '1px solid #0D0B08',
            }}
          >
            {metrics.map((stat, i, arr) => (
              <div
                key={stat.label}
                role={stat.clickable ? 'button' : undefined}
                tabIndex={stat.clickable ? 0 : undefined}
                onClick={stat.onClick}
                onKeyDown={
                  stat.clickable
                    ? (e) => {
                        if (e.key === 'Enter') stat.onClick?.();
                      }
                    : undefined
                }
                style={{
                  padding: '14px 12px',
                  borderRight: i < arr.length - 1 ? '1px solid rgba(13,11,8,0.15)' : 'none',
                  cursor: stat.clickable ? 'pointer' : 'default',
                }}
              >
                <p style={S.label}>
                  {stat.label}
                  {stat.clickable ? ' ↗' : ''}
                </p>
                <p
                  style={{
                    ...S.serif,
                    fontSize: 18,
                    fontWeight: 900,
                    color: stat.color || '#0D0B08',
                    margin: '4px 0 0',
                  }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {openPositions.length > 0 ? (
            <div style={{ marginTop: 16, borderTop: '1px solid rgba(13,11,8,0.15)', paddingTop: 14 }}>
              <p style={{ ...S.label, marginBottom: 10 }}>Open positions · click to open market</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {openPositions.map((pos) => {
                  const href = marketTradePath({
                    assetId: pos.assetId,
                    symbol: pos.symbol,
                    roundId: pos.roundId,
                  });
                  const chip = (
                    <span
                      style={{
                        ...S.mono,
                        fontSize: 11,
                        border: '1px solid #0D0B08',
                        padding: '6px 10px',
                        display: 'inline-block',
                        color: '#0D0B08',
                        textDecoration: href ? 'underline' : 'none',
                        textUnderlineOffset: 3,
                        cursor: href ? 'pointer' : 'default',
                      }}
                    >
                      {pos.symbol} · R#{pos.roundNumber} ·{' '}
                      <strong style={{ color: pos.side === 'UP' ? '#27AE60' : RED }}>{pos.side}</strong>
                      {href ? ' ↗' : ''}
                    </span>
                  );
                  return href ? (
                    <Link key={pos.roundId} href={href} style={{ textDecoration: 'none' }}>
                      {chip}
                    </Link>
                  ) : (
                    <span key={pos.roundId}>{chip}</span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        {(status?.pendingSettlements?.length ?? 0) > 0 ? (
          <section style={{ ...S.section, marginBottom: 20 }}>
            <h2 style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: '0 0 12px' }}>
              Pending ({status?.pendingSettlements?.length})
            </h2>
            <PendingSettlementsPanel items={status?.pendingSettlements || []} />
          </section>
        ) : null}

        <section style={S.section}>
          <h2 style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: '0 0 12px' }}>
            Recent trades
          </h2>
          <AgentTradeLog
            trades={(status?.enrichedTradeLog || status?.tradeLog || []).slice(0, 40)}
            poolSummary={status?.poolSummary}
          />
        </section>
      </div>
    </>
  );
}
