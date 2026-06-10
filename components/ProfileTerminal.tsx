import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, ERC20_ABI, TUSDC_ADDRESS } from '../utils/contract';
import { relayClaimWinnings, relayClaimAll, type BatchClaimResult } from '../utils/relayClaim';
import SocialLinker, { type SocialLinks } from './SocialLinker';

/* ─── Helpers ────────────────────────────────────────────────────── */

function fmt(value: bigint | null | undefined, decimals = 6, maxFrac = 4): string {
  if (value === null || value === undefined) return '—';
  const max = Number.isFinite(maxFrac) ? Math.min(20, Math.max(0, Math.floor(maxFrac))) : 4;
  const min = Math.min(max, max === 0 ? 0 : 2);
  return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: min, maximumFractionDigits: max,
  });
}

/** Estimate claimable payout: (userShares / roundTotalWinShares) × collateralPool */
function calcPayout(
  userShares: bigint,
  roundTotalShares: bigint,
  collateralPool: bigint,
  decimals: number
): string {
  if (roundTotalShares === 0n || userShares === 0n) return '—';
  const payout = (userShares * collateralPool) / roundTotalShares;
  return fmt(payout, decimals);
}

/* ─── Types ──────────────────────────────────────────────────────── */

interface TradeRecord {
  roundId: number;
  assetId: number;
  asset: string;
  roundNumber: number;
  startPrice: bigint;
  endPrice: bigint;
  /** User's shares */
  upShares: bigint;
  downShares: bigint;
  /** Round-total shares (all users) — used for payout calc */
  roundUpShares: bigint;
  roundDownShares: bigint;
  upPool: bigint;
  downPool: bigint;
  collateralPool: bigint;
  isResolved: boolean;
  upWins: boolean;
  wonSide: 'UP' | 'DOWN' | null;
  hasClaimed: boolean;
  canClaim: boolean;
}

type TradeFilter = 'all' | 'wins' | 'losses';

interface TusdcInfo { symbol: string; balance: bigint }

/* ─── Styles ─────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
  section: { border: '1px solid #0D0B08', padding: '28px 24px' } as React.CSSProperties,
};

/* ─── Component ──────────────────────────────────────────────────── */

