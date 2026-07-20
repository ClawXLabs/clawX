import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ethers } from 'ethers';
import { useMarketData, MarketInfo } from '../contexts/MarketDataContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';
import { AssetIconImg } from '../utils/assetIcons';
import { History, ChevronDown, LayoutGrid } from 'lucide-react';

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
  const [expanded, setExpanded] = useState(false);

  const marketList = Object.values(markets);
  const current = marketList.find((m) => m.assetId === currentAssetId) || marketList[0] || null;
  const others = marketList.filter((m) => m.assetId !== current?.assetId);

  const handleSwitch = (assetId: number) => {
    setExpanded(false);
    router.push(`/markets/trade?asset=${assetId}`);
  };

  useEffect(() => {
    setExpanded(false);
  }, [currentAssetId]);

  const renderMarketRow = (m: MarketInfo, isActive: boolean) => {
    const diffPct = m.startPrice > 0 ? ((m.currentPrice - m.startPrice) / m.startPrice) * 100 : 0;
    const isUp = diffPct >= 0;
    const isBnbOrNear = m.symbol === 'BNB' || m.symbol === 'NEAR';
    const selectedText = isBnbOrNear ? '#0D0B08' : '#FAF8F3';
    const selectedSubText = isBnbOrNear ? 'rgba(13,11,8,0.6)' : 'rgba(250,248,243,0.7)';

    return (
      <button
        key={m.assetId}
        type="button"
        onClick={() => (isActive ? setExpanded((v) => !v) : handleSwitch(m.assetId))}
        style={{
          width: '100%',
          border: NP.border,
          borderLeft: isActive ? `5px solid ${NP.ink}` : NP.border,
          background: isActive ? (m.color || '#E84142') : 'transparent',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          cursor: 'pointer',
          textAlign: 'left',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <AssetIconImg symbol={m.symbol} size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ ...NP.serif, fontSize: 17, fontWeight: 900, color: isActive ? selectedText : NP.ink }}>
                {m.symbol}
              </span>
              <span style={{ ...NP.mono, fontSize: 10, color: isActive ? selectedSubText : '#5A554E' }}>
                #{m.roundNumber}
              </span>
            </div>
            {isActive && (
              <span style={{ ...NP.mono, fontSize: 9, letterSpacing: '0.1em', color: isActive ? selectedSubText : '#888' }}>
                CURRENT MARKET
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...NP.mono, fontSize: 15, fontWeight: 900, color: isActive ? selectedText : NP.ink }}>
            {fmtUsd(m.currentPrice)}
          </div>
          <div
            style={{
              ...NP.mono,
              fontSize: 10,
              fontWeight: 800,
              color: isActive ? selectedText : isUp ? NP.green : NP.red,
            }}
          >
            {isUp ? '▲' : '▼'} {Math.abs(diffPct).toFixed(2)}%
          </div>
        </div>
      </button>
    );
  };

  if (!current) {
    return (
      <div style={{ border: NP.border, background: NP.bg, padding: '10px 12px', width: '100%' }}>
        <span style={{ ...NP.mono, fontSize: 11, color: '#5A554E' }}>No active markets</span>
      </div>
    );
  }

  const diffPct = current.startPrice > 0
    ? ((current.currentPrice - current.startPrice) / current.startPrice) * 100
    : 0;
  const isUp = diffPct >= 0;

  return (
    <div
      className="markets-dock"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 280,
        border: NP.border,
        background: NP.bg,
        zIndex: 45,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .markets-dock-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: min(36vh, 320px);
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 10px;
          scrollbar-width: thin;
        }
        .markets-dock-list::-webkit-scrollbar { width: 5px; }
        .markets-dock-list::-webkit-scrollbar-thumb { background: rgba(13,11,8,0.25); }
      `}} />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse markets overview' : 'Expand markets overview'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: expanded ? 'rgba(13,11,8,0.04)' : 'transparent',
          border: 'none',
          borderBottom: expanded ? '1px solid rgba(13,11,8,0.12)' : 'none',
          cursor: 'pointer',
          color: NP.ink,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <LayoutGrid size={15} strokeWidth={2.5} />
          <AssetIconImg symbol={current.symbol} size={18} />
          <span style={{ ...NP.serif, fontSize: 14, fontWeight: 900 }}>{current.symbol}</span>
          <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, color: isUp ? NP.green : NP.red }}>
            {isUp ? '▲' : '▼'}{Math.abs(diffPct).toFixed(1)}%
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.5}
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            /* Top dock expands downward — chevron points down when closed, up when open */
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {expanded && (
        <div
          style={{
            position: 'absolute',
            left: -1,
            right: -1,
            top: '100%',
            border: NP.border,
            borderTop: 'none',
            background: NP.bg,
            boxShadow: '0 10px 24px rgba(13,11,8,0.1)',
            maxHeight: 'min(40vh, 360px)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 46,
          }}
        >
          <div className="markets-dock-list">
            {renderMarketRow(current, true)}
            {others.map((m) => renderMarketRow(m, false))}
          </div>
        </div>
      )}
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
  startTime: number; // unix seconds
  endTime: number;   // unix seconds
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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (assetId === null) return;

    let active = true;
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        const roundIdsRaw: bigint[] = await contract.getAssetRoundIds(assetId);
        const roundIds = roundIdsRaw.map((id) => Number(id));

        // All completed rounds for this asset — dock shows ~5 at a time; scroll for the rest
        const completedRoundIds = roundIds
          .filter((id) => id !== currentRoundId)
          .slice(-48)
          .reverse();

        if (completedRoundIds.length === 0) {
          if (active) {
            setHistoryRounds([]);
            setLoading(false);
          }
          return;
        }

        const roundsData = await Promise.all(
          completedRoundIds.map(async (roundId) => {
            const info = await contract.getRoundInfo(roundId);
            return {
              roundId,
              roundNumber: Number(info.roundNumber),
              startPrice: Number(info.startPrice) / 1e8,
              endPrice: Number(info.endPrice) / 1e8,
              startTime: Number(info.startTime),
              endTime: Number(info.endTime),
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

  // Collapse when switching assets
  useEffect(() => {
    setExpanded(false);
  }, [assetId]);

  const HISTORY_VISIBLE = 5; // ~4–6 rows visible; scroll for the rest

  return (
    <div
      className="history-dock"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 280,
        border: NP.border,
        background: NP.bg,
        zIndex: 40,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .history-dock-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          /* ~5 compact rows visible */
          max-height: calc(${HISTORY_VISIBLE} * 78px);
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 10px;
          scrollbar-width: thin;
        }
        .history-dock-list::-webkit-scrollbar { width: 5px; }
        .history-dock-list::-webkit-scrollbar-thumb { background: rgba(13,11,8,0.25); }
      `}} />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse round history' : 'Expand round history'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: expanded ? 'rgba(13,11,8,0.04)' : 'transparent',
          border: 'none',
          borderBottom: expanded ? '1px solid rgba(13,11,8,0.12)' : 'none',
          cursor: 'pointer',
          color: NP.ink,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={15} strokeWidth={2.5} />
          <span style={{ ...NP.serif, fontSize: 14, fontWeight: 900 }}>History</span>
          {!loading && historyRounds.length > 0 && (
            <span style={{ ...NP.mono, fontSize: 9, fontWeight: 700, color: '#5A554E' }}>
              {historyRounds.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.5}
          style={{
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {expanded && (
        <div
          style={{
            position: 'absolute',
            left: -1,
            right: -1,
            bottom: '100%',
            border: NP.border,
            borderBottom: 'none',
            background: NP.bg,
            boxShadow: '0 -10px 24px rgba(13,11,8,0.1)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 41,
          }}
        >
          {loading && (
            <p style={{ ...NP.mono, fontSize: 11, color: '#5A554E', textAlign: 'center', padding: '16px 10px' }}>
              Loading…
            </p>
          )}
          {error && (
            <p style={{ ...NP.mono, fontSize: 11, color: NP.red, fontWeight: 700, textAlign: 'center', padding: '16px 10px' }}>
              {error}
            </p>
          )}
          {!loading && !error && historyRounds.length === 0 && (
            <p style={{ ...NP.mono, fontSize: 11, color: '#5A554E', textAlign: 'center', padding: '16px 10px' }}>
              No previous rounds.
            </p>
          )}
          {!loading && !error && historyRounds.length > 0 && (
            <div className="history-dock-list">
              {historyRounds.map((r) => {
                const roundUp = r.endPrice >= r.startPrice;
                const roundDiff = r.startPrice > 0 ? ((r.endPrice - r.startPrice) / r.startPrice) * 100 : 0;
                const isSelected = r.roundId === selectedRoundId;

                return (
                  <div
                    key={r.roundId}
                    onClick={() => onSelectRound?.(r)}
                    style={{
                      border: isSelected ? `2px solid ${NP.ink}` : '1px solid rgba(13,11,8,0.28)',
                      padding: '9px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      background: isSelected ? 'rgba(13,11,8,0.07)' : 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ ...NP.mono, fontSize: 11, fontWeight: 900 }}>#{r.roundNumber}</span>
                      {r.resolved ? (
                        <span
                          style={{
                            ...NP.mono,
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '2px 6px',
                            background: r.upWins ? NP.green : NP.red,
                            color: '#FAF8F3',
                          }}
                        >
                          {r.upWins ? '▲ UP' : '▼ DOWN'}
                        </span>
                      ) : (
                        <span style={{ ...NP.mono, fontSize: 9, fontWeight: 900, padding: '2px 6px', background: '#555', color: '#FAF8F3' }}>
                          OPEN
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700 }}>{fmtUsd(r.startPrice)}</span>
                      <span style={{ ...NP.mono, fontSize: 11, fontWeight: 700, color: roundUp ? NP.green : NP.red }}>
                        {fmtUsd(r.endPrice)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(13,11,8,0.15)', paddingTop: 4 }}>
                      <span style={{ ...NP.mono, fontSize: 9, color: '#5A554E' }}>{r.collateralPool.toFixed(1)} pool</span>
                      <span style={{ ...NP.mono, fontSize: 10, fontWeight: 700, color: roundUp ? NP.green : NP.red }}>
                        {roundUp ? '▲' : '▼'}{Math.abs(roundDiff).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
