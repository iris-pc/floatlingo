const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', '--simulate-audio', `--user-data-dir=${ensureProfile('http', { sttMode: 'http' })}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(9000);
  const data = await page.evaluate(() => ({
    status: document.querySelector('#statusPill')?.textContent?.trim(),
    count: document.querySelectorAll('.caption-card').length,
    originals: [...document.querySelectorAll('.original')].map(n => n.textContent.trim()),
    translations: [...document.querySelectorAll('.translation')].map(n => n.textContent.trim()),
    toast: [...document.querySelectorAll('.toast')].map(n => n.textContent.trim())
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-http.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
