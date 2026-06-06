/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  outputFileTracing: false,
  // Ignore TS errors in legacy JS files (HumanMarketTerminalV2, MarketsHub etc.)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.cache = false;
    return config;
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    NEXT_PUBLIC_CHAIN_ID: '43113',
    NEXT_PUBLIC_RPC_URL: 'https://api.avax-test.network/ext/bc/C/rpc',
  },
}

module.exports = nextConfig
