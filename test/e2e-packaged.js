const path = require('node:path');
const fs = require('node:fs');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = ensureProfile('package');
  const app = await electron.launch({
    executablePath: path.join(root, 'release', 'mac-arm64', 'FloatLingo.app', 'Contents', 'MacOS', 'FloatLingo'),
    args: ['--simulate-audio', `--user-data-dir=${profile}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(12000);
  const data = await page.evaluate(() => ({
    count: document.querySelectorAll('.caption-card').length,
    status: document.querySelector('#statusText').textContent,
    original: document.querySelector('#recognitionBadge').textContent,
    translation: document.querySelector('#latencyBadge').textContent,
    lastOriginal: [...document.querySelectorAll('.original')].at(-1)?.textContent,
    lastTranslation: [...document.querySelectorAll('.translation')].at(-1)?.textContent
  }));
  console.log(JSON.stringify({ data, errors }, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-packaged-final.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
