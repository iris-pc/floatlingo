const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${ensureProfile('sys', { systemEnabled: true })}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(900);
  await page.click('#btnStart');
  await page.waitForTimeout(4500);
  const data = await page.evaluate(() => ({
    status: document.querySelector('#statusText').textContent,
    pill: document.querySelector('#statusPill').className,
    toasts: [...document.querySelectorAll('.toast')].map(n => n.textContent.trim()),
    systemState: document.querySelector('#systemMeterState').textContent,
    micState: document.querySelector('#micMeterState').textContent
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-system-error.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
