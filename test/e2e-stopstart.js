const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', '--simulate-audio', `--user-data-dir=${ensureProfile('e2e')}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(8000);
  const before = await page.evaluate(() => ({ count: document.querySelectorAll('.caption-card').length, status: document.querySelector('#statusText').textContent }));
  await page.click('#btnStop');
  await page.waitForTimeout(700);
  const stopped = await page.evaluate(() => ({
    count: document.querySelectorAll('.caption-card').length,
    status: document.querySelector('#statusText').textContent,
    startVisible: !document.querySelector('#btnStartSmall').classList.contains('hidden'),
    emptyHidden: document.querySelector('#emptyState').classList.contains('hidden')
  }));
  await page.click('#btnStartSmall');
  await page.waitForTimeout(4500);
  const restarted = await page.evaluate(() => ({
    count: document.querySelectorAll('.caption-card').length,
    status: document.querySelector('#statusText').textContent,
    stopVisible: !document.querySelector('#btnStop').classList.contains('hidden')
  }));
  console.log(JSON.stringify({ before, stopped, restarted }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
