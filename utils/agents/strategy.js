export {
  decideNextTrade,
  decideWithRules,
  createAgentMemory,
  learnFromOutcome,
  recordTradePlanned,
} from './brain.js';

export { decideWithAI, journalOutcome } from './aiReason.js';

export function agentChatterText(agent, peer, symbol, isUp, thought) {
  if (thought) return thought;
  return `${agent.name}: Still watching the board.`;
}
