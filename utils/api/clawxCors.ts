import type { NextApiRequest, NextApiResponse } from 'next';

const DEFAULT_ALLOWED = [
  'https://clawxlab.xyz',
  'https://www.clawxlab.xyz',
  'https://app.clawxlab.xyz',
  'https://admin.clawxlab.xyz',
];

function allowedOrigins(): string[] {
  const fromEnv = String(process.env.WALLET_API_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_ALLOWED;
  if (process.env.NODE_ENV !== 'production') {
    return [...list, 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
  }
  return list;
}

export function setClawxCors(
  req: NextApiRequest,
  res: NextApiResponse,
  methods = 'GET, POST, OPTIONS'
) {
  const origin = String(req.headers.origin || '');
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Non-browser / same-origin callers
    res.setHeader('Access-Control-Allow-Origin', allowed[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** Simple in-memory rate limit (per server instance). */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  { limit = 30, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function clientIp(req: NextApiRequest): string {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.socket?.remoteAddress || 'unknown');
}