export default function ProfileTerminal() {
  const router = useRouter();
  const { account, provider, contract, connectWallet } = useWallet();

  const [tusdc, setTusdc] = useState<TusdcInfo | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [tokenSymbol, setTokenSymbol] = useState('TUSDC');

  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  // Agent trade attribution: key = "roundId-SIDE", value = agent name
  const [agentTradeMap, setAgentTradeMap] = useState<Map<string, string>>(new Map());
  const [agentName, setAgentName] = useState<string>('');

  // Single claim
  const [claimingRound, setClaimingRound] = useState<number | null>(null);

  // Batch claim
  const [claimingAll, setClaimingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<BatchClaimResult[] | null>(null);

  const [claimMsg, setClaimMsg] = useState('');

  // Display name
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

  // Social links
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});

  // Filter
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('all');

  /* ── Load balances ─────────────────────────────────────────────── */
  const loadBalances = useCallback(async () => {
    if (!account || !provider) return;
    try {
      const tusdcToken = new ethers.Contract(TUSDC_ADDRESS, ERC20_ABI, provider);
      const [sym, dec, bal] = await Promise.all([
        tusdcToken.symbol() as Promise<string>,
        tusdcToken.decimals() as Promise<bigint>,
        tusdcToken.balanceOf(account) as Promise<bigint>,
      ]);
      setTusdc({ symbol: sym, balance: bal });
      setTokenDecimals(Number(dec));
      setTokenSymbol(sym);
    } catch { setTusdc(null); }
    if (contract) {
      try {
        const collateralAddr = await contract.collateralToken() as string;
        const ct = new ethers.Contract(collateralAddr, ERC20_ABI, provider);
        const [sym, dec] = await Promise.all([
          ct.symbol() as Promise<string>,
          ct.decimals() as Promise<bigint>,
        ]);
        setTokenSymbol(sym);
        setTokenDecimals(Number(dec));
      } catch { /* fallback */ }
    }
  }, [account, provider, contract]);

  /* ── Load trades from chain ────────────────────────────────────── */
  const loadTrades = useCallback(async () => {
    if (!account || !contract) return;
    setLoadingTrades(true);
    try {
      const assetCount = Number(await contract.getAssetCount());
      const results: TradeRecord[] = [];
      for (let assetId = 0; assetId < assetCount; assetId++) {
        const roundIds = await contract.getAssetRoundIds(assetId) as bigint[];
        const slice = roundIds.slice(-20);
        await Promise.all(slice.map(async (roundIdBig) => {
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

            let wonSide: 'UP' | 'DOWN' | null = null;
            if (isResolved) {
              if (upShares > 0n && upWins) wonSide = 'UP';
              else if (downShares > 0n && !upWins) wonSide = 'DOWN';
            }

            results.push({
              roundId, assetId, asset: round.asset as string,
              roundNumber: Number(round.roundNumber as bigint),
              startPrice: round.startPrice as bigint,
              endPrice: round.endPrice as bigint,
              upShares, downShares,
              // round.upShares / round.downShares = totals for all users
              roundUpShares: round.upShares as bigint,
              roundDownShares: round.downShares as bigint,
              upPool: round.upPool as bigint,
              downPool: round.downPool as bigint,
              collateralPool: round.collateralPool as bigint,
              isResolved, upWins, wonSide, hasClaimed,
              canClaim: isResolved && wonSide !== null && !hasClaimed,
            });
          } catch { /* skip inaccessible round */ }
        }));
      }
      results.sort((a, b) => b.roundId - a.roundId);
      setTrades(results);
    } finally { setLoadingTrades(false); }
  }, [account, contract]);

  /* ── Load agent tradeLog for executioner attribution ───────────── */
  const loadAgentData = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/agents/status?wallet=${account}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.enrolled) return;
      const name: string = data.agent?.name || '';
      setAgentName(name);
      const log: Array<{ roundId?: number; side?: string }> = data.tradeLog || [];
      const map = new Map<string, string>();
      for (const entry of log) {
        if (!entry.roundId || !entry.side) continue;
        map.set(`${entry.roundId}-${String(entry.side).toUpperCase()}`, name);
      }
      setAgentTradeMap(map);
    } catch { /* agent data optional */ }
  }, [account]);

  /* ── Load display name ─────────────────────────────────────────── */
  const loadDisplayName = useCallback(async () => {
    if (!account) return;
    try {
      // Use the unified social profile API so we get displayName + socialLinks in one call
      const res = await fetch(`/api/social/profile?wallet=${account}`);
      const json = await res.json();
      setDisplayName(json.displayName || '');
      setNameInput(json.displayName || '');
      setSocialLinks(json.socialLinks || {});
    } catch { setDisplayName(''); }
  }, [account]);

  const saveDisplayName = async () => {
    if (!account) return;
    setSavingName(true); setNameMsg('');
    try {
      const res = await fetch('/api/social/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: account, displayName: nameInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setDisplayName(json.displayName);
      setNameMsg('Saved — visible on the leaderboard.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setNameMsg(err.message || 'Save failed');
    } finally { setSavingName(false); }
  };

  useEffect(() => {
    loadBalances();
    loadTrades();
    loadDisplayName();
    loadAgentData();
  }, [loadBalances, loadTrades, loadDisplayName, loadAgentData]);

  /* ── Single claim ──────────────────────────────────────────────── */
  const claimWinnings = async (roundId: number) => {
    if (!contract || !provider || !account) return;
    setClaimingRound(roundId); setClaimMsg(''); setBatchResults(null);
    try {
      setClaimMsg('Sign in MetaMask (no AVAX gas — relayer pays)…');
      await relayClaimWinnings({ provider, account, contract, roundId });
      setClaimMsg('Winnings sent to your wallet!');
      await Promise.all([loadBalances(), loadTrades()]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setClaimMsg(err.shortMessage || err.message || 'Claim failed');
    } finally { setClaimingRound(null); }
  };

  /* ── Batch claim ───────────────────────────────────────────────── */
  const claimableIds = trades.filter((t) => t.canClaim).map((t) => t.roundId);

  const claimAllWinnings = async () => {
    if (!contract || !provider || !account || !claimableIds.length) return;
    setClaimingAll(true);
    setBatchResults(null);
    setBatchProgress({ done: 0, total: claimableIds.length });
    setClaimMsg(`Sign once in MetaMask — relayer will claim all ${claimableIds.length} rounds (no AVAX gas).`);
    try {
      const results = await relayClaimAll({
        provider, account, contract,
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
      await Promise.all([loadBalances(), loadTrades()]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setClaimMsg(err.message || 'Batch claim failed');
    } finally {
      setClaimingAll(false);
      setBatchProgress(null);
    }
  };

  /* ── Derived ───────────────────────────────────────────────────── */
  const filteredTrades = trades.filter((t) => {
    if (tradeFilter === 'wins') return t.isResolved && t.wonSide !== null;
    if (tradeFilter === 'losses') return t.isResolved && t.wonSide === null;
    return true;
  });
  const winCount = trades.filter((t) => t.isResolved && t.wonSide !== null).length;
  const lossCount = trades.filter((t) => t.isResolved && t.wonSide === null).length;
  const msgColor = claimMsg.toLowerCase().includes('fail') ? '#C0392B' : '#27AE60';

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 64px' }}>

      {/* Page header */}
      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ OPERATOR PROFILE</p>
        <h1 style={{ ...S.serif, fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
          Profile
        </h1>
        <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10 }}>
          Your wallet, balances, and recent trades.
        </p>
      </div>

      {!account ? (
        <button type="button" onClick={connectWallet} style={{
          background: '#0D0B08', color: '#FAF8F3', border: 'none',
          padding: '16px 32px', width: '100%',
          fontFamily: '"Courier New", monospace', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Connect Wallet</button>
      ) : (
        <div>

          {/* Wallet card */}
          <section style={{ ...S.section, marginBottom: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <p style={S.label}>Wallet Address</p>
              <p style={{ ...S.mono, fontSize: 13, color: '#0D0B08', marginTop: 4, wordBreak: 'break-all' }}>{account}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={S.label}>Market Contract</p>
              <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 4, wordBreak: 'break-all' }}>{CONTRACT_ADDRESS}</p>
            </div>
            <div style={{ borderTop: '1px solid #0D0B08', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <p style={S.label}>{tokenSymbol} Balance</p>
                <p style={{ ...S.serif, fontSize: 28, fontWeight: 900, color: '#F69D39', margin: '4px 0 0' }}>
                  {tusdc ? fmt(tusdc.balance, tokenDecimals) : '…'}
                </p>
                <p style={{ ...S.mono, fontSize: 9, color: '#888', marginTop: 2 }}>{tokenSymbol} on Fuji</p>
              </div>
              <Link href="/faucet" style={{ textDecoration: 'none' }}>
                <span style={{
                  display: 'inline-block', border: '1px solid #F69D39', color: '#F69D39',
                  padding: '10px 20px', fontFamily: '"Courier New", monospace',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                  Get {tokenSymbol} →
                </span>
              </Link>
            </div>
          </section>

          {/* Display name */}
          <section style={{ ...S.section, marginBottom: 24 }}>
            <p style={S.label}>{displayName ? 'Display name' : 'Set up your pilot name'}</p>
            <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', marginTop: 6, marginBottom: 12 }}>
              Saved to your wallet — shown on the leaderboard.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Bruceeee"
                maxLength={32}
                style={{
                  flex: '1 1 180px', border: '1px solid #0D0B08', background: '#FAF8F3',
                  padding: '10px 14px', ...S.mono, fontSize: 13, color: '#0D0B08',
                }}
              />
              <button type="button" onClick={saveDisplayName} disabled={savingName} style={{
                background: '#0D0B08', color: '#FAF8F3', border: 'none',
                padding: '10px 20px', ...S.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                opacity: savingName ? 0.5 : 1,
              }}>
                {savingName ? 'Saving…' : 'Save name'}
              </button>
            </div>
            {nameMsg ? <p style={{ ...S.mono, fontSize: 11, color: '#27AE60', marginTop: 8 }}>{nameMsg}</p> : null}
          </section>

          {/* ── Social Accounts ────────────────────── */}
          <section style={{ ...S.section, marginBottom: 24 }}>
            <SocialLinker
              wallet={account}
              initialLinks={socialLinks}
              onSaved={(updated) => setSocialLinks(updated)}
            />
          </section>

          {/* Claim status / progress */}
          {claimMsg && (
            <div style={{
              border: `1px solid ${msgColor}`, background: `${msgColor}0F`,
              padding: '12px 16px', ...S.mono, fontSize: 12, color: msgColor, marginBottom: 24,
            }}>
              {claimMsg}
              {batchProgress && !batchResults && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 4, background: 'rgba(13,11,8,0.1)', borderRadius: 2 }}>
                    <div style={{
                      height: 4, background: '#27AE60', borderRadius: 2,
                      width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <p style={{ ...S.mono, fontSize: 10, color: '#888', marginTop: 6 }}>
                    {batchProgress.done} / {batchProgress.total} processed
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Batch results */}
          {batchResults && batchResults.length > 0 && (
            <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ ...S.label, marginBottom: 12 }}>Batch Claim Results</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {batchResults.map((r) => (
                  <div key={r.roundId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', ...S.mono, fontSize: 11 }}>
                    <span style={{ color: '#0D0B08' }}>Round #{r.roundId}</span>
                    {r.ok ? (
                      <span style={{ color: '#27AE60' }}>
                        ✓ Claimed
                        {r.hash ? (
                          <a href={`https://testnet.snowtrace.io/tx/${r.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#F69D39', marginLeft: 8, textDecoration: 'none' }}>Tx ↗</a>
                        ) : null}
                      </span>
                    ) : (
                      <span style={{ color: '#C0392B' }}>✗ {r.error || 'Failed'}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent Trades header ──────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <h2 style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Recent Trades</h2>
              <button type="button" onClick={() => { loadTrades(); loadAgentData(); }} disabled={loadingTrades} style={{
                ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', border: '1px solid #0D0B08',
                background: 'transparent', color: '#888', padding: '6px 14px',
                cursor: 'pointer', opacity: loadingTrades ? 0.4 : 1,
              }}>
                {loadingTrades ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #0D0B08', marginBottom: 16 }}>
              {(
                [
                  { key: 'all', label: `All (${trades.length})` },
                  { key: 'wins', label: `Wins (${winCount})`, color: '#27AE60' },
                  { key: 'losses', label: `Losses (${lossCount})`, color: '#C0392B' },
                ] as { key: TradeFilter; label: string; color?: string }[]
              ).map((tab) => {
                const active = tradeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTradeFilter(tab.key)}
                    style={{
                      ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', padding: '8px 16px',
                      border: 'none', borderBottom: active ? `2px solid ${tab.color || '#0D0B08'}` : '2px solid transparent',
                      background: 'transparent', color: active ? (tab.color || '#0D0B08') : '#888',
                      cursor: 'pointer', marginBottom: -1,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Claim All bar */}
            {claimableIds.length > 1 && tradeFilter !== 'losses' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12, padding: '14px 16px',
                border: '1px solid #27AE60', background: 'rgba(39,174,96,0.06)', marginBottom: 16,
              }}>
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
                  disabled={claimingAll || claimingRound !== null}
                  style={{
                    background: '#27AE60', color: '#FAF8F3', border: 'none',
                    padding: '12px 24px', ...S.mono, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                    opacity: claimingAll || claimingRound !== null ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {claimingAll ? (
                    <>
                      <span style={{ width: 10, height: 10, border: '2px solid #FAF8F3', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                      {batchProgress ? `Claiming ${batchProgress.done}/${batchProgress.total}…` : 'Signing…'}
                    </>
                  ) : `Claim All (${claimableIds.length})`}
                </button>
              </div>
            )}
          </div>

          {/* Trade list */}
          {loadingTrades && trades.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ border: '1px solid rgba(13,11,8,0.1)', padding: 20 }}>
                  <div style={{ height: 16, background: 'rgba(13,11,8,0.06)', marginBottom: 8 }} />
                  <div style={{ height: 12, background: 'rgba(13,11,8,0.04)', width: '60%' }} />
                </div>
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <div style={{ ...S.section, textAlign: 'center' }}>
              {trades.length === 0 ? (
                <>
                  <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>No trades found for this wallet.</p>
                  <Link href="/markets" style={{ textDecoration: 'none' }}>
                    <span style={{ ...S.serif, fontSize: 14, color: '#C0392B', fontWeight: 700, display: 'inline-block', marginTop: 12 }}>Go to Markets →</span>
                  </Link>
                </>
              ) : (
                <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>
                  No {tradeFilter === 'wins' ? 'winning' : 'losing'} trades in this range.
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredTrades.map((trade) => {
                const userSide = trade.upShares > 0n ? 'UP' : 'DOWN';
                const isWinner = trade.isResolved && trade.wonSide !== null;
                const isLoser = trade.isResolved && trade.wonSide === null;
                const borderColor = !trade.isResolved ? '#F69D39' : isWinner ? '#27AE60' : '#C0392B';
                const batchDone = batchResults?.find((r) => r.roundId === trade.roundId);

                // Staked amount: user's shares = TUSDC deposited (1:1 at entry)
                const stakedShares = userSide === 'UP' ? trade.upShares : trade.downShares;
                const stakedDisplay = fmt(stakedShares, tokenDecimals);

                // Estimated payout for winners
                const roundWinShares = isWinner
                  ? (trade.wonSide === 'UP' ? trade.roundUpShares : trade.roundDownShares)
                  : 0n;
                const payoutDisplay = isWinner
                  ? calcPayout(stakedShares, roundWinShares, trade.collateralPool, tokenDecimals)
                  : null;

                // Profit = payout - stake
                let profitDisplay: string | null = null;
                if (isWinner && roundWinShares > 0n && stakedShares > 0n) {
                  const payout = (stakedShares * trade.collateralPool) / roundWinShares;
                  const profit = payout - stakedShares;
                  profitDisplay = `+${fmt(profit, tokenDecimals)}`;
                }

                // Executioner: check agent trade map
                const tradeKey = `${trade.roundId}-${userSide}`;
                const executorAgentName = agentTradeMap.get(tradeKey);
                const executedByAgent = Boolean(executorAgentName);

                return (
                  <div key={trade.roundId} style={{ border: '1px solid #0D0B08', borderLeft: `4px solid ${borderColor}`, padding: '16px 20px' }}>

                    {/* Row 1: title + side badge + executioner + chart link */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => router.push(`/markets/trade?asset=${trade.assetId}`)}
                        style={{
                          ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08',
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          textDecoration: 'underline', textDecorationColor: 'rgba(13,11,8,0.25)',
                          textDecorationStyle: 'dotted',
                        }}
                        title={`Open ${trade.asset} chart`}
                      >
                        {trade.asset} — Round #{trade.roundNumber}
                      </button>
                      <span style={{
                        padding: '2px 10px', ...S.mono, fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        background: userSide === 'UP' ? '#27AE60' : '#C0392B', color: '#FAF8F3',
                      }}>{userSide}</span>
                      {/* Executioner badge */}
                      <span style={{
                        padding: '2px 8px', ...S.mono, fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.1em', border: '1px solid rgba(13,11,8,0.2)',
                        color: executedByAgent ? '#1A6EA8' : '#888',
                        background: executedByAgent ? 'rgba(26,110,168,0.08)' : 'transparent',
                      }}>
                        {executedByAgent ? `🤖 ${executorAgentName}` : '👤 You (manual)'}
                      </span>

                      {/* Chart link */}
                      <Link
                        href={`/markets/trade?asset=${trade.assetId}`}
                        style={{ ...S.mono, fontSize: 9, color: '#C0392B', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                        title={`View ${trade.asset} chart & market data`}
                      >
                        📈 Chart
                      </Link>
                    </div>

                    {/* Row 2: amounts + prices */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div>

                        {/* Staked + payout line */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 6 }}>
                          <div>
                            <p style={S.label}>Staked</p>
                            <p style={{ ...S.serif, fontSize: 17, fontWeight: 900, color: '#0D0B08', margin: '2px 0 0' }}>
                              {stakedDisplay} {tokenSymbol}
                            </p>
                          </div>
                          {isWinner && payoutDisplay ? (
                            <div>
                              <p style={S.label}>Est. Payout</p>
                              <p style={{ ...S.serif, fontSize: 17, fontWeight: 900, color: '#27AE60', margin: '2px 0 0' }}>
                                {payoutDisplay} {tokenSymbol}
                              </p>
                              {profitDisplay ? (
                                <p style={{ ...S.mono, fontSize: 10, color: '#27AE60', marginTop: 2 }}>({profitDisplay} profit)</p>
                              ) : null}
                            </div>
                          ) : null}
                          {isLoser ? (
                            <div>
                              <p style={S.label}>Result</p>
                              <p style={{ ...S.mono, fontSize: 12, color: '#C0392B', margin: '4px 0 0', fontWeight: 700 }}>
                                −{stakedDisplay} {tokenSymbol}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        {/* Shares + prices */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          {trade.upShares > 0n && <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>{fmt(trade.upShares, 0, 0)} UP shares</span>}
                          {trade.downShares > 0n && <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>{fmt(trade.downShares, 0, 0)} DOWN shares</span>}
                          {trade.isResolved && (
                            <>
                              <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>Start ${fmt(trade.startPrice, 8, 4)}</span>
                              <span style={{ ...S.mono, fontSize: 10, color: '#888' }}>End ${fmt(trade.endPrice, 8, 4)}</span>
                              <span style={{ ...S.mono, fontSize: 10, color: trade.upWins ? '#27AE60' : '#C0392B' }}>
                                {trade.upWins ? 'UP won' : 'DOWN won'}
                              </span>
                            </>
                          )}
                          {!trade.isResolved && (
                            <span style={{ ...S.mono, fontSize: 10, color: '#F69D39' }}>Live / pending settlement</span>
                          )}
                        </div>
                      </div>

                      {/* Action area */}
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        {/* Already claimed via batch */}
                        {batchDone?.ok ? (
                          <span style={{ border: '1px solid #27AE60', color: '#27AE60', padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700 }}>
                            Claimed ✓
                            {batchDone.hash ? (
                              <a href={`https://testnet.snowtrace.io/tx/${batchDone.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#F69D39', marginLeft: 8, textDecoration: 'none' }}>Tx ↗</a>
                            ) : null}
                          </span>
                        ) : null}

                        {/* Claim button — shows amount */}
                        {trade.canClaim && !batchDone?.ok ? (
                          <button
                            type="button"
                            onClick={() => claimWinnings(trade.roundId)}
                            disabled={claimingRound === trade.roundId || claimingAll}
                            style={{
                              background: '#27AE60', color: '#FAF8F3', border: 'none',
                              padding: '10px 18px', ...S.mono, fontSize: 10, fontWeight: 700,
                              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                              opacity: (claimingRound === trade.roundId || claimingAll) ? 0.6 : 1,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            }}
                          >
                            {claimingRound === trade.roundId ? 'Claiming…' : (
                              <>
                                <span>Claim {tokenSymbol}</span>
                                {payoutDisplay ? (
                                  <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>{payoutDisplay}</span>
                                ) : null}
                              </>
                            )}
                          </button>
                        ) : null}

                        {/* Already claimed in a previous session */}
                        {trade.isResolved && trade.wonSide !== null && trade.hasClaimed && !trade.canClaim && !batchDone?.ok ? (
                          <span style={{ border: '1px solid #27AE60', color: '#27AE60', padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700 }}>
                            Claimed ✓
                          </span>
                        ) : null}

                        {/* Lost */}
                        {isLoser ? (
                          <span style={{ border: '1px solid #C0392B', color: '#C0392B', padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700 }}>
                            Lost
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
