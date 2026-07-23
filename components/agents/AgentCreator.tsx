import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import type { AgentData } from './AgentCard';
import AgentBadgeRow from './AgentBadgeRow';
import { useWallet } from '../../contexts/WalletContext';
import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';
import { DEFAULT_TRADE_SIZE_TUSDC } from '../../utils/agents/config';
import { buildAgentDelegateMessage } from '../../utils/agents/delegate';
import { signErc2612Permit } from '../../utils/tradePermit';

const RED = '#C0392B';

const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
];

type WalletLimitsInfo = {
  txUnlimited: boolean;
  txLimit: number | null;
  txUsed: number;
  txRemaining: number | null;
  agentSpendUnlimited: boolean;
  agentSpendLimitTusdc: number | null;
  agentTradeSizeTusdc: number | null;
  delegateMaxTusdc: number;
  relayerBlocked: boolean;
};

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

export default function AgentCreator() {
  const router = useRouter();
  const { account, connectWallet } = useWallet();
  const { enrolled } = useAgentEnrollment();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [selected, setSelected] = useState<AgentData | null>(null);
  const [tradeSize, setTradeSize] = useState<number>(DEFAULT_TRADE_SIZE_TUSDC);
  const [walletLimits, setWalletLimits] = useState<WalletLimitsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (enrolled) router.replace('/agents/dashboard');
  }, [enrolled, router]);

  useEffect(() => {
    fetch('/api/agents/catalog')
      .then((r) => r.json())
      .then((data: { agents?: AgentData[] }) => {
        const next = data.agents || [];
        setAgents(next);
        const q = typeof router.query.agent === 'string' ? router.query.agent : null;
        if (q) {
          const pre = next.find((a) => a.id === q);
          if (pre) setSelected(pre);
        }
      })
      .finally(() => setLoading(false));
  }, [router.query.agent]);

  useEffect(() => {
    if (!account) {
      setWalletLimits(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/agents/wallet-limits?wallet=${encodeURIComponent(account)}`)
      .then((r) => r.json())
      .then((data: WalletLimitsInfo & { error?: string }) => {
        if (cancelled || data.error) return;
        setWalletLimits(data);
        if (data.agentTradeSizeTusdc != null && data.agentTradeSizeTusdc > 0) {
          setTradeSize(data.agentTradeSizeTusdc);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account]);

  const startAgent = async () => {
    setError('');
    if (!selected) { setError('Select an agent first.'); return; }
    let wallet = account;
    if (!wallet) { wallet = await connectWallet(); if (!wallet) return; }
    setStarting(true);
    try {
      const limitsRes = await fetch(`/api/agents/wallet-limits?wallet=${encodeURIComponent(wallet)}`);
      const limits = (await limitsRes.json()) as WalletLimitsInfo & { error?: string };
      if (!limitsRes.ok) throw new Error(limits.error || 'Could not load wallet limits');
      if (limits.relayerBlocked) throw new Error('Agent trading is blocked for this wallet.');
      if (!limits.txUnlimited && limits.txRemaining != null && limits.txRemaining <= 0) {
        throw new Error(`Trade limit reached (${limits.txUsed}/${limits.txLimit}). Contact support to raise or clear it.`);
      }
      if (!limits.agentSpendUnlimited && !(limits.delegateMaxTusdc > 0)) {
        throw new Error('Agent spending is disabled for this wallet.');
      }

      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      if (!contractAddress) throw new Error('Market contract not configured');
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('MetaMask required');
      const browserProvider = new ethers.BrowserProvider(eth);
      const signer = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();
      const chainId = Number(network.chainId);
      const size =
        limits.agentTradeSizeTusdc != null && limits.agentTradeSizeTusdc > 0
          ? limits.agentTradeSizeTusdc
          : tradeSize;
      // Admin-controlled budget (None → large max). No more tradeSize×50 (~100 TUSDC) hardcap.
      const delegateMaxTusdc = Number(limits.delegateMaxTusdc);
      const delegateDeadline = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
      const delegateMaxRaw = ethers.parseUnits(String(delegateMaxTusdc), 6).toString();
      const delegateMessage = buildAgentDelegateMessage({ chainId, contractAddress, trader: wallet, deadline: delegateDeadline, maxAmountRaw: delegateMaxRaw });
      const delegateSignature = await signer.signMessage(delegateMessage);

      const tusdcAddress = process.env.NEXT_PUBLIC_TUSDC_ADDRESS || process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS;
      let permit = null;
      if (tusdcAddress) {
        const token = new ethers.Contract(tusdcAddress, ERC20_ABI, browserProvider);
        const allowance = await token.allowance(wallet, contractAddress) as bigint;
        if (allowance < BigInt(delegateMaxRaw)) {
          try {
            await token.nonces(wallet);
            permit = await signErc2612Permit(signer, tusdcAddress, contractAddress, BigInt(delegateMaxRaw), chainId);
          } catch {
            throw new Error('TUSDC needs market approval. Do one manual trade first (approve when prompted).');
          }
        }
      }
      const res = await fetch('/api/agents/enroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, agentId: selected.id, tradeSizeTusdc: size, delegateSignature, delegateDeadline, delegateMaxRaw, permit })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not start agent');
      router.push(`/agents/dashboard?agent=${selected.id}`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Start failed');
    } finally { setStarting(false); }
  };

  const forcedSize = walletLimits?.agentTradeSizeTusdc != null && walletLimits.agentTradeSizeTusdc > 0;
  const budgetLabel = walletLimits
    ? walletLimits.agentSpendUnlimited
      ? 'None (unlimited)'
      : `${walletLimits.delegateMaxTusdc} TUSDC`
    : '…';
  const txLabel = walletLimits
    ? walletLimits.txUnlimited
      ? 'None (unlimited)'
      : `${walletLimits.txUsed} / ${walletLimits.txLimit} used · ${walletLimits.txRemaining} left`
    : '…';

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link href="/agents" style={{ textDecoration: 'none' }}>
        <span style={{ ...S.mono, fontSize: 11, color: '#888', display: 'inline-block', marginBottom: 24 }}>
          ← Back to agents
        </span>
      </Link>

      <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 14, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1
            style={{
              ...S.serif,
              fontSize: 22,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
              color: '#0D0B08',
              margin: 0,
            }}
          >
            New Agent
          </h1>
          <span style={{ ...S.label, color: RED }}>DEPLOY</span>
        </div>
        <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10 }}>
          Pick a badge, set trade size, then sign the delegation in MetaMask (Fuji).
        </p>
      </div>

      {account && walletLimits ? (
        <div
          style={{
            border: '1px solid rgba(13,11,8,0.28)',
            padding: '14px 16px',
            marginBottom: 20,
            ...S.mono,
            fontSize: 11,
            color: '#5A554E',
          }}
        >
          <div>
            Txn limit: <strong style={{ color: '#0D0B08' }}>{txLabel}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Agent spend budget: <strong style={{ color: '#0D0B08' }}>{budgetLabel}</strong>
          </div>
        </div>
      ) : null}

      <div style={{ border: '1px solid #0D0B08', padding: '20px 20px', marginBottom: 24 }}>
        <label style={S.label}>Trade size per entry{forcedSize ? ' (admin-set)' : ''}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {[2, 5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              disabled={forcedSize}
              onClick={() => setTradeSize(n)}
              style={{
                ...S.mono,
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 20px',
                border: `1px solid ${tradeSize === n ? RED : '#0D0B08'}`,
                cursor: forcedSize ? 'not-allowed' : 'pointer',
                background: tradeSize === n ? RED : 'transparent',
                color: tradeSize === n ? '#FAF8F3' : '#5A554E',
                letterSpacing: '0.1em',
                opacity: forcedSize && tradeSize !== n ? 0.35 : 1,
              }}
            >
              {n} TUSDC
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ ...S.serif, fontSize: 18, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
          Choose an agent
        </h2>
        <p style={{ ...S.mono, fontSize: 10, color: '#888', margin: '6px 0 0' }}>
          Four badges in one row on large screens
        </p>
      </div>

      <AgentBadgeRow
        agents={agents}
        selectedId={selected?.id}
        loading={loading}
        onSelect={setSelected}
      />

      {error ? (
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${RED}`,
            background: 'rgba(192,57,43,0.06)',
            padding: '12px 16px',
            ...S.mono,
            fontSize: 12,
            color: RED,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          disabled={!selected || starting}
          onClick={startAgent}
          style={{
            background: RED,
            color: '#FAF8F3',
            border: `1px solid ${RED}`,
            padding: '14px 28px',
            ...S.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            opacity: !selected || starting ? 0.4 : 1,
          }}
        >
          {starting ? 'Starting…' : 'Start Trading'}
        </button>
        {!account ? (
          <p style={{ ...S.mono, fontSize: 10, color: '#888' }}>
            MetaMask will open on Fuji when you start.
          </p>
        ) : null}
      </div>
    </div>
  );
}
