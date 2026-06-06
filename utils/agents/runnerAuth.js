/** Local dev default — must match scripts/agent-runner.js */
export const DEFAULT_AGENT_RUNNER_SECRET = 'dev-agent-runner';

export function getAgentRunnerSecret() {
  return process.env.AGENT_RUNNER_SECRET || DEFAULT_AGENT_RUNNER_SECRET;
}

export function isRunnerAuthorized(req) {
  const header = req.headers['x-agent-runner-secret'];
  return header === getAgentRunnerSecret();
}
