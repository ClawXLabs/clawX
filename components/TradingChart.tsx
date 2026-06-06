import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';

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

import { MarketInfo, PriceTick } from '../contexts/MarketDataContext';

interface TradingChartProps {
  market: MarketInfo;
  history?: PriceTick[];
  onTakePosition: (id: number, isUp: boolean, amount: string) => Promise<void>;
  onResolveMarket: (id: number) => void;
  onClaimWinnings: (id: number) => void;
  tokenSymbol?: string;
}

/* ─── Custom Tooltip ─────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#FAF8F3',
      border: '1px solid #0D0B08',
      padding: '8px 12px',
      ...NP.mono,
      fontSize: 11,
    }}>
      <p style={{ margin: 0, color: '#888', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 700, color: '#0D0B08' }}>
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function TradingChart({ market, history, onTakePosition, onResolveMarket, onClaimWinnings, tokenSymbol = 'TUSDC' }: TradingChartProps) {
  const [betAmount, setBetAmount] = useState('');
  const [selectedSide, setSelectedSide] = useState('');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (history && history.length > 0) {
      setPriceHistory(history.map(h => ({
        time: new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: h.price,
        timestamp: h.t,
      })));
      return;
    }

    const generateMockData = (): any[] => {
      const data: any[] = [];
      const basePrice = market.startPrice;
      const now = Date.now();

      for (let i = 10; i >= 0; i--) {
        const time = new Date(now - (i * 5 * 60 * 1000));
        const randomVariation = (Math.random() - 0.5) * 0.02;
        const price = basePrice * (1 + randomVariation);

        data.push({
          time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: parseFloat(price.toFixed(2)),
          timestamp: time.getTime(),
        });
      }
      return data;
    };

    setPriceHistory(generateMockData());
  }, [market, history]);

  const handlePlaceBet = async () => {
    if (!betAmount || !selectedSide) return;
    setLoading(true);
    try {
      await onTakePosition(market.assetId, selectedSide === 'up', betAmount);
      setBetAmount('');
      setSelectedSide('');
    } catch (error) {
      console.error('Error placing bet:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = market.currentPrice;
  const startPrice = market.startPrice;
  const priceChange = startPrice > 0 ? ((currentPrice - startPrice) / startPrice * 100).toFixed(2) : '0.00';
  const isUp = currentPrice >= startPrice;

  const totalPool = market.upPool + market.downPool;
  const upPercentage = totalPool > 0 ? (market.upPool / totalPool * 100).toFixed(1) : '50.0';
  const downPercentage = totalPool > 0 ? (market.downPool / totalPool * 100).toFixed(1) : '50.0';

  const timeRemaining = market.endTime * 1000 - Date.now();
  const minutesRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60)));

  const accentColor = isUp ? '#27AE60' : '#C0392B';

  return (
    <div style={{ border: '1px solid #0D0B08', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h3 style={{ ...NP.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: market.color }}>{market.symbol}</span>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: '#888' }}>Up or Down (5m)</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isUp
                ? <TrendingUp style={{ width: 14, height: 14, color: '#27AE60' }} />
                : <TrendingDown style={{ width: 14, height: 14, color: '#C0392B' }} />}
              <span style={{ ...NP.serif, fontSize: 18, fontWeight: 900, color: accentColor }}>
                ${currentPrice.toFixed(2)}
              </span>
            </div>
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: accentColor }}>
              {isUp ? '+' : ''}{priceChange}%
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5A554E' }}>
            <Clock style={{ width: 14, height: 14 }} />
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700 }}>{minutesRemaining}m left</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5A554E', marginTop: 4 }}>
            <DollarSign style={{ width: 14, height: 14 }} />
            <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700 }}>{totalPool.toFixed(2)} {tokenSymbol} pool</span>
          </div>
        </div>
      </div>

      {/* ── Recharts Area Chart ── */}
      <div style={{ border: '1px solid #0D0B08', padding: 16, marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={priceHistory} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="npChartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.12} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 6"
              stroke="rgba(13,11,8,0.1)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="rgba(13,11,8,0.3)"
              tick={{ fill: '#888', fontSize: 9, fontFamily: '"Courier New", monospace', fontWeight: 700 }}
              tickLine={false}
              axisLine={{ stroke: '#0D0B08', strokeWidth: 1 }}
            />
            <YAxis
              stroke="rgba(13,11,8,0.3)"
              tick={{ fill: '#888', fontSize: 9, fontFamily: '"Courier New", monospace', fontWeight: 700 }}
              tickLine={false}
              axisLine={{ stroke: '#0D0B08', strokeWidth: 1 }}
              domain={['dataMin - 0.5', 'dataMax + 0.5']}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              y={startPrice}
              stroke="#F69D39"
              strokeDasharray="8 4"
              strokeWidth={1.5}
              label={{
                value: `Target $${startPrice.toFixed(2)}`,
                position: 'insideTopLeft',
                fill: '#F69D39',
                fontSize: 9,
                fontFamily: '"Courier New", monospace',
                fontWeight: 700,
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={accentColor}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#npChartFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: '#FAF8F3',
                stroke: accentColor,
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* UP / DOWN pools */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#27AE60' }}>UP</span>
            <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, color: '#27AE60' }}>{upPercentage}%</span>
          </div>
          <div style={{ width: '100%', background: 'rgba(13,11,8,0.08)', height: 4 }}>
            <div style={{ background: '#27AE60', height: 4, width: `${upPercentage}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ ...NP.mono, fontSize: 10, color: '#888', marginTop: 8 }}>Pool: {market.upPool.toFixed(2)} {tokenSymbol}</div>
        </div>

        <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#C0392B' }}>DOWN</span>
            <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, color: '#C0392B' }}>{downPercentage}%</span>
          </div>
          <div style={{ width: '100%', background: 'rgba(13,11,8,0.08)', height: 4 }}>
            <div style={{ background: '#C0392B', height: 4, width: `${downPercentage}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ ...NP.mono, fontSize: 10, color: '#888', marginTop: 8 }}>Pool: {market.downPool.toFixed(2)} {tokenSymbol}</div>
        </div>
      </div>

      {/* Trade / Resolve section */}
      {!market.resolved ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              onClick={() => setSelectedSide('up')}
              disabled={minutesRemaining === 0}
              style={{
                padding: '12px 16px',
                border: selectedSide === 'up' ? '2px solid #27AE60' : '1px solid #0D0B08',
                background: selectedSide === 'up' ? 'rgba(39,174,96,0.08)' : 'transparent',
                ...NP.mono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#0D0B08',
                cursor: minutesRemaining === 0 ? 'not-allowed' : 'pointer',
                opacity: minutesRemaining === 0 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <TrendingUp style={{ width: 16, height: 16 }} />
              UP
            </button>
            <button
              onClick={() => setSelectedSide('down')}
              disabled={minutesRemaining === 0}
              style={{
                padding: '12px 16px',
                border: selectedSide === 'down' ? '2px solid #C0392B' : '1px solid #0D0B08',
                background: selectedSide === 'down' ? 'rgba(192,57,43,0.08)' : 'transparent',
                ...NP.mono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#0D0B08',
                cursor: minutesRemaining === 0 ? 'not-allowed' : 'pointer',
                opacity: minutesRemaining === 0 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <TrendingDown style={{ width: 16, height: 16 }} />
              DOWN
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder={`Bet amount (${tokenSymbol})`}
              disabled={minutesRemaining === 0 || !selectedSide}
              style={{
                flex: 1,
                padding: '12px 14px',
                border: '1px solid #0D0B08',
                background: 'transparent',
                ...NP.mono,
                fontSize: 13,
                color: '#0D0B08',
                outline: 'none',
              }}
            />
            <button
              onClick={handlePlaceBet}
              disabled={!selectedSide || !betAmount || minutesRemaining === 0 || loading}
              style={{
                padding: '12px 24px',
                background: '#0D0B08',
                color: '#FAF8F3',
                border: 'none',
                ...NP.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: !selectedSide || !betAmount || minutesRemaining === 0 || loading ? 'not-allowed' : 'pointer',
                opacity: !selectedSide || !betAmount || minutesRemaining === 0 || loading ? 0.5 : 1,
              }}
            >
              {loading ? 'PLACING…' : 'PLACE BET'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ ...NP.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08' }}>
              Market Resolved: {market.upWins ? 'UP Wins!' : 'DOWN Wins!'}
            </span>
          </div>
          <button
            onClick={() => onClaimWinnings(market.assetId)}
            style={{
              padding: '12px 24px',
              background: '#27AE60',
              color: '#FAF8F3',
              border: 'none',
              ...NP.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            CLAIM WINNINGS
          </button>
        </div>
      )}

      {minutesRemaining === 0 && !market.resolved && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            onClick={() => onResolveMarket(market.assetId)}
            style={{
              padding: '12px 24px',
              background: '#F69D39',
              color: '#0D0B08',
              border: 'none',
              ...NP.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            RESOLVE MARKET
          </button>
        </div>
      )}
    </div>
  );
}
