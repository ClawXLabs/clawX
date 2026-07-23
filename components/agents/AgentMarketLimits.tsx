import { useEffect, useState } from 'react';

const RED = '#C0392B';
const MARKETS = ['BTC', 'ETH', 'AVAX', 'BNB', 'NEAR'] as const;

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

type CapsMap = Record<string, number>;

interface AgentMarketLimitsProps {
  wallet: string;
  marketCapsTusdc?: CapsMap | null;
  defaultTradeSizeTusdc?: number | null;
  onSaved?: () => void;
}

function capsToDraft(caps?: CapsMap | null): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const m of MARKETS) {
    if (caps && Object.prototype.hasOwnProperty.call(caps, m) && caps[m] != null) {
      draft[m] = String(caps[m]);
    } else {
      draft[m] = '';
    }
  }
  return draft;
}

export default function AgentMarketLimits({
  wallet,
  marketCapsTusdc,
  defaultTradeSizeTusdc,
  onSaved,
}: AgentMarketLimitsProps) {
  const [draft, setDraft] = useState(() => capsToDraft(marketCapsTusdc));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(capsToDraft(marketCapsTusdc));
  }, [marketCapsTusdc]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const marketCapsTusdcPayload: Record<string, number | null> = {};
    for (const m of MARKETS) {
      const raw = String(draft[m] ?? '').trim();
      if (raw === '') {
        marketCapsTusdcPayload[m] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setErr(`Invalid limit for ${m}`);
        setSaving(false);
        return;
      }
      marketCapsTusdcPayload[m] = n;
    }
    try {
      const res = await fetch('/api/agents/market-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, marketCapsTusdc: marketCapsTusdcPayload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save limits');
      setMsg('Market limits saved.');
      onSaved?.();
    } catch (e: unknown) {
      const errObj = e as { message?: string };
      setErr(errObj.message || 'Failed to save limits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <h2 style={{ ...S.serif, fontSize: 16, fontWeight: 900, color: '#0D0B08', margin: 0 }}>
            Per-market limits
          </h2>
          <p style={{ ...S.mono, fontSize: 11, color: '#888', margin: '6px 0 0' }}>
            Max open TUSDC per market. Empty = use global trade size
            {defaultTradeSizeTusdc != null ? ` (${defaultTradeSizeTusdc})` : ''}. 0 = skip market.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            background: RED,
            color: '#FAF8F3',
            border: `1px solid ${RED}`,
            padding: '10px 18px',
            ...S.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.65 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save limits'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        {MARKETS.map((m) => (
          <label key={m} style={{ display: 'block' }}>
            <span style={S.label}>{m}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="No cap"
              value={draft[m] ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, [m]: e.target.value }))}
              style={{
                width: '100%',
                marginTop: 6,
                boxSizing: 'border-box',
                border: '1px solid #0D0B08',
                background: '#FAF8F3',
                padding: '10px 12px',
                ...S.mono,
                fontSize: 13,
                color: '#0D0B08',
              }}
            />
          </label>
        ))}
      </div>

      {(msg || err) && (
        <p
          style={{
            ...S.mono,
            fontSize: 12,
            margin: '12px 0 0',
            color: err ? RED : '#27AE60',
          }}
        >
          {err || msg}
        </p>
      )}
    </div>
  );
}
