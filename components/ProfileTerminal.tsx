import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { CONTRACT_ABI, CONTRACT_ADDRESS, ERC20_ABI, TUSDC_ADDRESS } from '../utils/contract';
import { relayClaimWinnings, relayClaimAll, type BatchClaimResult } from '../utils/relayClaim';
import { readBrowserCache, writeBrowserCache } from '../utils/browserCache';
import SocialLinker, { type SocialLinks } from './SocialLinker';
import { Pencil, ChevronLeft, ChevronRight, LineChart } from 'lucide-react';

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

function newspaperDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
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

interface AgentBadge { name: string; emoji: string; color: string }

const PAGE_SIZE = 6;

const PROFILE_CACHE_NS = 'profile-snapshot';

type CachedTrade = Omit<
  TradeRecord,
  | 'startPrice'
  | 'endPrice'
  | 'upShares'
  | 'downShares'
  | 'roundUpShares'
  | 'roundDownShares'
  | 'upPool'
  | 'downPool'
  | 'collateralPool'
> & {
  startPrice: string;
  endPrice: string;
  upShares: string;
  downShares: string;
  roundUpShares: string;
  roundDownShares: string;
  upPool: string;
  downPool: string;
  collateralPool: string;
};

type ProfileSnapshot = {
  displayName: string;
  socialLinks: SocialLinks;
  tusdc: { symbol: string; balance: string } | null;
  tokenDecimals: number;
  tokenSymbol: string;
  trades: CachedTrade[];
  agentTradeMap: Array<[string, AgentBadge]>;
};

function serializeTrades(trades: TradeRecord[]): CachedTrade[] {
  return trades.map((t) => ({
    ...t,
    startPrice: t.startPrice.toString(),
    endPrice: t.endPrice.toString(),
    upShares: t.upShares.toString(),
    downShares: t.downShares.toString(),
    roundUpShares: t.roundUpShares.toString(),
    roundDownShares: t.roundDownShares.toString(),
    upPool: t.upPool.toString(),
    downPool: t.downPool.toString(),
    collateralPool: t.collateralPool.toString(),
  }));
}

