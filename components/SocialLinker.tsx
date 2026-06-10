/**
 * SocialLinker
 * Handles Twitter/X follow verification and Telegram group membership check.
 *
 * Twitter:  user types handle → server checks via Twitter API (or self-attests)
 * Telegram: Telegram Login Widget authenticates the user → server checks group membership
 *
 * Required in .env (all optional — graceful degradation if missing):
 *   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME   e.g. ClawXBot
 *   TWITTER_BEARER_TOKEN
 *   TWITTER_CLAWX_HANDLE
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_GROUP_CHAT_ID
 *   TELEGRAM_GROUP_INVITE_LINK
 */

import { useEffect, useRef, useState } from 'react';

/* ─── Types ──────────────────────────────────────────────────────── */

interface TwitterLink {
  handle?: string;
  verified?: boolean;
  selfAttested?: boolean;
  pendingVerify?: boolean;
  linkedAt?: number;
}

interface TelegramLink {
  username?: string;
  firstName?: string;
  inGroup?: boolean;
  authVerified?: boolean;
  selfAttested?: boolean;
  linkedAt?: number;
}

export interface SocialLinks {
  twitter?: TwitterLink;
  telegram?: TelegramLink;
}

interface SocialLinkerProps {
  wallet: string;
  initialLinks?: SocialLinks;
  onSaved?: (links: SocialLinks) => void;
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const S = {
  mono: { fontFamily: '"Courier New", Courier, monospace' } as React.CSSProperties,
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' } as React.CSSProperties,
  label: {
    fontFamily: '"Courier New", monospace', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#888',
  } as React.CSSProperties,
};

function statusBadge(ok: boolean | undefined, text: string, pending?: boolean) {
  const color = ok ? '#27AE60' : pending ? '#F69D39' : '#C0392B';
  const icon = ok ? '✓' : pending ? '◌' : '✗';
  return (
    <span style={{
      ...S.mono, fontSize: 10, fontWeight: 700,
      color, display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {icon} {text}
    </span>
  );
}

/* ─── Twitter section ────────────────────────────────────────────── */

function TwitterLinker({ wallet, existing, onDone }: {
  wallet: string;
  existing?: TwitterLink;
  onDone: (link: TwitterLink) => void;
}) {
  const CLAWX_TWITTER = process.env.NEXT_PUBLIC_CLAWX_TWITTER_HANDLE || 'clawxlabs';
  const [handle, setHandle] = useState(existing?.handle || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [followUrl, setFollowUrl] = useState('');
  const [verified, setVerified] = useState(existing?.verified || false);
  const [pending, setPending] = useState(existing?.pendingVerify || false);

  const verify = async () => {
    const h = handle.replace(/^@/, '').trim();
    if (!h) return;
    setBusy(true); setMsg(''); setFollowUrl('');
    try {
      const res = await fetch('/api/social/verify-twitter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, twitterHandle: h }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || 'Verification failed'); return; }
      setVerified(data.following);
      setPending(!data.following);
      setMsg(data.message || '');
      if (data.followUrl) setFollowUrl(data.followUrl);
      onDone({ handle: h, verified: data.following, selfAttested: data.selfAttested, pendingVerify: !data.following });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err.message || 'Network error');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {/* X / Twitter logo */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0D0B08' }}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Twitter / X</p>
        {existing?.verified && statusBadge(true, 'Verified')}
        {existing?.pendingVerify && !existing?.verified && statusBadge(false, 'Pending', true)}
      </div>

      <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', marginBottom: 12 }}>
        Enter your Twitter/X handle. We'll check if you follow{' '}
        <a href={`https://x.com/${CLAWX_TWITTER}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1A6EA8', textDecoration: 'none' }}>@{CLAWX_TWITTER}</a>{' '}
        on X.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #0D0B08', flex: '1 1 180px' }}>
          <span style={{ ...S.mono, fontSize: 13, color: '#888', padding: '10px 10px 10px 14px' }}>@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            placeholder="yourhandle"
            maxLength={50}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              padding: '10px 14px 10px 0', ...S.mono, fontSize: 13, color: '#0D0B08',
              outline: 'none',
            }}
          />
        </div>
        <button type="button" onClick={verify} disabled={busy || !handle.trim()} style={{
          background: '#0D0B08', color: '#FAF8F3', border: 'none',
          padding: '10px 20px', ...S.mono, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
          opacity: busy || !handle.trim() ? 0.5 : 1,
        }}>
          {busy ? 'Checking…' : verified ? 'Re-verify' : 'Verify Follow'}
        </button>
      </div>

      {msg && (
        <p style={{ ...S.mono, fontSize: 11, color: verified ? '#27AE60' : '#F69D39', marginTop: 10 }}>{msg}</p>
      )}

      {followUrl && !verified && (
        <a
          href={followUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', marginTop: 10, ...S.mono, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: '1px solid #1A6EA8', color: '#1A6EA8', padding: '8px 16px',
            textDecoration: 'none',
          }}
        >
          Follow @{CLAWX_TWITTER} →
        </a>
      )}
    </div>
  );
}

/* ─── Telegram section ───────────────────────────────────────────── */

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

function TelegramLinker({ wallet, existing, onDone }: {
  wallet: string;
  existing?: TelegramLink;
  onDone: (link: TelegramLink) => void;
}) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const inviteLink = process.env.NEXT_PUBLIC_TELEGRAM_INVITE_LINK || 'https://t.me/+qyCCGAanSrYxYmI1';
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [inGroup, setInGroup] = useState(existing?.inGroup || false);
  const [username, setUsername] = useState(existing?.username || '');
  const [authVerified, setAuthVerified] = useState(existing?.authVerified || false);

  // Inject Telegram Login Widget
  useEffect(() => {
    if (!botUsername || !containerRef.current) return;
    const container = containerRef.current;

    window.onTelegramAuth = async (tgUser) => {
      setBusy(true); setMsg('');
      try {
        const res = await fetch('/api/social/verify-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet, telegramUser: tgUser }),
        });
        const data = await res.json();
        if (!res.ok) { setMsg(data.error || 'Verification failed'); return; }
        setInGroup(data.inGroup || false);
        setAuthVerified(data.authVerified || data.selfAttested || false);
        setUsername(data.username || String(tgUser.username || tgUser.id || ''));
        setMsg(data.message || '');
        onDone({
          username: data.username || null,
          inGroup: data.inGroup,
          authVerified: data.authVerified || data.selfAttested,
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        setMsg(err.message || 'Network error');
      } finally { setBusy(false); }
    };

    // Inject widget script
    const existing_script = container.querySelector('script');
    if (existing_script) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [botUsername, wallet, onDone]);

  return (
    <div style={{ border: '1px solid rgba(13,11,8,0.15)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {/* Telegram logo */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.667l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.978.892z" fill="#229ED9" />
        </svg>
        <p style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0 }}>Telegram</p>
        {inGroup && statusBadge(true, 'In Group')}
        {authVerified && !inGroup && statusBadge(false, 'Connected · Not in group', true)}
        {!authVerified && existing?.selfAttested && statusBadge(false, 'Self-attested', true)}
      </div>

      <p style={{ ...S.mono, fontSize: 10, color: '#5A554E', marginBottom: 14 }}>
        Log in with Telegram — we'll verify you're in{' '}
        <a href="https://t.me/+qyCCGAanSrYxYmI1" target="_blank" rel="noopener noreferrer" style={{ color: '#229ED9', textDecoration: 'none' }}>ClawXLabs🔺</a>
        {' '}(113 members on Avalanche).
      </p>

      {authVerified && username ? (
        <p style={{ ...S.mono, fontSize: 12, color: '#0D0B08', marginBottom: 12 }}>
          Connected as <strong>@{username}</strong>
          {inGroup ? ' · ✓ Member of ClawX group' : ''}
        </p>
      ) : null}

      {!authVerified && (
        <div ref={containerRef} style={{ marginBottom: 12 }}>
          {!botUsername && (
            <p style={{ ...S.mono, fontSize: 11, color: '#F69D39' }}>
              Telegram bot not configured. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in .env.
            </p>
          )}
        </div>
      )}

      {authVerified && !inGroup && (
        <a
          href={inviteLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', ...S.mono, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: '1px solid #229ED9', color: '#229ED9', padding: '8px 16px',
            textDecoration: 'none', marginBottom: 12,
          }}
        >
          Join ClawXLabs🔺 →
        </a>
      )}

      {authVerified && (
        <button
          type="button"
          onClick={() => {
            setAuthVerified(false);
            setInGroup(false);
            setUsername('');
            setMsg('Log in again to re-verify.');
          }}
          style={{
            background: 'transparent', border: '1px solid rgba(13,11,8,0.2)',
            padding: '6px 14px', ...S.mono, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            color: '#888', marginLeft: authVerified && !inGroup ? 10 : 0,
          }}
        >
          Re-connect
        </button>
      )}

      {busy && <p style={{ ...S.mono, fontSize: 11, color: '#888', marginTop: 8 }}>Verifying…</p>}
      {msg && !busy && <p style={{ ...S.mono, fontSize: 11, color: inGroup ? '#27AE60' : '#F69D39', marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

export default function SocialLinker({ wallet, initialLinks = {}, onSaved }: SocialLinkerProps) {
  const [links, setLinks] = useState<SocialLinks>(initialLinks);

  const updateLink = (platform: keyof SocialLinks) => (data: TwitterLink | TelegramLink) => {
    const next: SocialLinks = { ...links, [platform]: data };
    setLinks(next);
    onSaved?.(next);
  };

  return (
    <div>
      <p style={{ ...S.label, color: '#C0392B', marginBottom: 10 }}>Social Accounts</p>
      <p style={{ ...S.mono, fontSize: 11, color: '#5A554E', marginBottom: 16 }}>
        Verify you follow ClawX on Twitter/X and are in our Telegram community. Linked accounts appear on the leaderboard.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TwitterLinker wallet={wallet} existing={links.twitter} onDone={updateLink('twitter')} />
        <TelegramLinker wallet={wallet} existing={links.telegram} onDone={updateLink('telegram')} />
      </div>
    </div>
  );
}
