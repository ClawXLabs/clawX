async function checkErrors() {
  const urls = [
    'https://app.clawxlab.xyz/api/candles?symbol=AVAX&interval=1m&limit=5',
    'https://app.clawxlab.xyz/api/v1/wallets?wallet=0x250D8CfD2cd97CED0e1889D37B8Ea30cd725ae2b',
  ];
  for (const url of urls) {
    console.log('\n=== Fetching:', url);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      console.log('Status:', res.status, res.statusText);
      const text = await res.text();
      console.log('Body:', text.slice(0, 500));
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}
checkErrors();
