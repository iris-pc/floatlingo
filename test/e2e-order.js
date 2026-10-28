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
  await page.waitForTimeout(9500);
  const result = await page.evaluate(() => {
    const list = document.querySelector('#captionList');
    return {
      children: [...list.children].map((n) => ({ id: n.dataset.id, text: n.querySelector('.original')?.textContent, top: n.getBoundingClientRect().top, h: n.getBoundingClientRect().height })),
      orderStyle: getComputedStyle(list).flexDirection,
      listRect: list.getBoundingClientRect().toJSON(),
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
