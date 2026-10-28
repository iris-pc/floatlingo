const path = require('node:path');
const fs = require('node:fs');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = ensureProfile('minutes');
  const app = await electron.launch({
    args: ['.', '--simulate-audio', `--user-data-dir=${profile}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(8500);
  await page.click('#btnStop');
  await page.waitForTimeout(700);
  const stop = await page.evaluate(() => ({
    status: document.querySelector('#statusText').textContent,
    minutesVisible: !document.querySelector('#btnMinutes').classList.contains('hidden')
  }));
  await page.click('#btnMinutes');
  await page.waitForTimeout(2600);
  const result = await page.evaluate(() => ({
    open: document.querySelector('#minutesPanel').classList.contains('open'),
    loading: !document.querySelector('#minutesLoading').classList.contains('hidden'),
    empty: !document.querySelector('#minutesEmpty').classList.contains('hidden'),
    contentText: document.querySelector('#minutesContent').innerText.slice(0, 700),
    transcriptText: document.querySelector('#minutesTranscript').innerText.slice(0, 300),
    meta: document.querySelector('#minutesMeta').textContent,
    status: document.querySelector('#minutesStatus').textContent,
    copyDisabled: document.querySelector('#minutesCopy').disabled,
    tabs: [...document.querySelectorAll('[data-minutes-tab]')].map(b => ({ tab: b.dataset.minutesTab, disabled: b.disabled, active: b.classList.contains('active') })),
    errors: []
  }));
  await page.click('[data-minutes-tab="transcript"]');
  await page.waitForTimeout(300);
  const transcriptTab = await page.evaluate(() => ({
    transcriptVisible: !document.querySelector('#minutesTranscript').classList.contains('hidden'),
    contentHidden: document.querySelector('#minutesContent').classList.contains('hidden'),
    transcript: document.querySelector('#minutesTranscript').textContent.slice(0, 200)
  }));
  await page.screenshot({ path: '/tmp/floatlingo-minutes-transcript.png' });
  await page.click('[data-minutes-tab="minutes"]');
  await page.waitForTimeout(300);
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/floatlingo-minutes-export.md' });
  });
  await page.click('#minutesExportMd');
  await page.waitForTimeout(500);
  const exported = fs.existsSync('/tmp/floatlingo-minutes-export.md')
    ? fs.readFileSync('/tmp/floatlingo-minutes-export.md', 'utf8')
    : '';
  await page.click('#minutesCopy');
  const clipboard = await app.evaluate(async ({ clipboard }) => String(await clipboard.readText()).slice(0, 120));
  const copied = await page.evaluate(() => document.querySelector('#statusText').textContent);
  await page.screenshot({ path: '/tmp/floatlingo-minutes.png' });
  console.log(JSON.stringify({ stop, result, transcriptTab, clipboard, copied, exportOk: exported.includes('附录：完整逐字记录') && exported.includes('[S001]'), errors }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
