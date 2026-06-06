import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../utils/contract';

/* ─── Types ─────────────────────────────────────────────────────── */

interface LeaderboardRow {
  assetId: number;
  symbol: string;
  roundNumber: number;
  pool: bigint;
  upPool: bigint;
  downPool: bigint;
  resolved: boolean;
}

/* ─── Styles ────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

/* ─── Component ─────────────────────────────────────────────────── */

export default function LeaderboardTerminal() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const assetCount = Number(await contract.getAssetCount());
        const list: LeaderboardRow[] = [];
        for (let assetId = 0; assetId < assetCount; assetId++) {
          const asset = await contract.getAsset(assetId);
          const currentRoundId = Number(asset.currentRoundId);
          if (currentRoundId === 0) continue;
          const round = await contract.getRoundInfo(currentRoundId);
          list.push({
            assetId, symbol: asset.symbol,
            roundNumber: Number(round.roundNumber),
            pool: round.collateralPool, upPool: round.upPool,
            downPool: round.downPool, resolved: round.resolved,
          });
        }
        list.sort((a, b) => (b.pool > a.pool ? 1 : b.pool < a.pool ? -1 : 0));
        if (!cancelled) { setRows(list); setLoading(false); }
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string };
        if (!cancelled) { setError(err.shortMessage || err.message || 'Failed to load'); setLoading(false); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 64px' }}>
      {/* ── Page header ────────────────────────────── */}
      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ LIVE STANDINGS</p>
        <h1 style={{ ...S.serif, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
          Leaderboard
        </h1>
        <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10, maxWidth: 520 }}>
          Live rounds ranked by total collateral in the pool — on-chain read, no indexing.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{ border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#C0392B', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Rankings table ─────────────────────────── */}
      <div style={{ border: '2px solid #0D0B08', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0D0B08', background: 'rgba(13,11,8,0.04)' }}>
              {['#', 'Market', 'Round', 'Pool (CLAW)'].map((h, i) => (
                <th key={h} style={{
                  ...S.mono, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#888', padding: '12px 16px',
                  textAlign: i === 3 ? 'right' : 'left',
                  borderRight: i < 3 ? '1px solid rgba(13,11,8,0.12)' : 'none',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(13,11,8,0.1)' }}>
                  <td colSpan={4} style={{ padding: '16px' }}>
                    <div style={{ height: 16, background: 'rgba(13,11,8,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </td>
                </tr>
              ))
            )}
            {rows.map((r, i) => (
              <tr key={r.assetId} style={{
                borderBottom: i < rows.length - 1 ? '1px solid rgba(13,11,8,0.1)' : 'none',
                transition: 'background 0.2s ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,11,8,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ ...S.mono, fontSize: 12, color: '#888', padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>{i + 1}</td>
                <td style={{ ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08', padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>{r.symbol}</td>
                <td style={{ ...S.mono, fontSize: 12, color: '#5A554E', padding: '14px 16px', borderRight: '1px solid rgba(13,11,8,0.12)' }}>#{r.roundNumber}</td>
                <td style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#27AE60', padding: '14px 16px', textAlign: 'right' }}>{ethers.formatEther(r.pool)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && !error && !loading && (
          <p style={{ ...S.mono, fontSize: 12, color: '#888', padding: '40px 16px', textAlign: 'center' }}>
            No markets found
          </p>
        )}
      </div>
    </div>
  );
}
