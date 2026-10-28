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
  await page.waitForTimeout(8500);
  await page.click('#btnStop');
  await page.waitForTimeout(700);
  await page.click('#btnMinutes');
  await page.waitForTimeout(2500);
  const data = await page.evaluate(() => ({
    open: document.querySelector('#minutesPanel').classList.contains('open'),
    content: document.querySelector('#minutesContent').innerText.slice(0, 300),
    transcript: document.querySelector('#minutesTranscript').textContent.slice(0, 120),
    meta: document.querySelector('#minutesMeta').textContent,
    appendices: document.querySelector('#minutesContent').innerText.includes('附录：完整逐字记录'),
    copyEnabled: !document.querySelector('#minutesCopy').disabled
  }));
  await page.screenshot({ path: '/tmp/floatlingo-packaged-minutes.png' });
  console.log(JSON.stringify({ data, errors }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
