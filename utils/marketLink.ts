/** Build the trade page path for a market the agent bet on. */
export function marketTradePath(opts: {
  assetId?: number | null;
  symbol?: string | null;
  roundId?: number | string | null;
}): string | null {
  let asset: number | null =
    opts.assetId != null && Number.isFinite(Number(opts.assetId)) ? Number(opts.assetId) : null;

  if (asset == null && opts.symbol) {
    const key = String(opts.symbol)
      .trim()
      .toUpperCase()
      .replace(/\/USD$/, '');
    // Fuji catalog order used across ClawX (BTC, ETH, AVAX)
    const FALLBACK: Record<string, number> = { BTC: 0, ETH: 1, AVAX: 2 };
    asset = FALLBACK[key] ?? null;
  }

  if (asset == null) return null;

  const params = new URLSearchParams({ asset: String(asset) });
  if (opts.roundId != null && String(opts.roundId) !== '') {
    params.set('round', String(opts.roundId));
  }
  return `/markets/trade?${params.toString()}`;
}
