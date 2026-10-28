const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');

(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', '--simulate-audio', `--user-data-dir=${ensureProfile('e2e')}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      OPENAI_API_KEY: 'test',
      DEEPSEEK_API_KEY: 'test'
    }
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(15000);
  const result = await page.evaluate(() => ({
    status: document.querySelector('#statusPill')?.textContent?.trim(),
    count: document.querySelectorAll('.caption-card').length,
    translations: [...document.querySelectorAll('.translation')].map((node) => node.textContent.trim()),
    originals: [...document.querySelectorAll('.original')].map((node) => node.textContent.trim()),
    latency: document.querySelector('#latencyBadge')?.textContent,
    recognition: document.querySelector('#recognitionBadge')?.textContent,
    cardLatencies: [...document.querySelectorAll('.caption-latency')].map(n => n.textContent),
    visible: !!document.querySelector('.settings-panel.open'),
    bodySize: { w: innerWidth, h: innerHeight }
  }));
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-e2e.png' });
  await app.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
