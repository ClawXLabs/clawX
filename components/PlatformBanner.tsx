import { useEffect, useState } from 'react';

type PlatformStatus = {
  agentsPaused: boolean;
  tradingPaused: boolean;
  announcement: string;
  maintenanceMessage: string;
};

const DEFAULT_AGENTS_OFF =
  'Agent trading is temporarily shut down. Markets and history remain available.';

const mono: React.CSSProperties = {
  fontFamily: '"Courier New", Courier, monospace',
};

export default function PlatformBanner() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/platform-status', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setStatus({
          agentsPaused: Boolean(body.agentsPaused),
          tradingPaused: Boolean(body.tradingPaused),
          announcement: String(body.announcement || '').trim(),
          maintenanceMessage: String(body.maintenanceMessage || '').trim(),
        });
      } catch {
        /* ignore transient errors */
      }
    }

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!status) return null;

  const messages: string[] = [];
  if (status.maintenanceMessage) messages.push(status.maintenanceMessage);
  if (status.agentsPaused) {
    messages.push(status.announcement || DEFAULT_AGENTS_OFF);
  } else if (status.announcement) {
    messages.push(status.announcement);
  }
  if (status.tradingPaused) {
    messages.push('Manual trading is paused.');
  }

  if (!messages.length) return null;

  const text = [...new Set(messages)].join(' · ');

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        background: '#FAF8F3',
        borderBottom: '2px solid #0D0B08',
        padding: '10px 16px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#C0392B',
          marginBottom: 4,
        }}
      >
        Notice
      </div>
      <div
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 14,
          color: '#0D0B08',
          lineHeight: 1.4,
          maxWidth: 880,
          margin: '0 auto',
        }}
      >
        {text}
      </div>
    </div>
  );
}
