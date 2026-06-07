/** Four autonomous agent personas — each trades all Fuji markets differently. */
export const AGENTS = [
  {
    id: 'ava-strike',
    name: 'AvaStrike',
    handle: '@ava-strike',
    tagline: 'Strikes the strongest mover across every market — learns when a symbol burns her.',
    style: 'Momentum hunter',
    color: '#E84142',
    emoji: '⚡',
    maxOpenMarkets: 3,
    maxTradesPerTick: 3,
    envAddressKey: 'NEXT_PUBLIC_AGENT_AVA_STRIKE_ADDRESS',
  },
  {
    id: 'peak-mind',
    name: 'PeakMind',
    handle: '@peak-mind',
    tagline: 'Watches all five windows, waits for conviction, then sizes one precise clip.',
    style: 'Analyst',
    color: '#3b82f6',
    emoji: '🧠',
    maxOpenMarkets: 5,
    maxTradesPerTick: 4,
    envAddressKey: 'NEXT_PUBLIC_AGENT_PEAK_MIND_ADDRESS',
  },
  {
    id: 'frost-logic',
    name: 'FrostLogic',
    handle: '@frost-logic',
    tagline: 'Fades the crowded side; cools off after a bad read before re-entering.',
    style: 'Contrarian',
    color: '#38bdf8',
    emoji: '❄️',
    maxOpenMarkets: 3,
    maxTradesPerTick: 2,
    envAddressKey: 'NEXT_PUBLIC_AGENT_FROST_LOGIC_ADDRESS',
  },
  {
    id: 'subnet-sage',
    name: 'SubnetSage',
    handle: '@subnet-sage',
    tagline: 'Rotates small clips across BTC, ETH, AVAX and more — never hammers one lane.',
    style: 'Rotator',
    color: '#22c55e',
    emoji: '🌐',
    maxOpenMarkets: 5,
    maxTradesPerTick: 4,
    envAddressKey: 'NEXT_PUBLIC_AGENT_SUBNET_SAGE_ADDRESS',
  },
];

/** Maps old enrollments to new agent ids */
const LEGACY_AGENT_IDS = {
  'claw-momentum': 'ava-strike',
  'claw-fade': 'frost-logic',
  'claw-sniper': 'peak-mind',
  'claw-balanced': 'subnet-sage',
};

export const DEFAULT_TRADE_SIZE_TUSDC = 2;
export const MAX_ACTIVE_AGENTS_PER_USER = 1;

export function resolveAgentId(agentId) {
  return LEGACY_AGENT_IDS[agentId] || agentId;
}

export function getAgentById(agentId) {
  const id = resolveAgentId(agentId);
  return AGENTS.find((a) => a.id === id) || null;
}

export function getTradesPerTick(agent) {
  if (!agent) return 1;
  return Math.max(1, Math.min(4, Number(agent.maxTradesPerTick) || 1));
}

export function getAgentAddress(agent) {
  if (!agent?.envAddressKey) return null;
  const addr = process.env[agent.envAddressKey];
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return addr;
}
