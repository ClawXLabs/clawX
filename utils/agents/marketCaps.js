/**
 * Per-market exposure helpers for agent enrollments.
 * marketCapsTusdc[symbol] = max open TUSDC on that market (0 = skip).
 */

export function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\/USD$/, '');
}

/** Open exposure for a symbol from pending outcomes + unsettled trade log. */
export function openExposureTusdc(enrollment, symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym || !enrollment) return 0;
  const defaultSize = Number(enrollment.tradeSizeTusdc) || 0;
  let total = 0;

  for (const p of enrollment.pendingOutcomes || []) {
    if (normalizeSymbol(p.symbol) !== sym) continue;
    total += Number(p.amountTusdc) || defaultSize;
  }

  for (const t of enrollment.tradeLog || []) {
    if (String(t.action || '').toUpperCase() !== 'BUY') continue;
    if (normalizeSymbol(t.symbol) !== sym) continue;
    const outcome = String(t.outcome || '').toLowerCase();
    if (outcome === 'win' || outcome === 'loss') continue;
    // Avoid double-count if also in pendingOutcomes
    const rid = Number(t.roundId);
    const already = (enrollment.pendingOutcomes || []).some(
      (p) => Number(p.roundId) === rid && normalizeSymbol(p.symbol) === sym
    );
    if (already) continue;
    total += Number(t.amountTusdc) || defaultSize;
  }

  return Math.round(total * 1000) / 1000;
}

/**
 * Returns { ok, tradeSizeTusdc, error } for a prospective trade on symbol.
 */
export function resolveMarketTradeSize(enrollment, symbol) {
  const defaultSize = Number(enrollment?.tradeSizeTusdc) || 0;
  const sym = normalizeSymbol(symbol);
  const caps = enrollment?.marketCapsTusdc || {};
  const hasCap = Object.prototype.hasOwnProperty.call(caps, sym);
  const cap = hasCap ? Number(caps[sym]) : null;

  if (hasCap && Number.isFinite(cap) && cap <= 0) {
    return { ok: false, tradeSizeTusdc: 0, error: `${sym} is disabled (market cap 0)` };
  }

  if (cap == null || !Number.isFinite(cap)) {
    return { ok: true, tradeSizeTusdc: defaultSize, error: null };
  }

  const open = openExposureTusdc(enrollment, sym);
  const room = Math.max(0, cap - open);
  if (room < 1e-9) {
    return {
      ok: false,
      tradeSizeTusdc: 0,
      error: `${sym} market cap reached (${cap} TUSDC)`,
    };
  }

  const size = Math.min(defaultSize, room);
  if (size <= 0) {
    return { ok: false, tradeSizeTusdc: 0, error: `${sym} market cap too low for a trade` };
  }

  return { ok: true, tradeSizeTusdc: Math.round(size * 100) / 100, error: null };
}
