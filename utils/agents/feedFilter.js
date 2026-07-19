import { AGENTS, resolveAgentId } from './config.js';
import { readEnrollments } from './store.js';

const LEGACY_AGENT_IDS = new Set(['claw-momentum', 'claw-fade', 'claw-sniper', 'claw-balanced']);
const CURRENT_IDS = new Set(AGENTS.map((a) => a.id));
const REAL_KINDS = new Set(['trade', 'win', 'loss', 'enroll']);

async function activePilotAgents() {
  const enrollments = await readEnrollments();
  const map = new Map();
  for (const row of Object.values(enrollments)) {
    if (row.status !== 'active' || !row.wallet || !row.agentId) continue;
    map.set(row.wallet.toLowerCase(), resolveAgentId(row.agentId));
  }
  return map;
}

/** Normalize feed — only real pilot/agent activity (no ghost peer/seed bots). */
export async function filterFeedMessages(messages) {
  const pilots = await activePilotAgents();

  return (messages || [])
    .filter((m) => {
      const id = resolveAgentId(m.agentId);
      if (!CURRENT_IDS.has(id) || LEGACY_AGENT_IDS.has(String(m.agentId || ''))) return false;
      if (m.kind === 'peer' || m.kind === 'seed') return false;
      if (!REAL_KINDS.has(m.kind)) return false;

      const pilot = String(m.pilotWallet || '').toLowerCase();
      if (!pilot) return false;
      const enrolledAgent = pilots.get(pilot);
      return enrolledAgent === id;
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
