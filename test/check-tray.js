const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    executablePath: path.join(root, 'release', 'mac-arm64', 'FloatLingo.app', 'Contents', 'MacOS', 'FloatLingo'),
    args: [`--user-data-dir=${ensureProfile('package')}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const result = await app.evaluate(({ app, nativeImage }) => {
    const p = app.getAppPath() + '/src/assets/trayTemplate.png';
    const img = nativeImage.createFromPath(p);
    return { appPath: app.getAppPath(), path: p, empty: img.isEmpty(), size: img.getSize() };
  });
  console.log(JSON.stringify(result, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
