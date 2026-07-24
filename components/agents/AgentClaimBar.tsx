import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../../contexts/WalletContext';
import { relayClaimAll, type BatchClaimResult } from '../../utils/relayClaim';

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
};

export default function AgentClaimBar() {
  const { account, provider, contract } = useWallet();
  const [claimableIds, setClaimableIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingAll, setClaimingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<BatchClaimResult[] | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const loadClaimable = useCallback(async () => {
    if (!account || !contract) {
      setClaimableIds([]);
      return;
    }
    setLoading(true);
    try {
      const assetCount = Number(await contract.getAssetCount());
      const ids: number[] = [];
      for (let assetId = 0; assetId < assetCount; assetId++) {
        const roundIds = (await contract.getAssetRoundIds(assetId)) as bigint[];
        const slice = roundIds.slice(-100);
        await Promise.all(
          slice.map(async (roundIdBig) => {
            const roundId = Number(roundIdBig);
            try {
              const [position, round] = await Promise.all([
                contract.getUserPosition(roundId, account),
                contract.getRoundInfo(roundId),
              ]);
              const upShares = position.upShares as bigint;
              const downShares = position.downShares as bigint;
              if (upShares === 0n && downShares === 0n) return;
              const hasClaimed = position.claimed as boolean;
              const isResolved = round.resolved as boolean;
              const upWins = round.upWins as boolean;
              if (!isResolved || hasClaimed) return;
              const won =
                (upShares > 0n && upWins) || (downShares > 0n && !upWins);
              if (won) ids.push(roundId);
            } catch {
              /* skip */
            }
          })
        );
      }
      ids.sort((a, b) => b - a);
      setClaimableIds(ids);
    } catch {
      setClaimableIds([]);
    } finally {
      setLoading(false);
    }
  }, [account, contract]);

  useEffect(() => {
    loadClaimable();
  }, [loadClaimable]);

  const claimAllWinnings = async () => {
    if (!contract || !provider || !account || !claimableIds.length) return;
    setClaimingAll(true);
    setBatchResults(null);
    setBatchProgress({ done: 0, total: claimableIds.length });
    setClaimMsg(
      `Sign once in MetaMask — relayer will claim all ${claimableIds.length} rounds (no AVAX gas).`
    );
    try {
      const results = await relayClaimAll({
        provider,
        account,
        contract,
        roundIds: claimableIds,
        onProgress: (done, total) => setBatchProgress({ done, total }),
      });
      setBatchResults(results);
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;
      setClaimMsg(
        ok > 0
          ? `${ok} round${ok > 1 ? 's' : ''} claimed!${fail > 0 ? ` ${fail} failed (see below).` : ''}`
          : 'All claims failed — check details below.'
      );
      await loadClaimable();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setClaimMsg(err.message || 'Batch claim failed');
    } finally {
      setClaimingAll(false);
      setBatchProgress(null);
    }
  };

  if (!account) return null;
  if (loading && claimableIds.length === 0 && !claimMsg) {
    return (
      <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: 0 }}>Checking unclaimed winnings…</p>
    );
  }
  if (!claimableIds.length && !claimMsg && !batchResults) {
    return (
      <p style={{ ...S.mono, fontSize: 12, color: '#888', margin: 0 }}>
        No unclaimed winning rounds right now.
      </p>
    );
  }

  const msgColor =
    claimMsg && claimMsg.toLowerCase().includes('fail') ? '#C0392B' : '#27AE60';

  return (
    <div>
      {claimableIds.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '14px 16px',
            border: '1px solid #27AE60',
            background: 'rgba(39,174,96,0.06)',
          }}
        >
          <div>
            <p style={{ ...S.label, color: '#27AE60' }}>Unclaimed Winnings</p>
            <p style={{ ...S.serif, fontSize: 15, color: '#0D0B08', margin: '4px 0 0' }}>
              {claimableIds.length} round{claimableIds.length > 1 ? 's' : ''} ready to collect
            </p>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 2 }}>
              One signature — relayer covers all gas fees
            </p>
          </div>
          <button
            type="button"
            onClick={claimAllWinnings}
            disabled={claimingAll}
            style={{
              background: '#27AE60',
              color: '#FAF8F3',
              border: 'none',
              padding: '12px 24px',
              ...S.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: claimingAll ? 'wait' : 'pointer',
              opacity: claimingAll ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {claimingAll ? (
              <>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    border: '2px solid #FAF8F3',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                {batchProgress
                  ? `Claiming ${batchProgress.done}/${batchProgress.total}…`
                  : 'Signing…'}
              </>
            ) : (
              `Claim All (${claimableIds.length})`
            )}
          </button>
        </div>
      ) : null}

      {claimMsg ? (
        <p style={{ ...S.mono, fontSize: 12, color: msgColor, margin: claimableIds.length ? '12px 0 0' : 0 }}>
          {claimMsg}
        </p>
      ) : null}

      {batchResults && batchResults.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {batchResults.map((r) => (
            <div
              key={r.roundId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                ...S.mono,
                fontSize: 11,
              }}
            >
              <span style={{ color: '#0D0B08' }}>Round #{r.roundId}</span>
              {r.ok ? (
                <span style={{ color: '#27AE60' }}>
                  ✓ Claimed
                  {r.hash ? (
                    <a
                      href={`https://testnet.snowtrace.io/tx/${r.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#F69D39', marginLeft: 8, textDecoration: 'none' }}
                    >
                      Tx ↗
                    </a>
                  ) : null}
                </span>
              ) : (
                <span style={{ color: '#C0392B' }}>✗ {r.error || 'Failed'}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
