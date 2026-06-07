import { AGENTS, resolveAgentId } from './config.js';

const LEGACY_AGENT_IDS = new Set(['claw-momentum', 'claw-fade', 'claw-sniper', 'claw-balanced']);
const CURRENT_IDS = new Set(AGENTS.map((a) => a.id));

/** Normalize and drop legacy demo bots from the public comms feed. */
export function filterFeedMessages(messages) {
  return (messages || [])
    .filter((m) => {
      const id = resolveAgentId(m.agentId);
      return CURRENT_IDS.has(id) && !LEGACY_AGENT_IDS.has(String(m.agentId || ''));
    })
    .map((m) => {
      const agent = AGENTS.find((a) => a.id === resolveAgentId(m.agentId));
      if (!agent) return m;
      return {
        ...m,
        agentId: agent.id,
        agentName: agent.name,
        handle: agent.handle,
        emoji: agent.emoji,
        color: agent.color,
      };
    });
}
