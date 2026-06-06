import { TrendingUp, TrendingDown, Clock, DollarSign, ArrowRight } from 'lucide-react';

/* ─── Newspaper palette ──────────────────────────────────────────── */
const NP = {
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
};

/* ─── Types ──────────────────────────────────────────────────────── */
interface Market {
  asset: string;
  color: string;
  currentPrice: number;
  startPrice: number;
  totalUpPool: number;
  totalDownPool: number;
  endTime: number;
  resolved: boolean;
  upWins?: boolean;
}

interface MarketCardProps {
  market: Market;
  onSelect: () => void;
  onTakePosition?: (side: string) => void;
  onResolveMarket?: () => void;
  onClaimWinnings?: () => void;
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function MarketCard({ market, onSelect }: MarketCardProps) {
  const currentPrice = market.currentPrice / 1e8;
  const startPrice = market.startPrice / 1e8;
  const priceChange = ((currentPrice - startPrice) / startPrice * 100).toFixed(2);
  const isUp = currentPrice > startPrice;

  const totalPool = market.totalUpPool + market.totalDownPool;
  const upPercentage = totalPool > 0
    ? (market.totalUpPool / (market.totalUpPool + market.totalDownPool) * 100).toFixed(1)
    : '50.0';
  const downPercentage = totalPool > 0
    ? (market.totalDownPool / (market.totalUpPool + market.totalDownPool) * 100).toFixed(1)
    : '50.0';

  const timeRemaining = market.endTime * 1000 - Date.now();
  const minutesRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60)));
  const isExpired = minutesRemaining === 0;

  return (
    <div
      style={{
        border: '1px solid #0D0B08',
        padding: '24px 20px',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(13,11,8,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ ...NP.serif, fontSize: 20, fontWeight: 900, color: '#0D0B08', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: market.color }}>{market.asset}</span>
          </h3>
          <p style={{ ...NP.mono, fontSize: 10, color: '#888', marginTop: 2 }}>Up or Down (5m)</p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isUp
              ? <TrendingUp style={{ width: 14, height: 14, color: '#27AE60' }} />
              : <TrendingDown style={{ width: 14, height: 14, color: '#C0392B' }} />}
            <span style={{ ...NP.serif, fontSize: 18, fontWeight: 900, color: isUp ? '#27AE60' : '#C0392B' }}>
              ${currentPrice.toFixed(2)}
            </span>
          </div>
          <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: isUp ? '#27AE60' : '#C0392B' }}>
            {isUp ? '+' : ''}{priceChange}%
          </span>
        </div>
      </div>

      {/* UP / DOWN pools */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* UP pool */}
        <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#27AE60' }}>UP</span>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: '#27AE60' }}>{upPercentage}%</span>
          </div>
          <div style={{ width: '100%', background: 'rgba(13,11,8,0.08)', height: 3 }}>
            <div style={{ background: '#27AE60', height: 3, width: `${upPercentage}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ ...NP.mono, fontSize: 9, color: '#888', marginTop: 6 }}>
            {market.totalUpPool.toFixed(2)} AVAX
          </div>
        </div>

        {/* DOWN pool */}
        <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '12px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#C0392B' }}>DOWN</span>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: '#C0392B' }}>{downPercentage}%</span>
          </div>
          <div style={{ width: '100%', background: 'rgba(13,11,8,0.08)', height: 3 }}>
            <div style={{ background: '#C0392B', height: 3, width: `${downPercentage}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ ...NP.mono, fontSize: 9, color: '#888', marginTop: 6 }}>
            {market.totalDownPool.toFixed(2)} AVAX
          </div>
        </div>
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5A554E' }}>
          <Clock style={{ width: 14, height: 14 }} />
          <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700 }}>
            {market.resolved ? 'Resolved' : isExpired ? 'Expired' : `${minutesRemaining}m left`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5A554E' }}>
          <DollarSign style={{ width: 14, height: 14 }} />
          <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700 }}>{totalPool.toFixed(2)} AVAX</span>
        </div>
      </div>

      {/* CTA button */}
      <button
        onClick={() => onSelect()}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: '#0D0B08',
          color: '#FAF8F3',
          border: 'none',
          ...NP.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {market.resolved ? 'VIEW RESULTS' : isExpired ? 'RESOLVE MARKET' : 'TRADE'}
        <ArrowRight style={{ width: 14, height: 14 }} />
      </button>

      {/* Result badge */}
      {market.resolved && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          border: '1px solid rgba(13,11,8,0.15)',
          textAlign: 'center',
        }}>
          <span style={{
            ...NP.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: market.upWins ? '#27AE60' : '#C0392B',
          }}>
            {market.upWins ? '● UP WON' : '● DOWN WON'}
          </span>
        </div>
      )}
    </div>
  );
}
