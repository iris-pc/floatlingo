const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', '--simulate-audio', `--user-data-dir=${ensureProfile('e2e')}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(7500);
  await page.click('#btnStop');
  await page.waitForTimeout(700);
  const layout = await page.evaluate(() => {
    const footer = document.querySelector('.footer').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.footer-right > *')].map(n => ({ id: n.id, text: n.textContent, left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right, hidden: n.classList.contains('hidden') }));
    return { footer: footer.toJSON(), nodes, scrollWidth: document.querySelector('.footer').scrollWidth, clientWidth: document.querySelector('.footer').clientWidth };
  });
  console.log(JSON.stringify(layout, null, 2));
  await page.screenshot({ path: '/tmp/floatlingo-stopped.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
