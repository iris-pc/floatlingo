const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = ensureProfile('keys');
  const launch = () => electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '' }
  });
  let app = await launch();
  let page = await app.firstWindow();
  await page.waitForTimeout(1200);
  await page.fill('#openaiKey', 'sk-test-openai');
  await page.fill('#deepseekKey', 'sk-test-deepseek');
  await page.click('#settingsSave');
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => ({
    openai: document.querySelector('#openaiKeyState').textContent,
    deepseek: document.querySelector('#deepseekKeyState').textContent,
    badge: document.querySelector('#providerBadge').textContent
  }));
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.waitForTimeout(1200);
  await page.click('#btnSettings');
  await page.waitForTimeout(400);
  const reloaded = await page.evaluate(() => ({
    openai: document.querySelector('#openaiKeyState').textContent,
    deepseek: document.querySelector('#deepseekKeyState').textContent
  }));
  console.log(JSON.stringify({ saved, reloaded }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
