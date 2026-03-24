const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    console.log(text);
  });

  page.on('pageerror', err => {
    const text = `[pageerror] ${err.message}`;
    logs.push(text);
    console.error(text);
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Upload the test file
    const filePath = 'scripts/test_upload.xlsx';
    await page.setInputFiles('input[type=file]', filePath);

    // Wait for step 2 (driver select) to appear
    await page.waitForSelector('select', { timeout: 10000 });

    // Select the first non-empty option (skip disabled placeholder)
    const options = await page.$$eval('select option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
    console.log('Found options:', options);
    const first = options.find(o => o.value && o.value !== '');
    if (!first) throw new Error('No driver option found');

    await page.selectOption('select', first.value);

    // Click the calculate button (by text contains 'Start Routeberekening')
    await page.click('button:has-text("Start Routeberekening")');

    // Wait for step 3 to appear (check for text 'Afstand')
    await page.waitForSelector('text=Afstand', { timeout: 20000 });

    // Grab the distance and time shown
    const distanceText = await page.$eval('div:has-text("Afstand") + div p:nth-child(2)', el => el.textContent.trim()).catch(() => null);
    const timeText = await page.$eval('div:has-text("Tijd") + div p:nth-child(2)', el => el.textContent.trim()).catch(() => null);

    console.log('Distance text:', distanceText);
    console.log('Time text:', timeText);

    fs.writeFileSync('scripts/e2e-logs.txt', logs.join('\n'));
    console.log('Wrote scripts/e2e-logs.txt');

  } catch (e) {
    console.error('E2E Error', e);
    fs.writeFileSync('scripts/e2e-logs.txt', logs.join('\n') + '\nERROR: ' + e.stack);
  } finally {
    await browser.close();
  }
})();
