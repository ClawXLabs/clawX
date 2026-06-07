import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ethers } from 'ethers';
import { useMarketData, MarketInfo } from '../contexts/MarketDataContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';
import { AssetIconImg } from '../utils/assetIcons';
import { History } from 'lucide-react';

const NP = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: 10,
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
            overflow-x: hidden !important;
            justify-content: space-between !important;
            gap: 8px !important;
            padding: 4px 0 12px !important;
            width: 100% !important;
          }
          .market-item {
            display: none !important;
          }
          .market-item-logo-only {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1 1 0px !important;
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
        <p style={NP.label}>◆ Switch Market</p>
        <h3 style={{ ...NP.serif, fontSize: 20, fontWeight: 900, margin: '4px 0 0', color: NP.ink }}>
          Active Markets
        </h3>
      </div>

      <div className="markets-list">
        {marketList.map((m) => {
          const isActive = m.assetId === currentAssetId;
          const diffPct = m.startPrice > 0 ? ((m.currentPrice - m.startPrice) / m.startPrice) * 100 : 0;
          const isUp = diffPct >= 0;

          return (
            <div key={m.assetId} style={{ flex: '1 1 0px', display: 'flex' }}>
              {/* Desktop view detail card */}
              <div
                className="market-item"
                onClick={() => handleSwitch(m.assetId)}
                style={{
                  background: isActive ? 'rgba(13,11,8,0.06)' : 'transparent',
                  outline: isActive ? `2px solid ${NP.ink}` : 'none',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(13,11,8,0.03)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AssetIconImg symbol={m.symbol} size={24} />
                  <div>
                    <span style={{ ...NP.serif, fontSize: 17, fontWeight: 900, color: NP.ink }}>
                      {m.symbol}/USD
                    </span>
                    <span style={{ ...NP.mono, fontSize: 10, color: '#888', marginLeft: 6 }}>
                      #{m.roundNumber}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...NP.mono, fontSize: 14, fontWeight: 900, color: NP.ink }}>
                    {fmtUsd(m.currentPrice)}
                  </div>
                  <div style={{ ...NP.mono, fontSize: 11, fontWeight: 900, color: isUp ? NP.green : NP.red, marginTop: 2 }}>
                    {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(2)}%
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
                  marginLeft:5,
                  marginRight:5,
                }}
              >
                <AssetIconImg symbol={m.symbol} size={30} />
                <span style={{ ...NP.mono, fontSize: 9.5, fontWeight: 900, color: NP.ink }}>
                  {m.symbol}
                </span>
                <span style={{ ...NP.serif, fontSize: 9, fontWeight: 900, color: NP.ink, marginTop: 1 }}>
                  {m.currentPrice >= 1000 ? Math.round(m.currentPrice).toLocaleString() : m.currentPrice.toFixed(2)}
                </span>
                <span style={{ ...NP.mono, fontSize: 7.5, fontWeight: 900, color: isUp ? NP.green : NP.red, marginTop: -2 }}>
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
      <div style={{ borderBottom: NP.border, paddingBottom: 10, marginBottom: 15 }}>
        <p style={NP.label}>◆ Market Archive</p>
        <h3 style={{ ...NP.serif, fontSize: 20, fontWeight: 900, margin: '4px 0 0', color: NP.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={18} strokeWidth={2.5} style={{ color: '#555' }} />
          Round History
        </h3>
      </div>

      {loading && (
        <p style={{ ...NP.mono, fontSize: 11, color: '#888', textAlign: 'center', padding: '15px 0' }}>
          Loading historical rounds…
        </p>
      )}

      {error && (
        <p style={{ ...NP.mono, fontSize: 10, color: NP.red, textAlign: 'center' }}>
          ⚠ {error}
        </p>
      )}

      {!loading && !error && historyRounds.length === 0 && (
        <p style={{ ...NP.mono, fontSize: 11, color: '#888', textAlign: 'center', padding: '15px 0' }}>
          No previous rounds recorded.
        </p>
      )}

      {!loading && !error && historyRounds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historyRounds.map((r) => {
            const isUp = r.endPrice >= r.startPrice;
            const diffPct = r.startPrice > 0 ? ((r.endPrice - r.startPrice) / r.startPrice) * 100 : 0;
            const isSelected = r.roundId === selectedRoundId;

            return (
              <div
                key={r.roundId}
                onClick={() => onSelectRound && onSelectRound(r)}
                style={{
                  border: isSelected ? `2px solid ${NP.ink}` : '1px solid rgba(13,11,8,0.2)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  background: isSelected ? 'rgba(13,11,8,0.06)' : 'rgba(13,11,8,0.01)',
                  cursor: 'pointer',
                  outline: isSelected ? `1px solid ${NP.ink}` : 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(13,11,8,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(13,11,8,0.01)';
                }}
              >
                {/* Round Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...NP.mono, fontSize: 12, fontWeight: 900, color: NP.ink }}>
                    ROUND #{r.roundNumber}
                  </span>
                  {r.resolved ? (
                    <span
                      style={{
                        ...NP.mono,
                        fontSize: 10,
                        fontWeight: 900,
                        padding: '2px 6px',
                        background: r.upWins ? NP.green : NP.red,
                        color: '#FAF8F3',
                      }}
                    >
                      {r.upWins ? '▲ UP WINS' : '▼ DOWN WINS'}
                    </span>
                  ) : (
                    <span
                      style={{
                        ...NP.mono,
                        fontSize: 10,
                        fontWeight: 900,
                        padding: '2px 6px',
                        background: '#888',
                        color: '#FAF8F3',
                      }}
                    >
                      UNRESOLVED
                    </span>
                  )}
                </div>

                {/* Price Details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
                  <div>
                    <span style={{ ...NP.mono, fontSize: 9.5, color: '#666', display: 'block' }}>OPEN PRICE</span>
                    <span style={{ ...NP.mono, fontSize: 13, fontWeight: 'bold', color: NP.ink }}>
                      {fmtUsd(r.startPrice)}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ ...NP.mono, fontSize: 9.5, color: '#666', display: 'block' }}>SETTLE PRICE</span>
                    <span style={{ ...NP.mono, fontSize: 13, fontWeight: 'bold', color: isUp ? NP.green : NP.red }}>
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
                    borderTop: '1px dashed rgba(13,11,8,0.1)',
                    paddingTop: 4,
                    marginTop: 2,
                  }}
                >
                  <span style={{ ...NP.mono, fontSize: 10.5, color: '#666' }}>
                    Pool: {r.collateralPool.toFixed(2)} TUSDC
                  </span>
                  <span style={{ ...NP.mono, fontSize: 10.5, fontWeight: 900, color: isUp ? NP.green : NP.red }}>
                    {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(3)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
