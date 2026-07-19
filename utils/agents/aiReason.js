import { getAgentById } from './config.js';
import { createAgentMemory, learnFromOutcome, decideWithRules } from './brain.js';
import { planTradeThought, outcomeJournalText } from './chatter.js';

const LLM_COOLDOWN_SEC = Number(process.env.AGENT_LLM_COOLDOWN_SEC || 20);

function driftPct(round) {
  const start = Number(round.startPrice || 0);
  const price = Number(round.currentPrice || 0);
  if (!start) return 0;
  return ((price - start) / start) * 100;
}

function poolSkew(round) {
  const up = Number(round.upPool || 0);
  const down = Number(round.downPool || 0);
  const total = up + down || 1;
  return { upPct: up / total };
}

function memorySummary(memory) {
  const stats = memory?.symbolStats || {};
  const lines = Object.entries(stats).map(([sym, s]) => {
    const wr = s.wins + s.losses > 0 ? `${s.wins}W/${s.losses}L` : 'new';
    return `${sym}:${wr}${s.lastResult ? ` last=${s.lastResult}` : ''}`;
  });
  return lines.length ? lines.join(', ') : 'no settled history yet';
}

function buildMarketSnapshot(assets, openPositions) {
  const open = new Set((openPositions || []).map((p) => p.symbol));
  const now = Math.floor(Date.now() / 1000);
  return assets
    .filter((a) => !open.has(a.symbol))
    .map((a) => {
      const drift = driftPct(a.round);
      const skew = poolSkew(a.round);
      const secs = Number(a.round.endTime || 0) - now;
      return {
        symbol: a.symbol,
        roundId: a.roundId,
        driftPct: Math.round(drift * 100) / 100,
        crowdUpPct: Math.round(skew.upPct * 100),
        secondsLeft: secs,
      };
    });
}

async function callLLM(agent, enrollment, assets, openPositions, memory, llmOptions = {}) {
  const key = llmOptions.apiKey || process.env.AGENT_LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;

  const lastLlm = memory.lastLlmAt || 0;
  const cooldownSec = Number(llmOptions.cooldownSec || LLM_COOLDOWN_SEC);
  if (Date.now() / 1000 - lastLlm < cooldownSec) return null;

  const markets = buildMarketSnapshot(assets, openPositions);
  if (!markets.length) return null;

  const model = llmOptions.model || process.env.AGENT_LLM_MODEL || 'gpt-4o-mini';
  const base = (llmOptions.baseUrl || process.env.AGENT_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  const system = `You are ${agent.name}, an autonomous prediction-market agent on Avalanche Fuji.
Persona: ${agent.tagline}. Style: ${agent.style}.
You trade small TUSDC clips across ALL listed markets (not only BTC). You learn from past wins/losses per symbol.
Respond ONLY with valid JSON:
{"action":"trade"|"wait","symbol":"BTC","side":"UP"|"DOWN","thought":"2-3 sentences in first person","confidence":0.0-1.0}
If waiting, set action to wait and symbol/side can be empty strings.`;

  const user = JSON.stringify({
    tradeSizeTusdc: enrollment.tradeSizeTusdc,
    maxOpenMarkets: agent.maxOpenMarkets,
    memory: memorySummary(memory),
    recentThoughts: (memory.recentThoughts || []).slice(0, 3).map((t) => t.text),
    journal: (memory.journal || []).slice(0, 4),
    openPositions: (openPositions || []).map((p) => `${p.symbol} ${p.side}`),
    markets,
  });

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memory.lastLlmAt = Math.floor(Date.now() / 1000);
    memory.aiMode = 'llm';
    return parsed;
  } catch {
    return null;
  }
}

