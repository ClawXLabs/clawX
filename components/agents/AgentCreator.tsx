import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import AgentCard, { AgentData } from './AgentCard';
import MyAgentBar from './MyAgentBar';
import { useWallet } from '../../contexts/WalletContext';
import { useAgentEnrollment } from '../../hooks/useAgentEnrollment';
import { DEFAULT_TRADE_SIZE_TUSDC } from '../../utils/agents/config';
import { buildAgentDelegateMessage } from '../../utils/agents/delegate';
import { signErc2612Permit } from '../../utils/tradePermit';

const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
];

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

export default function AgentCreator() {
  const router = useRouter();
  const { account, connectWallet } = useWallet();
  const { enrolled } = useAgentEnrollment();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [selected, setSelected] = useState<AgentData | null>(null);
  const [tradeSize, setTradeSize] = useState<number>(DEFAULT_TRADE_SIZE_TUSDC);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (enrolled) router.replace('/agents/dashboard');
  }, [enrolled, router]);

  useEffect(() => {
    fetch('/api/agents/catalog')
      .then((r) => r.json())
      .then((data: { agents?: AgentData[] }) => setAgents(data.agents || []))
      .finally(() => setLoading(false));
  }, []);

  const startAgent = async () => {
    setError('');
    if (!selected) { setError('Select an agent first.'); return; }
    let wallet = account;
    if (!wallet) { wallet = await connectWallet(); if (!wallet) return; }
    setStarting(true);
    try {
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      if (!contractAddress) throw new Error('Market contract not configured');
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('MetaMask required');
      const browserProvider = new ethers.BrowserProvider(eth);
      const signer = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();
      const chainId = Number(network.chainId);
      const delegateDeadline = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
      const delegateMaxRaw = ethers.parseUnits(String(tradeSize * 50), 6).toString();
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
        body: JSON.stringify({ wallet, agentId: selected.id, tradeSizeTusdc: tradeSize, delegateSignature, delegateDeadline, delegateMaxRaw, permit })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not start agent');
      router.push(`/agents/dashboard?agent=${selected.id}`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Start failed');
    } finally { setStarting(false); }
  };

  return (
    <>
      <MyAgentBar />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 64px' }}>
        <Link href="/agents" style={{ textDecoration: 'none' }}>
          <span style={{ ...S.mono, fontSize: 11, color: '#888', display: 'inline-block', marginBottom: 24 }}>← Back to agents</span>
        </Link>

        {/* ── Header ─────────────────────────────────── */}
        <div style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 20, marginBottom: 32 }}>
          <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>◆ DEPLOY AGENT</p>
          <h1 style={{ ...S.serif, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0D0B08', margin: 0 }}>
            New Agent
          </h1>
          <p style={{ ...S.serif, fontSize: 15, lineHeight: 1.6, color: '#5A554E', marginTop: 10 }}>
            Each agent uses AI-style reasoning across all markets. Add <code style={{ ...S.mono, fontSize: 12, background: 'rgba(13,11,8,0.06)', padding: '2px 6px' }}>OPENAI_API_KEY</code> for real GPT decisions.
          </p>
          <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
            {[
              'MetaMask on Avalanche Fuji · TUSDC from faucet',
              'Runner polls every ~8s — fast execution',
              'Already running? Use the green bar above',
            ].map((t, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, ...S.mono, fontSize: 10, color: '#888' }}>
                <span style={{ width: 4, height: 4, background: '#1A6EA8', display: 'inline-block' }} /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Trade size ─────────────────────────────── */}
        <div style={{ border: '1px solid #0D0B08', padding: '20px 20px', marginBottom: 24 }}>
          <label style={S.label}>Trade size per entry</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {[2, 5, 10, 20].map((n) => (
              <button key={n} type="button" onClick={() => setTradeSize(n)} style={{
                ...S.mono, fontSize: 12, fontWeight: 700, padding: '8px 20px',
                border: '1px solid #0D0B08', cursor: 'pointer',
                background: tradeSize === n ? '#F69D39' : 'transparent',
                color: tradeSize === n ? '#0D0B08' : '#5A554E',
                letterSpacing: '0.1em',
              }}>
                {n} TUSDC
              </button>
            ))}
          </div>
        </div>

        {/* ── Agent picker ────────────────────────────── */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ border: '1px solid #0D0B08', padding: 20 }}>
                <div style={{ height: 48, background: 'rgba(13,11,8,0.06)', marginBottom: 12 }} />
                <div style={{ height: 14, background: 'rgba(13,11,8,0.04)', width: '70%' }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {agents.map((agent, index) => (
              <AgentCard key={agent.id} agent={agent} rank={index + 1} selected={selected?.id === agent.id} onSelect={setSelected} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 20, border: '1px solid #C0392B', background: 'rgba(192,57,43,0.06)', padding: '12px 16px', ...S.mono, fontSize: 12, color: '#C0392B' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <button type="button" disabled={!selected || starting} onClick={startAgent} style={{
            background: '#0D0B08', color: '#FAF8F3', border: 'none',
            padding: '14px 28px', ...S.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
            opacity: (!selected || starting) ? 0.4 : 1,
          }}>
            {starting ? '⟳ Starting…' : '▶ Start Trading'}
          </button>
          {!account && (
            <p style={{ ...S.mono, fontSize: 10, color: '#888' }}>MetaMask will open on Fuji when you start.</p>
          )}
        </div>
      </div>
    </>
  );
}
