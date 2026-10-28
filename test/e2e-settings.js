const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${ensureProfile('e2e')}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(1200);
  await page.click('#btnSettings');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/floatlingo-settings.png' });
  const data = await page.evaluate(() => ({
    open: document.querySelector('#settingsPanel').classList.contains('open'),
    keyState: document.querySelector('#openaiKeyState').textContent,
    provider: [...document.querySelectorAll('[data-provider]')].map(b => [b.dataset.provider, b.classList.contains('active')]),
    bodyScroll: document.querySelector('#settingsBody').scrollHeight,
    bodyHeight: document.querySelector('#settingsBody').clientHeight,
    errors: []
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