function llmToDecision(parsed, assets, agent, memory) {
  if (!parsed || parsed.action === 'wait') {
    const thought =
      parsed?.thought ||
      `${agent.name}: I'm passing this cycle — nothing meets my risk/reward after reviewing every market.`;
    memory.recentThoughts = [{ at: Math.floor(Date.now() / 1000), text: thought }, ...(memory.recentThoughts || [])].slice(
      0,
      12
    );
    return { memory, decision: null };
  }

  const symbol = String(parsed.symbol || '').trim().toUpperCase();
  const asset = assets.find((a) => a.symbol.toUpperCase() === symbol);
  if (!asset) return null;

  const side = String(parsed.side || '').toUpperCase();
  const isUp = side === 'UP';
  const thought =
    parsed.thought ||
    `${agent.name}: Taking ${isUp ? 'UP' : 'DOWN'} on ${symbol} with ${Math.round((parsed.confidence || 0.6) * 100)}% confidence.`;

  memory.recentThoughts = [{ at: Math.floor(Date.now() / 1000), text: thought }, ...(memory.recentThoughts || [])].slice(
    0,
    12
  );

  return {
    memory,
    decision: {
      roundId: asset.roundId,
      symbol: asset.symbol,
      isUp,
      thought,
      confidence: parsed.confidence,
      source: 'llm',
    },
  };
}

function simulatedAIThink(agent, enrollment, assets, openPositions, memory) {
  const ruleResult = decideWithRules({ ...enrollment, agentMemory: memory }, assets, openPositions);
  if (!ruleResult) return null;

  let { memory: mem, decision } = ruleResult;
  mem = mem || memory;
  mem.aiMode = 'simulated-ai';

  const recap = memorySummary(mem);

  if (!decision) {
    const waitLines = [
      `${agent.name}: I've scanned every live market. ${recap ? `Track record: ${recap}.` : ''} I'm staying flat — forcing trades here would be noise, not edge.`,
      `${agent.name}: Still processing drift and pool skew across all symbols. ${recap ? `After ${recap}, ` : ''}I don't see a clip that fits how I trade right now.`,
    ];
    const text = waitLines[Math.floor(Math.random() * waitLines.length)];
    mem.recentThoughts = [{ at: Math.floor(Date.now() / 1000), text }, ...(mem.recentThoughts || [])].slice(0, 12);
    return { memory: mem, decision: null };
  }

  const side = decision.isUp ? 'UP' : 'DOWN';
  const thought = planTradeThought(agent, enrollment, decision, mem);
  decision.thought = thought;
  decision.source = 'simulated-ai';
  decision.side = side;

  const journal = mem.journal || [];
  journal.unshift({ at: Math.floor(Date.now() / 1000), type: 'plan', text: thought.slice(0, 220) });
  mem.journal = journal.slice(0, 20);
  mem.recentThoughts = [{ at: Math.floor(Date.now() / 1000), text: thought }, ...(mem.recentThoughts || [])].slice(0, 12);

  return { memory: mem, decision };
}

/** Main entry — real LLM when API key set, else rich simulated AI voice */
export async function decideWithAI(enrollment, assets, openPositions, llmOptions = {}) {
  const agent = getAgentById(enrollment.agentId);
  if (!agent || !assets?.length) {
    return { memory: enrollment.agentMemory || createAgentMemory(enrollment.agentId), decision: null };
  }

  const memory = enrollment.agentMemory || createAgentMemory(agent.id);

  let llmParsed = await callLLM(agent, enrollment, assets, openPositions, memory, llmOptions);
  if (!llmParsed && llmOptions.apiKey) {
    llmParsed = await callLLM(agent, enrollment, assets, openPositions, memory);
  }
  if (llmParsed) {
    const fromLlm = llmToDecision(llmParsed, assets, agent, memory);
    if (fromLlm) return fromLlm;
  }

  return simulatedAIThink(agent, enrollment, assets, openPositions, memory);
}

export function journalOutcome(memory, agent, symbol, isUp, upWins) {
  const won = (isUp && upWins) || (!isUp && !upWins);
  const entry = {
    at: Math.floor(Date.now() / 1000),
    type: 'lesson',
    text: outcomeJournalText(agent, symbol, isUp, won),
  };
  let updated = learnFromOutcome(memory, symbol, isUp, upWins);
  updated.journal = [entry, ...(updated.journal || [])].slice(0, 20);
  updated.recentThoughts = [entry, ...(updated.recentThoughts || [])].slice(0, 12);
  return updated;
}