function deserializeTrades(rows: CachedTrade[] | undefined): TradeRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((t) => ({
    ...t,
    startPrice: BigInt(t.startPrice || '0'),
    endPrice: BigInt(t.endPrice || '0'),
    upShares: BigInt(t.upShares || '0'),
    downShares: BigInt(t.downShares || '0'),
    roundUpShares: BigInt(t.roundUpShares || '0'),
    roundDownShares: BigInt(t.roundDownShares || '0'),
    upPool: BigInt(t.upPool || '0'),
    downPool: BigInt(t.downPool || '0'),
    collateralPool: BigInt(t.collateralPool || '0'),
  }));
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
  kicker: {
    fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#C0392B',
  } as React.CSSProperties,
  section: { border: '1px solid #0D0B08', padding: '24px' } as React.CSSProperties,
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

  // Agent trade attribution: key = "roundId-SIDE", value = agent badge
  const [agentTradeMap, setAgentTradeMap] = useState<Map<string, AgentBadge>>(new Map());

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
  const [isEditingName, setIsEditingName] = useState(false);

  // Social links
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});

  // Filter + pagination
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('all');
  const [page, setPage] = useState(1);
  const hydratedWalletRef = useRef<string | null>(null);
  const hasTradesCacheRef = useRef(false);

  const persistSnapshot = useCallback(
    (partial: Partial<{
      displayName: string;
      socialLinks: SocialLinks;
      tusdc: TusdcInfo | null;
      tokenDecimals: number;
      tokenSymbol: string;
      trades: TradeRecord[];
      agentTradeMap: Map<string, AgentBadge>;
    }>) => {
      if (!account) return;
      const prev = readBrowserCache<ProfileSnapshot>(PROFILE_CACHE_NS, account) || {
        displayName: '',
        socialLinks: {},
        tusdc: null,
        tokenDecimals: 6,
        tokenSymbol: 'TUSDC',
        trades: [],
        agentTradeMap: [],
      };
      const next: ProfileSnapshot = {
        displayName: partial.displayName ?? prev.displayName,
        socialLinks: partial.socialLinks ?? prev.socialLinks,
        tusdc:
          partial.tusdc === undefined
            ? prev.tusdc
            : partial.tusdc
              ? { symbol: partial.tusdc.symbol, balance: partial.tusdc.balance.toString() }
              : null,
        tokenDecimals: partial.tokenDecimals ?? prev.tokenDecimals,
        tokenSymbol: partial.tokenSymbol ?? prev.tokenSymbol,
        trades: partial.trades ? serializeTrades(partial.trades) : prev.trades,
        agentTradeMap: partial.agentTradeMap
          ? Array.from(partial.agentTradeMap.entries())
          : prev.agentTradeMap,
      };
      writeBrowserCache(PROFILE_CACHE_NS, next, account);
    },
    [account]
  );

  // Instant hydrate from browser cache for this wallet
  useLayoutEffect(() => {
    if (!account) {
      hydratedWalletRef.current = null;
      hasTradesCacheRef.current = false;
      return;
    }
    if (hydratedWalletRef.current === account.toLowerCase()) return;
    hydratedWalletRef.current = account.toLowerCase();
    const snap = readBrowserCache<ProfileSnapshot>(PROFILE_CACHE_NS, account);
    if (!snap) {
      hasTradesCacheRef.current = false;
      return;
    }
    setDisplayName(snap.displayName || '');
    setNameInput(snap.displayName || '');
    setSocialLinks(snap.socialLinks || {});
    if (snap.tusdc) {
      try {
        setTusdc({ symbol: snap.tusdc.symbol, balance: BigInt(snap.tusdc.balance) });
      } catch {
        /* ignore */
      }
    }
    if (snap.tokenDecimals) setTokenDecimals(snap.tokenDecimals);
    if (snap.tokenSymbol) setTokenSymbol(snap.tokenSymbol);
    const cachedTrades = deserializeTrades(snap.trades);
    if (cachedTrades.length) {
      setTrades(cachedTrades);
      setLoadingTrades(false);
      hasTradesCacheRef.current = true;
    } else {
      hasTradesCacheRef.current = false;
    }
    if (snap.agentTradeMap?.length) {
      setAgentTradeMap(new Map(snap.agentTradeMap));
    }
  }, [account]);

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
      const nextTusdc = { symbol: sym, balance: bal };
      setTusdc(nextTusdc);
      setTokenDecimals(Number(dec));
      setTokenSymbol(sym);
      persistSnapshot({
        tusdc: nextTusdc,
        tokenDecimals: Number(dec),
        tokenSymbol: sym,
      });
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
        persistSnapshot({ tokenSymbol: sym, tokenDecimals: Number(dec) });
      } catch { /* fallback */ }
    }
  }, [account, provider, contract, persistSnapshot]);

  /* ── Load trades from chain ────────────────────────────────────── */
  const loadTrades = useCallback(async (opts?: { silent?: boolean }) => {
    if (!account || !contract) return;
    const silent = opts?.silent ?? hasTradesCacheRef.current;
    if (!silent) setLoadingTrades(true);
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
      hasTradesCacheRef.current = results.length > 0;
      persistSnapshot({ trades: results });
    } finally {
      setLoadingTrades(false);
    }
  }, [account, contract, persistSnapshot]);

  /* ── Load agent tradeLog for executioner attribution ───────────── */
  const loadAgentData = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/agents/status?wallet=${account}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.enrolled) return;
      const badge: AgentBadge = {
        name: data.agent?.name || 'Agent',
        emoji: data.agent?.emoji || '🤖',
        color: data.agent?.color || '#1A6EA8',
      };
      const log: Array<{ roundId?: number; side?: string }> = data.tradeLog || [];
      const map = new Map<string, AgentBadge>();
      for (const entry of log) {
        if (!entry.roundId || !entry.side) continue;
        map.set(`${entry.roundId}-${String(entry.side).toUpperCase()}`, badge);
      }
      setAgentTradeMap(map);
      persistSnapshot({ agentTradeMap: map });
    } catch { /* agent data optional */ }
  }, [account, persistSnapshot]);

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
      persistSnapshot({
        displayName: json.displayName || '',
        socialLinks: json.socialLinks || {},
      });
    } catch { setDisplayName(''); }
  }, [account, persistSnapshot]);

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
      setIsEditingName(false);
      setNameMsg('Saved — visible on the leaderboard.');
      persistSnapshot({ displayName: json.displayName || '' });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setNameMsg(err.message || 'Save failed');
    } finally { setSavingName(false); }
  };

  useEffect(() => {
    loadBalances();
    loadTrades({ silent: true });
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
  const settledCount = winCount + lossCount;
  const winRate = settledCount > 0 ? Math.round((winCount / settledCount) * 100) : null;
  const liveCount = trades.filter((t) => !t.isResolved).length;
  const msgColor = claimMsg.toLowerCase().includes('fail') ? '#C0392B' : '#27AE60';

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTrades = filteredTrades.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const setFilter = (f: TradeFilter) => { setTradeFilter(f); setPage(1); };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 24px 64px' }} className="np-page">

      {/* ── Masthead — compact, single ruled line ────────────────── */}
      <div className="np-fade-up" style={{ borderBottom: '3px double #0D0B08', paddingBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ ...S.serif, fontSize: 22, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.01em', color: '#0D0B08', margin: 0 }}>
              The Pilot Ledger
            </h1>
            <span style={{ ...S.kicker, fontSize: 9 }}>◆ Operator Profile</span>
          </div>
          <p style={{ ...S.mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#888', margin: 0 }}>
            {newspaperDate()}
          </p>
        </div>
      </div>

      {!account ? (
        <div style={{ borderBottom: '1px solid #0D0B08', padding: '48px 0', textAlign: 'center' }}>
          <p style={{ ...S.serif, fontSize: 16, color: '#5A554E', marginBottom: 20 }}>
            Connect a wallet to open your ledger.
          </p>
          <button type="button" onClick={connectWallet} style={{
            background: '#0D0B08', color: '#FAF8F3', border: 'none',
            padding: '16px 48px',
            fontFamily: '"Courier New", monospace', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Connect Wallet</button>
        </div>
      ) : (
        <div>

          {/* ── Identity board ─────────────────────────────────────── */}
          <section className="np-fade-up-1" style={{ borderBottom: '1px solid #0D0B08', padding: '20px 0 18px', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              {/* Editable username header */}
              {!isEditingName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ ...S.serif, fontSize: 26, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
                    {displayName || 'Unnamed Pilot'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    style={{
                      background: 'none', border: 'none', padding: '4px 6px',
                      cursor: 'pointer', color: '#D4A96A', display: 'flex', alignItems: 'center'
                    }}
                    title="Edit pilot name"
                  >
                    <Pencil size={15} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter username..."
                    maxLength={24}
                    style={{
                      border: '1.5px solid #0D0B08', background: '#FAF8F3',
                      padding: '6px 12px', ...S.mono, fontSize: 13, color: '#0D0B08',
                      width: '180px', outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={saveDisplayName}
                    disabled={savingName}
                    style={{
                      background: '#0D0B08', color: '#FAF8F3', border: 'none',
                      padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                      opacity: savingName ? 0.5 : 1
                    }}
                  >
                    {savingName ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(false);
                      setNameInput(displayName);
                    }}
                    style={{
                      background: 'transparent', color: '#888', border: '1px solid rgba(13,11,8,0.2)',
                      padding: '6px 14px', ...S.mono, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {nameMsg ? <p style={{ ...S.mono, fontSize: 10, color: '#27AE60', marginTop: 4, marginBottom: 0 }}>{nameMsg}</p> : null}
              <p style={{ ...S.mono, fontSize: 10, color: '#888', wordBreak: 'break-all', marginTop: 8, marginBottom: 0 }}>{account}</p>
              <p style={{ ...S.mono, fontSize: 9, color: '#B0A894', wordBreak: 'break-all', marginTop: 4, marginBottom: 0 }}>
                Market · {CONTRACT_ADDRESS}
              </p>
            </div>

            {/* Balance + faucet */}
            <div style={{ textAlign: 'right', minWidth: 0, flex: '1 1 160px' }}>
              <p style={{ ...S.label, marginBottom: 4 }}>{tokenSymbol} Balance</p>
              <p style={{ ...S.serif, fontSize: 28, fontWeight: 900, color: '#0D0B08', margin: 0, lineHeight: 1.05 }}>
                {tusdc ? fmt(tusdc.balance, tokenDecimals) : '…'}
              </p>
              <Link href="/faucet" style={{ textDecoration: 'none' }}>
                <span style={{
                  display: 'inline-block', marginTop: 10,
                  border: '1.5px solid #0D0B08', color: '#0D0B08', background: 'transparent',
                  padding: '7px 16px', fontFamily: '"Courier New", monospace',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>
                  Claim testnet {tokenSymbol} →
                </span>
              </Link>
            </div>
          </section>

          {/* ── Stats strip (market-data bar) ──────────────────────── */}
          <section className="np-fade-up-2" style={{ borderBottom: '1px solid #0D0B08', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 100px), 1fr))' }}>
            {[
              { label: 'Trades', value: String(trades.length), color: '#0D0B08' },
              { label: 'Wins', value: String(winCount), color: '#27AE60' },
              { label: 'Losses', value: String(lossCount), color: '#C0392B' },
              { label: 'Win Rate', value: winRate === null ? '—' : `${winRate}%`, color: '#0D0B08' },
              { label: 'Live', value: String(liveCount), color: '#F69D39' },
              { label: 'Claimable', value: String(claimableIds.length), color: claimableIds.length > 0 ? '#27AE60' : '#888' },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                padding: '14px 12px', textAlign: 'center',
                borderLeft: i === 0 ? 'none' : '1px solid rgba(13,11,8,0.15)',
              }}>
                <p style={{ ...S.label, marginBottom: 4 }}>{stat.label}</p>
                <p style={{ ...S.serif, fontSize: 22, fontWeight: 900, color: stat.color, margin: 0, lineHeight: 1 }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </section>

          {/* ── Connected socials ──────────────────────────────────── */}
          <section className="np-fade-up-3" style={{ borderBottom: '1px solid #0D0B08', padding: '24px 0 28px' }}>
            <SocialLinker
              wallet={account}
              initialLinks={socialLinks}
              onSaved={(updated) => {
                setSocialLinks(updated);
                persistSnapshot({ socialLinks: updated });
              }}
            />
          </section>

          {/* ── Trade Ledger ───────────────────────────────────────── */}
          <div className="np-fade-up-4" style={{ padding: '28px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ ...S.serif, fontSize: 24, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Trade Ledger</h2>
              <button type="button" onClick={() => { loadTrades(); loadAgentData(); }} disabled={loadingTrades} style={{
                ...S.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', border: '1px solid #0D0B08',
                background: 'transparent', color: '#5A554E', padding: '6px 14px',
                cursor: 'pointer', opacity: loadingTrades ? 0.4 : 1,
              }}>
                {loadingTrades ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '0 0 14px' }}>
              🤖 agent-executed · 👤 manual — hover an icon for details
            </p>

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
                    onClick={() => setFilter(tab.key)}
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

            {/* Claim status / progress */}
            {claimMsg && (
              <div style={{
                border: `1px solid ${msgColor}`, background: `${msgColor}0F`,
                padding: '12px 16px', ...S.mono, fontSize: 12, color: msgColor, marginBottom: 16,
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
              <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '16px 20px', marginBottom: 16 }}>
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
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pagedTrades.map((trade) => {
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

                    // Executioner: check agent trade map — icon only, name on hover
                    const tradeKey = `${trade.roundId}-${userSide}`;
                    const executorBadge = agentTradeMap.get(tradeKey);

                    return (
                      <div key={trade.roundId} style={{ border: '1px solid #0D0B08', borderLeft: `4px solid ${borderColor}`, padding: '14px 18px' }}>

                        {/* Row 1: title + side badge + executor icon + chart link */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(13,11,8,0.08)' }}>
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

                          {/* Executioner: icon only, tooltip carries the name */}
                          <span
                            title={executorBadge ? `Executed by ${executorBadge.name}` : 'Manual trade (you)'}
                            style={{
                              width: 24, height: 24, display: 'inline-flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 13, cursor: 'default',
                              border: `1px solid ${executorBadge ? executorBadge.color : 'rgba(13,11,8,0.2)'}`,
                              background: executorBadge ? `${executorBadge.color}14` : 'transparent',
                            }}
                          >
                            {executorBadge ? executorBadge.emoji : '👤'}
                          </span>

                          {/* Chart link — pushed to the right */}
                          <Link
                            href={`/markets/trade?asset=${trade.assetId}`}
                            style={{ ...S.mono, fontSize: 9, color: '#C0392B', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
                            title={`View ${trade.asset} chart & market data`}
                          >
                            <LineChart size={12} strokeWidth={2} /> Chart
                          </Link>
                        </div>

                        {/* Row 2: aligned datapoint columns + action */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 90 }}>
                              <p style={S.label}>Staked</p>
                              <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: '2px 0 0' }}>
                                {stakedDisplay}
                              </p>
                            </div>

                            {isWinner && payoutDisplay ? (
                              <div style={{ minWidth: 90 }}>
                                <p style={S.label}>Payout</p>
                                <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#27AE60', margin: '2px 0 0' }}>
                                  {payoutDisplay}
                                </p>
                                {profitDisplay ? (
                                  <p style={{ ...S.mono, fontSize: 9, color: '#27AE60', marginTop: 2 }}>{profitDisplay}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {isLoser ? (
                              <div style={{ minWidth: 90 }}>
                                <p style={S.label}>Result</p>
                                <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#C0392B', margin: '2px 0 0' }}>
                                  −{stakedDisplay}
                                </p>
                              </div>
                            ) : null}

                            {trade.isResolved ? (
                              <div>
                                <p style={S.label}>Open → Close</p>
                                <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', margin: '4px 0 0' }}>
                                  ${fmt(trade.startPrice, 8, 4)} → ${fmt(trade.endPrice, 8, 4)}
                                </p>
                                <p style={{ ...S.mono, fontSize: 9, color: trade.upWins ? '#27AE60' : '#C0392B', marginTop: 2 }}>
                                  {trade.upWins ? '▲ UP won' : '▼ DOWN won'}
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p style={S.label}>Status</p>
                                <p style={{ ...S.mono, fontSize: 11, color: '#F69D39', margin: '4px 0 0', fontWeight: 700 }}>
                                  ● Live / pending
                                </p>
                              </div>
                            )}
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

                {/* Pagination bar */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
                    borderTop: '1px solid #0D0B08', marginTop: 18, paddingTop: 14,
                  }}>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      style={{
                        ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', border: '1px solid #0D0B08',
                        background: 'transparent', color: safePage <= 1 ? '#B0A894' : '#0D0B08',
                        padding: '7px 14px', cursor: safePage <= 1 ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <ChevronLeft size={12} strokeWidth={2.5} /> Prev
                    </button>
                    <span style={{ ...S.mono, fontSize: 11, color: '#5A554E', letterSpacing: '0.1em' }}>
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      style={{
                        ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', border: '1px solid #0D0B08',
                        background: 'transparent', color: safePage >= totalPages ? '#B0A894' : '#0D0B08',
                        padding: '7px 14px', cursor: safePage >= totalPages ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      Next <ChevronRight size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
