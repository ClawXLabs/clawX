const fetch = require('node-fetch'); // or use global fetch in newer Node versions
require('dotenv').config();

async function main() {
  const url = 'http://localhost:3000/api/agents/execute';
  const body = {
    wallet: '0x6734738d6ab16dff858ffca33d31918370d482e0',
    roundId: 2117,
    isUp: true,
    symbol: 'BNB',
    thought: 'Test trade simulation'
  };

  console.log('Sending request to', url);
  console.log('Secret:', process.env.AGENT_RUNNER_SECRET || 'dev-agent-runner');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-runner-secret': process.env.AGENT_RUNNER_SECRET || 'dev-agent-runner',
      },
      body: JSON.stringify(body),
    });

    console.log('Response Status:', res.status);
    const text = await res.text();
    console.log('Response Body:', text);
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

main().catch(console.error);
