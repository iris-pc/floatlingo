const path = require('node:path');
const fs = require('node:fs');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = ensureProfile('minutes');
  const app = await electron.launch({ args: ['.', '--simulate-audio', `--user-data-dir=${profile}`], cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE:'', OPENAI_API_KEY:'test', DEEPSEEK_API_KEY:'test' } });
  const page = await app.firstWindow();
  await page.waitForTimeout(8500);
  await page.click('#btnStop'); await page.waitForTimeout(600);
  await page.click('#btnMinutes'); await page.waitForTimeout(2200);
  const data = await page.evaluate(() => {
    const c = document.querySelector('#minutesContent');
    const first = c.firstElementChild;
    const cs = first ? getComputedStyle(first) : null;
    return {
      start: c.innerHTML.slice(0, 300),
      children: [...c.children].slice(0,3).map(n=>({tag:n.tagName,text:n.textContent.slice(0,40),h:n.getBoundingClientRect().height,top:n.getBoundingClientRect().top,marginTop:getComputedStyle(n).marginTop,paddingTop:getComputedStyle(n).paddingTop,borderTop:getComputedStyle(n).borderTopWidth})),
      bodyTop: document.querySelector('.minutes-body').getBoundingClientRect().top,
      contentTop: c.getBoundingClientRect().top,
      contentPad: getComputedStyle(c).paddingTop
    };
  });
  console.log(JSON.stringify(data,null,2));
  await app.close();
})().catch(e=>{console.error(e);process.exit(1);});
