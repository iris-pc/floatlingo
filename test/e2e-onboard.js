const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${ensureProfile('empty')}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(1600);
  const data = await page.evaluate(() => ({
    panelOpen: document.querySelector('#settingsPanel').classList.contains('open'),
    keyState: document.querySelector('#openaiKeyState').textContent,
    saveStatus: document.querySelector('#saveStatus').textContent
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-onboard.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
