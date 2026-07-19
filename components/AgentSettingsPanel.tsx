import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { settingsSignatureMessage } from '../utils/agents/settingsSignature';

const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
  },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  custom: { label: 'Custom OpenAI-compatible', baseUrl: '', model: '' },
};

type Provider = keyof typeof PROVIDERS;

export default function AgentSettingsPanel() {
  const { account, provider: walletProvider, connectWallet } = useWallet();
  const [llmProvider, setLlmProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [keyMasked, setKeyMasked] = useState('');
  const [model, setModel] = useState(PROVIDERS.gemini.model);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.gemini.baseUrl);
  const [cooldownSec, setCooldownSec] = useState(180);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    fetch(`/api/settings?wallet=${account}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body.settings;
      })
      .then((settings) => {
        setLlmProvider(settings.provider || 'gemini');
        setModel(settings.model || PROVIDERS.gemini.model);
        setBaseUrl(settings.baseUrl || PROVIDERS.gemini.baseUrl);
        setCooldownSec(settings.cooldownSec || 180);
        setKeyMasked(settings.keyMasked || '');
        setStatus(settings.keyVerified ? '✓ Key verified' : '');
      })
      .catch((error) => setStatus(error.message || 'Could not load settings'));
  }, [account]);

  const selectProvider = (next: Provider) => {
    setLlmProvider(next);
    setModel(PROVIDERS[next].model);
    setBaseUrl(PROVIDERS[next].baseUrl);
    setStatus('');
  };

  const save = async () => {
    if (!account || !walletProvider) return;
    if (!apiKey) {
      setStatus('Enter the API key again to verify and save.');
      return;
    }
    setSaving(true);
    setStatus('Verifying provider key…');
    try {
      const normalizedBase = baseUrl.replace(/\/$/, '');
      const payload = {
        wallet: account,
        provider: llmProvider,
        model,
        baseUrl: normalizedBase,
        apiKey,
        cooldownSec,
      };
      const signer = await walletProvider.getSigner();
      const signature = await signer.signMessage(settingsSignatureMessage(payload));
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, signature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save settings');
      setKeyMasked(body.settings.keyMasked || '');
      setApiKey('');
      setStatus('✓ Key verified and encrypted');
    } catch (error: any) {
      setStatus(error.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1.5px solid #0D0B08',
    background: '#FAF8F3',
    padding: '11px 12px',
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: '"Courier New", monospace',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    marginBottom: 6,
  };

  if (!account) {
    return (
      <button onClick={connectWallet} style={{ ...inputStyle, background: '#0D0B08', color: '#fff', cursor: 'pointer' }}>
        Connect wallet to configure agent AI
      </button>
    );
  }

  return (
    <section style={{ maxWidth: 680, margin: '0 auto', border: '1.5px solid #0D0B08', padding: 24 }}>
      <p style={{ ...labelStyle, color: '#C0392B' }}>◆ Agent Settings</p>
      <h2 style={{ fontFamily: 'Georgia, serif', margin: '0 0 8px', fontSize: 26 }}>Bring your own LLM key</h2>
      <p style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: '#6B6257', lineHeight: 1.6 }}>
        Your key is verified, encrypted with AES-256-GCM, and only decrypted in memory for your agent.
      </p>

      <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
        <label>
          <span style={labelStyle}>Provider</span>
          <select value={llmProvider} onChange={(event) => selectProvider(event.target.value as Provider)} style={inputStyle}>
            {Object.entries(PROVIDERS).map(([id, row]) => <option key={id} value={id}>{row.label}</option>)}
          </select>
        </label>
        <label>
          <span style={labelStyle}>API key {keyMasked ? `(saved: ${keyMasked})` : ''}</span>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste key to verify and save"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={labelStyle}>Model</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} style={inputStyle} />
        </label>
        {llmProvider === 'custom' && (
          <label>
            <span style={labelStyle}>HTTPS base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} style={inputStyle} />
          </label>
        )}
        <label>
          <span style={labelStyle}>LLM cooldown (seconds)</span>
          <input
            type="number"
            min={10}
            max={3600}
            value={cooldownSec}
            onChange={(event) => setCooldownSec(Number(event.target.value))}
            style={inputStyle}
          />
        </label>
      </div>
      <button
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 20,
          border: 0,
          background: '#0D0B08',
          color: '#FAF8F3',
          padding: '12px 22px',
          fontFamily: '"Courier New", monospace',
          fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Verifying…' : 'Verify & Save'}
      </button>
      {status && <p style={{ fontFamily: '"Courier New", monospace', fontSize: 11, marginTop: 12 }}>{status}</p>}
    </section>
  );
}
