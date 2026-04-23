const start = Date.now();
try {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  const auth = btoa('test:test');
  await fetch('https://api.routexl.com/tour', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'locations=[]',
    signal: controller.signal
  });
  console.log('Fetch ok in', Date.now() - start);
  clearTimeout(timeoutId);
} catch (e) {
  console.log('Fetch failed in', Date.now() - start, e.message);
}
