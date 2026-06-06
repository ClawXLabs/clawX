/** Public icon URLs for market cards / rail (no Next/Image remote config required). */
export const ASSET_ICON_URL: Record<string, string> = {
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/coin-round-red.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  NEAR: 'https://assets.coingecko.com/coins/images/10365/large/near.png',
};

interface AssetIconImgProps {
  symbol: string;
  className?: string;
  size?: number | string;
}

export function AssetIconImg({ symbol, className = '', size = 40 }: AssetIconImgProps) {
  const url = ASSET_ICON_URL[symbol] || ASSET_ICON_URL.AVAX;
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <img
      src={url}
      alt=""
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={`rounded-full object-cover ring-1 ring-white/10 ${className}`}
      style={{ width: s, height: s }}
      loading="lazy"
      decoding="async"
    />
  );
}
