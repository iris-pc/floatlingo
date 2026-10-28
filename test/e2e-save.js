const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = ensureProfile('save');
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(1000);
  await page.click('#btnSettings');
  await page.waitForTimeout(400);
  await page.click('[data-provider="openai"]');
  await page.selectOption('#sttDelay', 'medium');
  await page.click('#settingsSave');
  await page.waitForTimeout(900);
  const ui = await page.evaluate(() => ({
    badge: document.querySelector('#providerBadge').textContent,
    activeProvider: [...document.querySelectorAll('[data-provider]')].find(b => b.classList.contains('active'))?.dataset.provider,
    saveStatus: document.querySelector('#saveStatus').textContent,
    panelOpen: document.querySelector('#settingsPanel').classList.contains('open')
  }));
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
  console.log(JSON.stringify({ ui, savedProvider: saved.translationProvider, savedDelay: saved.sttDelay }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
