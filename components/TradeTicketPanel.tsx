import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { MarketInfo } from '../contexts/MarketDataContext';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';

const NP = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#555',
  } as React.CSSProperties,
  bg: '#FAF8F3',
  ink: '#0D0B08',
  green: '#1E5E3A',
  red: '#8A1C14',
  border: '1px solid #0D0B08',
};

export interface TradeTicketPanelProps {
  market: MarketInfo;
  onTakePosition: (id: number, isUp: boolean, amount: string) => Promise<void>;
  onSellPosition?: (id: number, isUp: boolean, shares: string) => Promise<void>;
  onResolveMarket: (id: number) => Promise<void>;
  onClaimWinnings: (id: number) => Promise<void>;
  tokenSymbol?: string;
  isHistorical?: boolean;
  onReturnToLive?: () => void;
}

/** Buy/Sell ticket attached beside the market chart. */
export default function TradeTicketPanel({
  market,
  onTakePosition,
  onSellPosition,
  onResolveMarket,
  onClaimWinnings,
  tokenSymbol = 'TUSDC',
  isHistorical = false,
  onReturnToLive,
}: TradeTicketPanelProps) {
  const { account } = useWallet();
  const [side, setSide] = useState<'up' | 'down'>('up');
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [upShares, setUpShares] = useState(0);
  const [downShares, setDownShares] = useState(0);
  const [sellQuote, setSellQuote] = useState(0);

  useEffect(() => {
    if (isHistorical) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isHistorical]);

  const fetchShares = async () => {
    if (!account || !market?.roundId) {
      setUpShares(0);
      setDownShares(0);
      return;
    }
    try {
      const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const pos = await contract.getUserPosition(market.roundId, account);
      setUpShares(Number(ethers.formatUnits(pos.upShares, market.decimals)));
      setDownShares(Number(ethers.formatUnits(pos.downShares, market.decimals)));
    } catch (e) {
      console.error('Failed to fetch shares:', e);
    }
  };

  useEffect(() => {
    fetchShares();
  }, [account, market?.roundId, market?.decimals]);

  useEffect(() => {
    if (tradeMode !== 'sell' || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || !market?.roundId) {
      setSellQuote(0);
      return;
    }
    let active = true;
    const fetchQuote = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const sharesRaw = ethers.parseUnits(amount, market.decimals);
        const quote = await contract.quoteSell(market.roundId, side === 'up', sharesRaw);
        if (active) setSellQuote(Number(ethers.formatUnits(quote, market.decimals)));
      } catch {
        if (active) setSellQuote(0);
      }
    };
    fetchQuote();
    return () => {
      active = false;
    };
  }, [tradeMode, amount, side, market?.roundId, market?.decimals]);

  const msLeft = Math.max(0, market.endTime * 1000 - now);
  const isOpen = !isHistorical && !market.resolved && msLeft > 0;
  const isExpired = !isHistorical && !market.resolved && msLeft === 0;

  const totalPool = market.upPool + market.downPool || 1;
  const upPct = Math.round((market.upPool / totalPool) * 100);
  const downPct = 100 - upPct;
  const mult = upPct >= 50 ? (100 / upPct).toFixed(2) : (100 / downPct).toFixed(2);
  const priceIsUp = market.startPrice > 0
    ? market.currentPrice >= market.startPrice
    : true;

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    setBusy(true);
    try {
      if (tradeMode === 'buy') {
        await onTakePosition(market.assetId, side === 'up', amount);
      } else if (onSellPosition) {
        await onSellPosition(market.assetId, side === 'up', amount);
      } else {
        alert('Sell system handler is not configured on this screen.');
      }
      setTimeout(fetchShares, 2500);
    } finally {
      setBusy(false);
    }
  };

  if (isHistorical) {
    return (
      <div
        style={{
        border: 'none',
        background: NP.bg,
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ ...NP.serif, fontSize: 18, fontWeight: 900, borderBottom: NP.border, paddingBottom: 8 }}>
          Archive Round
        </div>
        <p style={{ ...NP.mono, fontSize: 11, color: '#5A554E', margin: 0, lineHeight: 1.5 }}>
          Viewing a settled round. Claim if you won, or return to the live desk.
        </p>
        <div
          style={{
            ...NP.mono,
            fontSize: 12,
            fontWeight: 900,
            padding: '10px 12px',
            background: priceIsUp ? 'rgba(30,94,58,0.08)' : 'rgba(138,28,20,0.08)',
            border: NP.border,
            color: priceIsUp ? NP.green : NP.red,
          }}
        >
          {priceIsUp ? '▲ Price went UP' : '▼ Price went DOWN'}
        </div>
        <button
          type="button"
          onClick={() => onClaimWinnings(market.assetId)}
          style={{
            width: '100%',
            padding: '14px 0',
            background: '#1D4ED8',
            color: '#FAF8F3',
            border: NP.border,
            ...NP.mono,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          CLAIM WINNINGS →
        </button>
        {onReturnToLive && (
          <button
            type="button"
            onClick={onReturnToLive}
            style={{
              width: '100%',
              padding: '12px 0',
              background: 'transparent',
              color: NP.ink,
              border: NP.border,
              ...NP.mono,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            ← Return to Live Desk
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        border: 'none',
        background: NP.bg,
        padding: '18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', border: NP.border, background: 'rgba(13,11,8,0.03)', padding: 2 }}>
        {(['buy', 'sell'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setTradeMode(mode);
              setAmount('');
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              background: tradeMode === mode ? NP.ink : 'transparent',
              color: tradeMode === mode ? '#FAF8F3' : NP.ink,
              border: 'none',
              ...NP.mono,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {mode === 'buy' ? (
              <>
                <TrendingUp size={14} strokeWidth={2.5} />
                BUY
              </>
            ) : (
              <>
                <TrendingDown size={14} strokeWidth={2.5} />
                SELL
              </>
            )}
          </button>
        ))}
      </div>

      <div style={{ ...NP.serif, fontSize: 17, fontWeight: 900, borderBottom: NP.border, paddingBottom: 6 }}>
        {tradeMode === 'buy' ? 'Place Prediction' : 'Sell Share Position'}
      </div>

      <div style={{ display: 'flex', border: NP.border }}>
        {(['up', 'down'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSide(s);
              if (tradeMode === 'sell') setAmount('');
            }}
            style={{
              flex: 1,
              padding: '12px 0',
              background: side === s ? (s === 'up' ? NP.green : NP.red) : 'transparent',
              color: side === s ? '#FAF8F3' : NP.ink,
              border: 'none',
              borderRight: s === 'up' ? '2px solid #0D0B08' : 'none',
              ...NP.mono,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {s === 'up' ? `▲ UP (${upPct}%)` : `▼ DOWN (${downPct}%)`}
          </button>
        ))}
      </div>

      <div>
        <div style={{ ...NP.label, marginBottom: 8 }}>
          {tradeMode === 'buy' ? `AMOUNT (${tokenSymbol})` : `SHARES TO SELL (${side.toUpperCase()})`}
        </div>
        <div style={{ display: 'flex', border: NP.border }}>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              flex: 1,
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              ...NP.mono,
              fontSize: 15,
              fontWeight: 900,
              color: NP.ink,
            }}
          />
          <span
            style={{
              padding: '11px 12px',
              borderLeft: NP.border,
              ...NP.mono,
              fontSize: 11,
              fontWeight: 900,
              color: '#333',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {tradeMode === 'buy' ? tokenSymbol : 'SHARES'}
          </span>
        </div>

        {account && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              ...NP.mono,
              fontSize: 9.5,
            }}
          >
            <span style={{ color: '#666' }}>YOUR POSITION:</span>
            <span
              onClick={() => {
                if (tradeMode === 'sell') {
                  const maxVal = side === 'up' ? upShares : downShares;
                  setAmount(maxVal > 0 ? maxVal.toFixed(6) : '0');
                }
              }}
              style={{
                fontWeight: 'bold',
                color: NP.ink,
                cursor: tradeMode === 'sell' ? 'pointer' : 'default',
                textDecoration: tradeMode === 'sell' ? 'underline' : 'none',
              }}
            >
              {side === 'up' ? `${upShares.toFixed(2)} UP Shares` : `${downShares.toFixed(2)} DOWN Shares`}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {(tradeMode === 'buy' ? ['10', '25', '50', '100'] : ['25%', '50%', '75%', '100%']).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (tradeMode === 'buy') {
                setAmount(v);
              } else {
                const maxVal = side === 'up' ? upShares : downShares;
                const pct = Number(v.replace('%', '')) / 100;
                setAmount((maxVal * pct).toFixed(6));
              }
            }}
            style={{
              flex: 1,
              padding: '7px 0',
              background: 'transparent',
              color: NP.ink,
              border: NP.border,
              ...NP.mono,
              fontSize: 10,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div
        style={{
          border: NP.border,
          background: 'rgba(13,11,8,0.02)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...NP.label, fontSize: 9 }}>{tradeMode === 'buy' ? 'EST. RETURN' : 'EST. VALUE'}</span>
          <span
            style={{
              ...NP.mono,
              fontSize: 14,
              fontWeight: 900,
              color: tradeMode === 'buy' ? (side === 'up' ? NP.green : NP.red) : NP.green,
            }}
          >
            {tradeMode === 'buy'
              ? `~${amount && !isNaN(Number(amount)) ? (Number(amount) * Number(mult)).toFixed(2) : '0.00'} ${tokenSymbol}`
              : `~${amount && !isNaN(Number(amount)) ? sellQuote.toFixed(2) : '0.00'} ${tokenSymbol}`}
          </span>
        </div>
        <div
          style={{
            borderTop: '1px dashed rgba(13,11,8,0.15)',
            paddingTop: 8,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 10px',
            ...NP.mono,
            fontSize: 9.5,
          }}
        >
          <div>
            <div style={{ color: '#666', fontSize: 8, fontWeight: 700 }}>GAS</div>
            <div style={{ fontWeight: 700, color: NP.green }}>$0 FREE</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 8, fontWeight: 700 }}>POOL</div>
            <div style={{ fontWeight: 700 }}>{totalPool.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !amount || Number(amount) <= 0}
          style={{
            width: '100%',
            padding: '13px 0',
            background: busy || !amount ? '#888' : tradeMode === 'buy' ? (side === 'up' ? NP.green : NP.red) : NP.ink,
            color: '#FAF8F3',
            border: NP.border,
            ...NP.mono,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: busy || !amount ? 'not-allowed' : 'pointer',
            marginTop: 'auto',
          }}
        >
          {busy
            ? 'SUBMITTING…'
            : tradeMode === 'buy'
              ? `PLACE ${side.toUpperCase()} →`
              : `SELL ${side.toUpperCase()} →`}
        </button>
      ) : isExpired ? (
        <button
          type="button"
          onClick={() => onResolveMarket(market.assetId)}
          style={{
            width: '100%',
            padding: '13px 0',
            background: '#D97706',
            color: '#FAF8F3',
            border: NP.border,
            ...NP.mono,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            marginTop: 'auto',
          }}
        >
          FINALIZING ROUND…
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onClaimWinnings(market.assetId)}
          style={{
            width: '100%',
            padding: '13px 0',
            background: '#1D4ED8',
            color: '#FAF8F3',
            border: NP.border,
            ...NP.mono,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            marginTop: 'auto',
          }}
        >
          CLAIM WINNINGS →
        </button>
      )}
    </div>
  );
}
