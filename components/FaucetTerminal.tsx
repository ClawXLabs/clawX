/**
 * FaucetTerminal.tsx — drop-in replacement
 * Requires: gsap  (npm i gsap)
 * Keeps all original logic intact; only UI + animation layer changed.
 */

import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { gsap } from 'gsap';
import { getMetaMaskEthereum, useWallet } from '../contexts/WalletContext';
import { TUSDC_ADDRESS } from '../utils/contract';

/* ─── Constants ──────────────────────────────────────────────────── */

const FUJI_NETWORK = {
  name: 'Avalanche Fuji C-Chain',
  rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
  chainId: '43113',
  symbol: 'AVAX',
  explorer: 'https://testnet.snowtrace.io',
};

const FUJI_CHAIN_ID_HEX = '0xa869';

interface FaucetMessage { type: 'ok' | 'error'; text: string; }

/* ─── Helpers (unchanged) ────────────────────────────────────────── */

async function ensureFujiNetwork(): Promise<{ ok: boolean; error?: string }> {
  const eth = getMetaMaskEthereum();
  if (typeof window === 'undefined' || !eth?.request)
    return { ok: false, error: 'MetaMask not found (disable other wallet extensions in Chrome if needed).' };
  const id = await eth.request({ method: 'eth_chainId' }) as string;
  if (typeof id === 'string' && id.toLowerCase() === FUJI_CHAIN_ID_HEX.toLowerCase()) return { ok: true };
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: FUJI_CHAIN_ID_HEX }] });
    return { ok: true };
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: FUJI_CHAIN_ID_HEX, chainName: FUJI_NETWORK.name,
          nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
          rpcUrls: [FUJI_NETWORK.rpc], blockExplorerUrls: [FUJI_NETWORK.explorer],
        }],
      });
      return { ok: true };
    }
    return { ok: false, error: switchError?.message || 'Please switch MetaMask to Avalanche Fuji (chain 43113).' };
  }
}

async function promptAddTusdcToMetaMask() {
  const eth = getMetaMaskEthereum();
  if (typeof window === 'undefined' || !eth?.request) return;
  const address = ethers.getAddress(TUSDC_ADDRESS);
  await eth.request({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address, symbol: 'TUSDC', decimals: 6 } } as any });
}

/* ─── Data ───────────────────────────────────────────────────────── */

const FUJI_FIELDS = [
  { label: 'Network name', value: FUJI_NETWORK.name,     copyable: false },
  { label: 'RPC URL',      value: FUJI_NETWORK.rpc,      copyable: true  },
  { label: 'Chain ID',     value: FUJI_NETWORK.chainId,  copyable: true  },
  { label: 'Symbol',       value: FUJI_NETWORK.symbol,   copyable: false },
  { label: 'Explorer',     value: FUJI_NETWORK.explorer, copyable: false },
];

const STEPS = [
  { n: 1, text: 'Install MetaMask (browser extension or mobile). Create or import a wallet.' },
  { n: 2, text: 'Open MetaMask → click the network name → Add network (or Add a network manually).' },
  { n: 3, text: null },
  { n: 4, text: 'Save the network, then switch MetaMask to Fuji. You should see 43113 or "Fuji" selected.' },
  { n: 5, text: null }, // filled dynamically with current claim amount
];

function formatCooldownLabel(sec: number) {
  if (!sec || sec <= 0) return 'no cooldown';
  if (sec < 3600) return `every ${sec}s`;
  if (sec % 86400 === 0) {
    const d = sec / 86400;
    return d === 1 ? 'every 24 h' : `every ${d} days`;
  }
  const h = Math.round(sec / 3600);
  return `every ${h}h`;
}

/* ─── Inline styles ──────────────────────────────────────────────── */

const css = {
  mono:  { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace',
    fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#888',
  } as React.CSSProperties,
};

/* ─── Sub-components ─────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  const btnRef = useRef<HTMLButtonElement>(null);

  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      if (btnRef.current) {
        gsap.fromTo(btnRef.current, { scale: 0.88 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' });
      }
      setTimeout(() => setState('idle'), 2000);
    } catch { /* noop */ }
  };

  return (
    <button
      ref={btnRef}
      onClick={handle}
      style={{
        ...css.mono,
        marginLeft: 10, fontSize: 9, fontWeight: 700,
        border: '1px solid #0D0B08',
        background: state === 'copied' ? '#0D0B08' : 'transparent',
        color: state === 'copied' ? '#FAF8F3' : '#0D0B08',
        padding: '2px 8px', cursor: 'pointer',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      {state === 'copied' ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span style={{
      ...css.mono,
      fontSize: 11, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, flexShrink: 0,
      border: '1px solid #0D0B08',
      background: n === 5 ? '#F69D39' : 'transparent',
      color: n === 5 ? '#FAF8F3' : '#0D0B08',
    }}>
      {n}
    </span>
  );
}

/* ─── Pulsing dot shown while loading ────────────────────────────── */

function PulseDot() {
  const dotRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!dotRef.current) return;
    const tl = gsap.to(dotRef.current, {
      scale: 1.6, opacity: 0.3, repeat: -1, yoyo: true,
      duration: 0.6, ease: 'sine.inOut',
    });
    return () => { tl.kill(); };
  }, []);
  return (
    <span ref={dotRef} style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: '#F69D39', marginRight: 8, transformOrigin: 'center',
    }} />
  );
}

