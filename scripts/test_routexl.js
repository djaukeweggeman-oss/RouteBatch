// Quick test script to call RouteXL /tour and print the response
// Usage: NEXT_PUBLIC_ROUTEXL_USERNAME=... NEXT_PUBLIC_ROUTEXL_PASSWORD=... node scripts/test_routexl.js

async function run() {
  const username = process.env.NEXT_PUBLIC_ROUTEXL_USERNAME;
  const password = process.env.NEXT_PUBLIC_ROUTEXL_PASSWORD;
  if (!username || !password) {
    console.error('Missing credentials in env');
    process.exit(1);
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const locations = [
    { name: 'Start', lat: 51.9866, lng: 5.9525 },
    { name: 'Stop A', lat: 51.9730, lng: 5.9120 },
    { name: 'Stop B', lat: 51.8860, lng: 5.8880 }
  ];

  try {
    const res = await fetch('https://api.routexl.com/tour', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `locations=${encodeURIComponent(JSON.stringify(locations))}`
    });

    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      console.log('JSON response:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('Raw response:', text);
    }
  } catch (e) {
    console.error('Request error:', e);
    process.exit(1);
  }
}

run();
