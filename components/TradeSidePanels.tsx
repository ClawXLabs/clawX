import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ethers } from 'ethers';
import { useMarketData, MarketInfo } from '../contexts/MarketDataContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';
import { AssetIconImg } from '../utils/assetIcons';
import { Bold, History, ChevronDown } from 'lucide-react';

const NP = {
  mono: { fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 900 } as React.CSSProperties,
  label: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#0D0B08',
  } as React.CSSProperties,
  bg: '#FAF8F3',
  ink: '#0D0B08',
  green: '#1E5E3A',
  red: '#8A1C14',
  border: '1px solid #0D0B08',
};

function fmtUsd(n: number): string {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

/* ──────────────────────────────────────────────────────────────────
   Active Markets Panel
   ────────────────────────────────────────────────────────────────── */
interface ActiveMarketsPanelProps {
  currentAssetId: number | null;
}

export function ActiveMarketsPanel({ currentAssetId }: ActiveMarketsPanelProps) {
  const router = useRouter();
  const { markets } = useMarketData();

  const handleSwitch = (assetId: number) => {
    router.push(`/markets/trade?asset=${assetId}`);
  };

  const marketList = Object.values(markets);

  return (
    <div className="markets-container ">
      <style dangerouslySetInnerHTML={{ __html: `
        .markets-container {
          border: ${NP.border};
          background: ${NP.bg};
          padding: 20px;
        }
        .markets-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          max-height: 250px;
          overflow-y: auto;
          padding-right: 0px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .markets-list::-webkit-scrollbar {
          display: none;
        }
        .market-item {
          border: ${NP.border};
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .market-item-logo-only {
          display: none;
        }
        
        @media (max-width: 1199px) {
          .markets-container {
            border: none !important;
            padding: 8px 0px !important;
            background: transparent !important;
            width: 100% !important;
          }
          .markets-header-block {
            display: none !important;
          }
          .markets-list {
            flex-direction: row !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            justify-content: flex-start !important;
            gap: 8px !important;
            padding: 4px 0 12px !important;
            width: 100% !important;
            max-height: none !important;
            -webkit-overflow-scrolling: touch;
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .markets-list::-webkit-scrollbar {
            display: none;
          }
          .market-item {
            display: none !important;
          }
          .market-item-logo-only {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 0 0 95px !important;
            height: 96px !important;
            border: ${NP.border};
            background: ${NP.bg};
            cursor: pointer;
            gap: 4px;
            padding: 8px 4px !important;
            transition: all 0.2s ease;
          }
        }
      `}} />

      <div className="markets-header-block" style={{ borderBottom: NP.border, paddingBottom: 10, marginBottom: 15 }}>
        {/* <p style={NP.label}>◆ Switch Market</p> */}
        <h3 style={{ ...NP.serif, fontSize: 22, fontWeight: 900, margin: '2px 0 0', color: NP.ink }}>
          Active Markets
        </h3>
      </div>

      <div className="markets-list">
        {marketList.map((m) => {
          const isActive = m.assetId === currentAssetId;
          const diffPct = m.startPrice > 0 ? ((m.currentPrice - m.startPrice) / m.startPrice) * 100 : 0;
          const isUp = diffPct >= 0;

          // Determine selected text brightness for contrast
          const isBnbOrNear = m.symbol === 'BNB' || m.symbol === 'NEAR';
          const selectedText = isBnbOrNear ? '#0D0B08' : '#FAF8F3';
          const selectedSubText = isBnbOrNear ? 'rgba(13,11,8,0.6)' : 'rgba(250,248,243,0.7)';

          return (
            <div key={m.assetId} style={{ flex: '1 1 0px', display: 'flex' }}>
              {/* Desktop view detail card */}
              <div
                className="market-item"
                onClick={() => handleSwitch(m.assetId)}
                style={{
                  background: isActive ? (m.color || '#E84142') : 'transparent',
                  border: NP.border,
                  borderLeft: isActive ? `6px solid #0D0B08` : `2px solid #0D0B08`,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(13,11,8,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className='flex-col'>
                  <span style={{ ...NP.mono, fontSize: 10.5, fontWeight: 'normal', color: isActive ? selectedSubText : '#555', marginLeft: 6 }} className='self-start'>
                      #{m.roundNumber}
                  </span>
                  <div className='flex flex-row gap-2 align-middle items-center'>
                    <AssetIconImg symbol={m.symbol} size={24} />
                    <span style={{ ...NP.serif, fontSize: 19, fontWeight: 900, color: isActive ? selectedText : NP.ink }}>
                      {m.symbol}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  
                  <div style={{
                    ...NP.mono,
                    fontSize: 11.5,
                    fontWeight: 900,
                    color: isActive ? selectedText : (isUp ? NP.green : NP.red),
                    background: isActive 
                      ? (isBnbOrNear ? 'rgba(13,11,8,0.1)' : 'rgba(250,248,243,0.25)')
                      : (isUp ? 'rgba(30,94,58,0.08)' : 'rgba(138,28,20,0.08)'),
                    padding: '2px 8px',
                    border: `1px solid ${isActive ? selectedText : (isUp ? NP.green : NP.red)}`,
                    borderRadius: 2,
                    display: 'inline-block',
                  }}>
                    {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(2)}%
                  </div>
                  <div style={{ ...NP.mono, fontSize: 22, fontWeight: 900, color: isActive ? selectedText : NP.ink }} >
                    {fmtUsd(m.currentPrice)}
                  </div>
                </div>
              </div>

              {/* Mobile square box (Stretched & Larger with live values!) */}
              <div
                onClick={() => handleSwitch(m.assetId)}
                className="market-item-logo-only"
                style={{
                  outline: isActive ? `3px solid ${NP.ink}` : 'none',
                  background: isActive ? 'rgba(13,11,8,0.06)' : NP.bg,
                  transform: isActive ? 'scale(1.02)' : 'none',
                  width: '100%',
                  overflow: 'visible !important',
                  marginLeft: 5,
                  marginRight: 5,
                }}
              >
                <AssetIconImg symbol={m.symbol} size={30} />
                <span style={{ ...NP.mono, fontSize: 10.5, fontWeight: 900, color: NP.ink }}>
                  {m.symbol}
                </span>
                <span style={{ ...NP.serif, fontSize: 11, fontWeight: 900, color: NP.ink, marginTop: 1 }}>
                  {fmtUsd(m.currentPrice)}
                </span>
                <span style={{
                  ...NP.mono,
                  fontSize: 9.5,
                  fontWeight: 900,
                  color: isUp ? NP.green : NP.red,
                  marginTop: 2,
                  background: isUp ? 'rgba(56, 237, 134, 0.79)' : 'rgba(138,28,20,0.08)',
                  padding: '2px 6px',
                  border: `1px solid ${isUp ? NP.green : NP.red}`,
                  borderRadius: 2,
                }}>
                  {isUp ? '▲' : '▼'}{Math.abs(diffPct).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Previous Rounds History Panel
   ────────────────────────────────────────────────────────────────── */
export interface HistoryRound {
  roundId: number;
  roundNumber: number;
  startPrice: number;
  endPrice: number;
  resolved: boolean;
  upWins: boolean;
  collateralPool: number;
  upPool: number;
  downPool: number;
}

interface RoundHistoryPanelProps {
  assetId: number | null;
  currentRoundId: number | null;
  selectedRoundId?: number | null;
  onSelectRound?: (round: HistoryRound) => void;
}

export function RoundHistoryPanel({
  assetId,
  currentRoundId,
  selectedRoundId,
  onSelectRound,
}: RoundHistoryPanelProps) {
  const [historyRounds, setHistoryRounds] = useState<HistoryRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (assetId === null) return;

    let active = true;
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        // Fetch round IDs for this asset
        const roundIdsRaw: bigint[] = await contract.getAssetRoundIds(assetId);
        const roundIds = roundIdsRaw.map(id => Number(id));

        // Filter out the active round and get the last 5 completed round IDs
        const completedRoundIds = roundIds
          .filter(id => id !== currentRoundId)
          .slice(-5)
          .reverse();

        if (completedRoundIds.length === 0) {
          if (active) {
            setHistoryRounds([]);
            setLoading(false);
          }
          return;
        }

        // Fetch details of each round
        const roundsData = await Promise.all(
          completedRoundIds.map(async (roundId) => {
            const info = await contract.getRoundInfo(roundId);
            return {
              roundId,
              roundNumber: Number(info.roundNumber),
              startPrice: Number(info.startPrice) / 1e8,
              endPrice: Number(info.endPrice) / 1e8,
              resolved: Boolean(info.resolved),
              upWins: Boolean(info.upWins),
              collateralPool: Number(ethers.formatUnits(info.collateralPool, 6)),
              upPool: Number(ethers.formatUnits(info.upPool, 6)),
              downPool: Number(ethers.formatUnits(info.downPool, 6)),
            };
          })
        );

        if (active) {
          setHistoryRounds(roundsData);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Failed to load round history:', err);
        if (active) {
          setError('Failed to fetch history');
          setLoading(false);
        }
      }
    };

    fetchHistory();
    return () => {
      active = false;
    };
  }, [assetId, currentRoundId]);

  return (
    <div style={{ border: NP.border, background: NP.bg, padding: '20px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 360px;
          overflow-y: auto;
          padding-right: 0px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .history-list::-webkit-scrollbar {
          display: none;
        }
      `}} />

      <div style={{ borderBottom: NP.border, paddingBottom: 10, marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* <p style={NP.label}>◆ Market Archive</p> */}
        <h3 style={{ ...NP.serif, fontSize: 22, fontWeight: 900, margin: '4px 0 0', color: NP.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={18} strokeWidth={2.5} style={{ color: '#0D0B08' }} />
          Round History
        </h3>
        {historyRounds.length > 2 && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              color: NP.ink,
              transition: 'transform 0.2s ease',
              transform: showAll ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            aria-label="Toggle history visibility"
          >
            <ChevronDown size={22} strokeWidth={3} />
          </button>
        )}
      </div>

      {loading && (
        <p style={{ ...NP.mono, fontSize: 13, color: '#0D0B08', fontWeight: 800, textAlign: 'center', padding: '15px 0' }}>
          Loading historical rounds…
        </p>
      )}

      {error && (
        <p style={{ ...NP.mono, fontSize: 12, color: NP.red, fontWeight: 900, textAlign: 'center' }}>
          ⚠ {error}
        </p>
      )}

      {!loading && !error && historyRounds.length === 0 && (
        <p style={{ ...NP.mono, fontSize: 13, color: '#555', fontWeight: 800, textAlign: 'center', padding: '15px 0' }}>
          No previous rounds recorded.
        </p>
      )}

      {!loading && !error && historyRounds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="history-list">
            {historyRounds.slice(0, showAll ? historyRounds.length : 2).map((r) => {
              const isUp = r.endPrice >= r.startPrice;
              const diffPct = r.startPrice > 0 ? ((r.endPrice - r.startPrice) / r.startPrice) * 100 : 0;
              const isSelected = r.roundId === selectedRoundId;

              return (
                <div
                  key={r.roundId}
                  onClick={() => onSelectRound && onSelectRound(r)}
                  style={{
                    border: isSelected ? `3px solid ${NP.ink}` : '2px solid rgba(13,11,8,0.35)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    background: isSelected ? 'rgba(13,11,8,0.08)' : 'rgba(13,11,8,0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(13,11,8,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(13,11,8,0.02)';
                  }}
                >
                  {/* Round Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...NP.mono, fontSize: 13.5, fontWeight: 900, color: NP.ink }}>
                      #{r.roundNumber}
                    </span>
                    {r.resolved ? (
                      <span
                        style={{
                          ...NP.mono,
                          fontSize: 11,
                          fontWeight: 900,
                          padding: '3px 8px',
                          background: r.upWins ? NP.green : NP.red,
                          color: '#FAF8F3',
                          borderRadius: 2,
                        }}
                      >
                        {r.upWins ? '▲ UP WINS' : '▼ DOWN WINS'}
                      </span>
                    ) : (
                      <span
                        style={{
                          ...NP.mono,
                          fontSize: 11,
                          fontWeight: 900,
                          padding: '3px 8px',
                          background: '#555',
                          color: '#FAF8F3',
                          borderRadius: 2,
                        }}
                      >
                        UNRESOLVED
                      </span>
                    )}
                  </div>

                  {/* Price Details */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
                    <div>
                      <span style={{ ...NP.mono, fontSize: 10, color: '#5A554E', fontWeight: 'normal', display: 'block', letterSpacing: '0.04em' }}>OPEN PRICE</span>
                      <span style={{ ...NP.mono, fontSize: 15, fontWeight: 'bold', color: NP.ink }}>
                        {fmtUsd(r.startPrice)}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...NP.mono, fontSize: 10, color: '#5A554E', fontWeight: 'normal', display: 'block', letterSpacing: '0.04em' }}>SETTLE PRICE</span>
                      <span style={{ ...NP.mono, fontSize: 15, fontWeight: 'bold', color: isUp ? NP.green : NP.red }}>
                        {fmtUsd(r.endPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Pool & Variance */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '1px dashed rgba(13,11,8,0.2)',
                      paddingTop: 6,
                      marginTop: 2,
                    }}
                  >
                    <span style={{ ...NP.mono, fontSize: 11, color: '#5A554E', fontWeight: 'normal' }}>
                      Pool: <strong style={{ color: NP.ink, fontWeight: 'bold' }}>{r.collateralPool.toFixed(2)} TUSDC</strong>
                    </span>
                    <span style={{ ...NP.mono, fontSize: 12, fontWeight: 'bold', color: isUp ? NP.green : NP.red }}>
                      {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