/* ─── Animated counter for the "300" hero ────────────────────────── */

function AnimatedCounter({ target }: { target: number }) {
  const numRef = useRef<HTMLSpanElement>(null);
  const obj = useRef({ val: 0 });

  useEffect(() => {
    const tween = gsap.to(obj.current, {
      val: target,
      duration: 1.2,
      ease: 'power2.out',
      delay: 0.6,
      onUpdate: () => {
        if (numRef.current)
          numRef.current.textContent = Math.round(obj.current.val).toString();
      },
    });
    return () => { tween.kill(); };
  }, [target]);

  return <span ref={numRef}>0</span>;
}

/* ─── Main component ─────────────────────────────────────────────── */

export default function FaucetTerminal() {
  const { account, connectWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<FaucetMessage | null>(null);
  const [amountTusdc, setAmountTusdc] = useState(300);
  const [cooldownSec, setCooldownSec] = useState(86400);
  const [paused, setPaused] = useState(false);
  const [configReady, setConfigReady] = useState(false);

  const rootRef    = useRef<HTMLDivElement>(null);
  const headerRef  = useRef<HTMLDivElement>(null);
  const guideRef   = useRef<HTMLElement>(null);
  const claimRef   = useRef<HTMLElement>(null);
  const claimBtnRef = useRef<HTMLButtonElement>(null);
  const msgRef     = useRef<HTMLDivElement>(null);
  const prevMsg    = useRef<FaucetMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/faucet-config');
        const data = await res.json();
        if (cancelled || !res.ok) return;
        if (Number.isFinite(Number(data.amountTusdc))) setAmountTusdc(Number(data.amountTusdc));
        if (Number.isFinite(Number(data.cooldownSec))) setCooldownSec(Number(data.cooldownSec));
        setPaused(Boolean(data.paused));
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Page-load entrance animation ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from(headerRef.current, { y: 28, opacity: 0, duration: 0.65 })
        .from(claimRef.current,  { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
        .from(guideRef.current,  { y: 20, opacity: 0, duration: 0.5 }, '-=0.25');

      /* stagger step list items */
      tl.from('.faucet-step', { y: 14, opacity: 0, stagger: 0.09, duration: 0.4 }, 0.35);

      /* stagger checklist bullets */
      tl.from('.faucet-bullet', { x: -10, opacity: 0, stagger: 0.08, duration: 0.35 }, 0.7);
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* ── Animate message banner in/out ── */
  useEffect(() => {
    if (message && msgRef.current) {
      gsap.fromTo(
        msgRef.current,
        { y: -8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
      );
    }
    prevMsg.current = message;
  }, [message]);

  /* ── Button hover / press ── */
  const handleBtnHover = (el: HTMLElement, enter: boolean) => {
    gsap.to(el, { scale: enter ? 1.025 : 1, duration: 0.2, ease: 'power2.out' });
  };

  const handleBtnPress = (el: HTMLElement) => {
    gsap.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' });
  };

  /* ── Core faucet logic (unchanged) ── */
  const getTusdc = async () => {
    if (claimBtnRef.current) handleBtnPress(claimBtnRef.current);
    setLoading(true); setMessage(null);
    try {
      let recipient = account;
      if (!recipient) {
        recipient = await connectWallet();
        if (!recipient) {
          setMessage({ type: 'error', text: 'Connect MetaMask to receive tokens at your address.' });
          return;
        }
      }
      const net = await ensureFujiNetwork();
      if (!net.ok) {
        setMessage({ type: 'error', text: net.error || 'Switch MetaMask to Avalanche Fuji (43113), then try again.' });
        return;
      }
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: recipient }),
      });
      const data = await response.json() as {
        error?: string;
        balance?: string;
        hash?: string;
        amountTusdc?: number;
      };
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || 'Claim failed' });
      } else {
        try { await promptAddTusdcToMetaMask(); } catch { /* dismissed */ }
        const minted = data.amountTusdc ?? amountTusdc;
        const balText = data.balance != null ? ` Balance: ${ethers.formatUnits(data.balance, 6)} TUSDC.` : '';
        setMessage({ type: 'ok', text: `${minted} TUSDC minted on Fuji.${balText} Tx: ${data.hash || 'n/a'}.` });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  /* ── Add-to-MetaMask handler ── */
  const handleAddToken = async (e: React.MouseEvent<HTMLButtonElement>) => {
    handleBtnPress(e.currentTarget);
    try {
      const net = await ensureFujiNetwork();
      if (!net.ok) { setMessage({ type: 'error', text: net.error || 'Switch to Fuji first.' }); return; }
      await promptAddTusdcToMetaMask();
      setMessage({ type: 'ok', text: 'If MetaMask opened a prompt, confirm to list TUSDC.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Could not add token' });
    }
  };

  /* ────────────────────────────────── Render ─── */
  return (
    <div ref={rootRef} style={{ maxWidth: 680, margin: '0 auto', padding: '20px 24px 80px' }} className="np-page">

      {/* ── Header — compact ────────────────────── */}
      <div ref={headerRef} style={{ borderBottom: '2px solid #0D0B08', paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{
            ...css.serif,
            fontSize: 22,
            fontWeight: 900, lineHeight: 1.1,
            letterSpacing: '-0.01em', color: '#0D0B08', margin: 0,
          }}>
            Claim&nbsp;
            <span style={{ color: '#F69D39' }}>
              <AnimatedCounter target={amountTusdc} />
            </span>
            &nbsp;TUSDC
          </h1>
          <span style={{ ...css.label, color: '#C0392B' }}>◆ TESTNET FAUCET</span>
        </div>
        <p style={{ ...css.serif, fontSize: 13, lineHeight: 1.6, color: '#5A554E', marginTop: 8, maxWidth: 520 }}>
          Connect your MetaMask on Fuji, click one button, and receive testnet tokens —
          no AVAX required, we pay gas.
        </p>
      </div>

      {/* ── Claim card ──────────────────────────── */}
      <section ref={claimRef} style={{ border: '2px solid #0D0B08', padding: '20px 16px', marginBottom: 24 }}>

        {/* ── Decorative top bar (animated gradient shimmer) ── */}
        <div style={{
          height: 4, background: 'linear-gradient(90deg,#F69D39,#C0392B,#F69D39)',
          backgroundSize: '200% 100%',
          marginBottom: 24, marginLeft: -28, marginRight: -28, marginTop: -32,
          animation: 'shimmer 3s linear infinite',
        }} />

        <style>{`
          @keyframes shimmer { to { background-position: 200% center; } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>

        <p style={{ ...css.label, color: '#C0392B', marginBottom: 8 }}>◆ CLAIM</p>

        {/* Big token number */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h2 style={{
            ...css.serif,
            fontSize: 'clamp(2.8rem, 6vw, 4rem)',
            fontWeight: 900, color: '#0D0B08', margin: 0, lineHeight: 1,
          }}>
            {amountTusdc}
          </h2>
          <span style={{
            ...css.serif,
            fontSize: 'clamp(2rem, 4vw, 2.8rem)',
            fontWeight: 900, color: '#F69D39', lineHeight: 1,
          }}>TUSDC</span>
          <span style={{
            ...css.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: '#888', alignSelf: 'flex-end', paddingBottom: 6,
          }}>/ CLAIM</span>
        </div>

        <p style={{ ...css.mono, fontSize: 10, color: '#aaa', marginBottom: 20 }}>
          {paused
            ? 'Faucet paused by admin'
            : `One claim per address ${formatCooldownLabel(cooldownSec)} · Fuji Testnet`}
          {configReady ? '' : ' · loading config…'}
        </p>

        {/* Checklist bullets */}
        <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
          {[
            { ok: true,  text: 'You do not pay gas. The ClawX deployer wallet pays the mint transaction on Fuji.' },
            { ok: true,  text: 'You do not need AVAX in your wallet to receive TUSDC. Having 0 AVAX is fine.' },
            { ok: false, text: 'MetaMask may ask you to connect only — that is not a paid transaction.' },
          ].map(({ ok, text }, i) => (
            <li key={i} className="faucet-bullet" style={{
              display: 'flex', gap: 10, marginBottom: 10,
              ...css.serif, fontSize: 14, lineHeight: 1.6, color: '#3A3530',
            }}>
              <span style={{ color: ok ? '#27AE60' : '#888', fontWeight: 700, flexShrink: 0 }}>
                {ok ? '✓' : '•'}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        {/* Token address */}
        <p style={{ ...css.mono, fontSize: 10, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          Token:{' '}
          <span style={{ color: '#5A554E', wordBreak: 'break-all' }}>{TUSDC_ADDRESS}</span>
        </p>

        {/* Connected wallet badge */}
        {account && (
          <div style={{
            ...css.mono, fontSize: 10,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid #27AE60', padding: '4px 12px',
            color: '#27AE60', marginBottom: 20,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#27AE60',
              animation: 'spin 0s linear', boxShadow: '0 0 0 2px rgba(39,174,96,0.25)',
            }} />
            {account.slice(0, 6)}…{account.slice(-4)}
          </div>
        )}

        {/* ── CTA buttons ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Primary */}
          <button
            ref={claimBtnRef}
            type="button"
            disabled={loading || paused}
            onClick={getTusdc}
            onMouseEnter={e => handleBtnHover(e.currentTarget, true)}
            onMouseLeave={e => handleBtnHover(e.currentTarget, false)}
            style={{
              ...css.mono,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: loading || paused ? '#e08a28' : '#F69D39',
              color: '#0D0B08',
              border: 'none',
              padding: '16px 28px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: loading || paused ? 'not-allowed' : 'pointer',
              width: '100%', textAlign: 'center',
              opacity: loading || paused ? 0.8 : 1,
              transformOrigin: 'center',
            }}
          >
            {loading && <PulseDot />}
            {paused
              ? 'Faucet paused'
              : loading
                ? 'Working…'
                : account
                  ? `Get ${amountTusdc} TUSDC (Free)`
                  : `Connect & Get ${amountTusdc} TUSDC`}
          </button>

          {/* Secondary */}
          <button
            type="button"
            disabled={loading}
            onClick={handleAddToken}
            onMouseEnter={e => handleBtnHover(e.currentTarget, true)}
            onMouseLeave={e => handleBtnHover(e.currentTarget, false)}
            style={{
              ...css.mono,
              background: 'transparent', color: '#0D0B08',
              border: '1px solid #0D0B08',
              padding: '14px 28px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%', textAlign: 'center',
              transformOrigin: 'center',
            }}
          >
            Show TUSDC in MetaMask
          </button>
        </div>

        {/* ── Status message ── */}
        {message && (
          <div ref={msgRef} style={{
            marginTop: 20,
            border: `1px solid ${message.type === 'ok' ? '#27AE60' : '#C0392B'}`,
            padding: '14px 16px',
            ...css.mono, fontSize: 12,
            color: message.type === 'ok' ? '#27AE60' : '#C0392B',
            background: message.type === 'ok' ? 'rgba(39,174,96,0.06)' : 'rgba(192,57,43,0.06)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0, fontWeight: 900 }}>
              {message.type === 'ok' ? '✓' : '✕'}
            </span>
            <span style={{ lineHeight: 1.6 }}>{message.text}</span>
          </div>
        )}
      </section>

      {/* ── Setup guide ─────────────────────────── */}
      <section ref={guideRef} style={{
        border: '1px solid #0D0B08', padding: '20px 16px',
      }}>
        <p style={{ ...css.label, marginBottom: 6 }}>SETUP GUIDE</p>
        <h2 style={{ ...css.serif, fontSize: 20, fontWeight: 900, color: '#0D0B08', marginBottom: 24 }}>
          Get TUSDC in your wallet
        </h2>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((step) => (
            <li key={step.n} className="faucet-step" style={{
              display: 'flex', gap: 14, marginBottom: 20, alignItems: 'flex-start',
            }}>
              <StepNumber n={step.n} />

              {step.n === 3 ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ ...css.serif, fontSize: 14, color: '#3A3530', marginBottom: 12 }}>
                    Enter <strong>Avalanche Fuji C-Chain</strong> exactly like this:
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #0D0B08' }}>
                    <tbody>
                      {FUJI_FIELDS.map(({ label, value, copyable }) => (
                        <tr key={label} style={{ borderBottom: '1px solid rgba(13,11,8,0.15)' }}>
                          <td style={{
                            ...css.mono, fontSize: 10, fontWeight: 700,
                            padding: '9px 12px', color: '#888',
                            whiteSpace: 'nowrap', borderRight: '1px solid rgba(13,11,8,0.15)',
                          }}>
                            {label}
                          </td>
                          <td style={{ ...css.mono, fontSize: 11, padding: '9px 12px', color: '#0D0B08', wordBreak: 'break-all' }}>
                            {value}
                            {copyable && <CopyButton text={value} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <span style={{ ...css.serif, fontSize: 14, lineHeight: 1.65, color: '#3A3530' }}>
                  {step.n === 5
                    ? `Stay on this Faucet page, connect your wallet, then press Get ${amountTusdc} TUSDC.`
                    : step.text}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}