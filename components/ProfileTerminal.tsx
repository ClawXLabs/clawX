import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, ERC20_ABI, TUSDC_ADDRESS } from '../utils/contract';
import { relayClaimWinnings } from '../utils/relayClaim';

/* ─── Helpers ────────────────────────────────────────────────────── */

function fmt(value: bigint | null | undefined, decimals = 6, maxFrac = 4): string {
  if (value === null || value === undefined) return '—';
  const max = Number.isFinite(maxFrac) ? Math.min(20, Math.max(0, Math.floor(maxFrac))) : 4;
  const min = Math.min(max, max === 0 ? 0 : 2);
  return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: min, maximumFractionDigits: max,
  });
}

/* ─── Types ──────────────────────────────────────────────────────── */

interface TradeRecord {
  roundId: number; assetId: number; asset: string; roundNumber: number;
  startPrice: bigint; endPrice: bigint; upShares: bigint; downShares: bigint;
  upPool: bigint; downPool: bigint; collateralPool: bigint;
  isResolved: boolean; upWins: boolean; wonSide: 'UP' | 'DOWN' | null;
  hasClaimed: boolean; canClaim: boolean;
}

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
  const { account, provider, contract, connectWallet } = useWallet();
  const [tusdc, setTusdc] = useState<TusdcInfo | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [tokenSymbol, setTokenSymbol] = useState('TUSDC');
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [claimingRound, setClaimingRound] = useState<number | null>(null);
  const [claimMsg, setClaimMsg] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

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
      setTokenDecimals(Number(dec)); setTokenSymbol(sym);
    } catch { setTusdc(null); }
    if (contract) {
      try {
        const collateralAddr = await contract.collateralToken() as string;
        const ct = new ethers.Contract(collateralAddr, ERC20_ABI, provider);
        const [sym, dec] = await Promise.all([ct.symbol() as Promise<string>, ct.decimals() as Promise<bigint>]);
        setTokenSymbol(sym); setTokenDecimals(Number(dec));
      } catch { /* fallback to TUSDC defaults */ }
    }
  }, [account, provider, contract]);

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
            if (upShares === BigInt(0) && downShares === BigInt(0)) return;
            const hasClaimed = position.claimed as boolean;
            const isResolved = round.resolved as boolean;
            const upWins = round.upWins as boolean;
            let wonSide: 'UP' | 'DOWN' | null = null;
            if (isResolved) {
              if (upShares > BigInt(0) && upWins) wonSide = 'UP';
              else if (downShares > BigInt(0) && !upWins) wonSide = 'DOWN';
            }
            results.push({
              roundId, assetId, asset: round.asset as string,
              roundNumber: Number(round.roundNumber as bigint),
              startPrice: round.startPrice as bigint, endPrice: round.endPrice as bigint,
              upShares, downShares,
              upPool: round.upPool as bigint, downPool: round.downPool as bigint,
              collateralPool: round.collateralPool as bigint,
              isResolved, upWins, wonSide, hasClaimed,
              canClaim: isResolved && wonSide !== null && !hasClaimed,
            });
          } catch { /* skip */ }
        }));
      }
      results.sort((a, b) => b.roundId - a.roundId);
      setTrades(results);
    } finally { setLoadingTrades(false); }
  }, [account, contract]);

  const loadDisplayName = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/agents/profile?wallet=${account}`);
      const json = await res.json();
      setDisplayName(json.displayName || '');
      setNameInput(json.displayName || '');
    } catch {
      setDisplayName('');
    }
  }, [account]);

  const saveDisplayName = async () => {
    if (!account) return;
    setSavingName(true);
    setNameMsg('');
    try {
      const res = await fetch('/api/agents/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: account, displayName: nameInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setDisplayName(json.displayName);
      setNameMsg('Saved — visible on the leaderboard.');
    } catch (e: any) {
      setNameMsg(e.message || 'Save failed');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => { loadBalances(); loadTrades(); loadDisplayName(); }, [loadBalances, loadTrades, loadDisplayName]);

  const claimWinnings = async (roundId: number) => {
    if (!contract || !provider || !account) return;
    setClaimingRound(roundId); setClaimMsg('');
    try {
      setClaimMsg('Confirm the signature in MetaMask (no AVAX gas — relayer pays).');
      await relayClaimWinnings({ provider, account, contract, roundId });
      setClaimMsg('Winnings sent to your wallet!');
      await Promise.all([loadBalances(), loadTrades()]);
    } catch (e: any) {
      setClaimMsg(e.shortMessage || e.message || 'Claim failed');
    } finally { setClaimingRound(null); }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 64px' }}>
      {/* ── Page header ────────────────────────────── */}
      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
        <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ OPERATOR PROFILE</p>
        <h1 style={{ ...S.serif, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
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
        }}>
          Connect Wallet
        </button>
      ) : (
        <div>
          {/* ── Wallet card ──────────────────────────── */}
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
              {/* Balance stat */}
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

          {/* Claim message */}
          {claimMsg && (
            <div style={{ border: '1px solid #27AE60', background: 'rgba(39,174,96,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#27AE60', marginBottom: 24 }}>
              {claimMsg}
            </div>
          )}

          {/* ── Trade history ────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Recent Trades</h2>
            <button type="button" onClick={() => loadTrades()} disabled={loadingTrades} style={{
              ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', border: '1px solid #0D0B08',
              background: 'transparent', color: '#888', padding: '6px 14px',
              cursor: 'pointer', opacity: loadingTrades ? 0.4 : 1,
            }}>
              {loadingTrades ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {loadingTrades && trades.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ border: '1px solid rgba(13,11,8,0.1)', padding: 20 }}>
                  <div style={{ height: 16, background: 'rgba(13,11,8,0.06)', marginBottom: 8 }} />
                  <div style={{ height: 12, background: 'rgba(13,11,8,0.04)', width: '60%' }} />
                </div>
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div style={{ ...S.section, textAlign: 'center' }}>
              <p style={{ ...S.mono, fontSize: 12, color: '#888' }}>No trades found for this wallet.</p>
              <Link href="/markets" style={{ textDecoration: 'none' }}>
                <span style={{ ...S.serif, fontSize: 14, color: '#C0392B', fontWeight: 700, display: 'inline-block', marginTop: 12 }}>Go to Markets →</span>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trades.map((trade) => {
                const userSide = trade.upShares > BigInt(0) ? 'UP' : 'DOWN';
                const isWinner = trade.isResolved && trade.wonSide !== null;
                const isLoser = trade.isResolved && trade.wonSide === null;
                const borderColor = !trade.isResolved ? '#F69D39' : isWinner ? '#27AE60' : '#C0392B';

                return (
                  <div key={trade.roundId} style={{ border: '1px solid #0D0B08', borderLeft: `4px solid ${borderColor}`, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ ...S.serif, fontSize: 15, fontWeight: 900, color: '#0D0B08' }}>{trade.asset} — Round #{trade.roundNumber}</span>
                          <span style={{
                            padding: '2px 10px', ...S.mono, fontSize: 9, fontWeight: 700,
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            background: userSide === 'UP' ? '#27AE60' : '#C0392B', color: '#FAF8F3',
                          }}>{userSide}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                          {trade.upShares > BigInt(0) && <span style={{ ...S.mono, fontSize: 11, color: '#888' }}>{fmt(trade.upShares, 0, 0)} UP shares</span>}
                          {trade.downShares > BigInt(0) && <span style={{ ...S.mono, fontSize: 11, color: '#888' }}>{fmt(trade.downShares, 0, 0)} DOWN shares</span>}
                          {trade.isResolved && (
                            <>
                              <span style={{ ...S.mono, fontSize: 11, color: '#888' }}>Start: ${fmt(trade.startPrice, 8, 4)}</span>
                              <span style={{ ...S.mono, fontSize: 11, color: '#888' }}>End: ${fmt(trade.endPrice, 8, 4)}</span>
                              <span style={{ ...S.mono, fontSize: 11, color: trade.upWins ? '#27AE60' : '#C0392B' }}>
                                Result: {trade.upWins ? 'UP won' : 'DOWN won'}
                              </span>
                            </>
                          )}
                          {!trade.isResolved && <span style={{ ...S.mono, fontSize: 11, color: '#F69D39' }}>Live / pending</span>}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {trade.canClaim && (
                          <button type="button" onClick={() => claimWinnings(trade.roundId)} disabled={claimingRound === trade.roundId} style={{
                            background: '#27AE60', color: '#FAF8F3', border: 'none',
                            padding: '8px 16px', ...S.mono, fontSize: 10, fontWeight: 700,
                            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                            opacity: claimingRound === trade.roundId ? 0.6 : 1,
                          }}>
                            {claimingRound === trade.roundId ? 'Claiming…' : `Claim ${tokenSymbol}`}
                          </button>
                        )}
                        {trade.isResolved && trade.wonSide !== null && trade.hasClaimed && (
                          <span style={{ border: '1px solid #27AE60', color: '#27AE60', padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700 }}>Claimed ✓</span>
                        )}
                        {isLoser && (
                          <span style={{ border: '1px solid #C0392B', color: '#C0392B', padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700 }}>Lost</span>
                        )}
                      </div>
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
