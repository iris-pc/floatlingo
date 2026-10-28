const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { ensureProfile } = require('./helpers');
(async () => {
  const root = path.resolve(__dirname, '..');
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${ensureProfile('e2e')}`],
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', OPENAI_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' }
  });
  const page = await app.firstWindow();
  const mainStatus = await app.evaluate(async ({ systemPreferences }) => {
    return {
      mic: systemPreferences.getMediaAccessStatus('microphone'),
      screen: systemPreferences.getMediaAccessStatus('screen')
    };
  });
  const result = await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const ctx = new AudioContext({ sampleRate: 24000 });
      await ctx.audioWorklet.addModule('./audio-worklet.js');
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      const sink = ctx.createGain(); sink.gain.value = 0;
      src.connect(node); node.connect(sink); sink.connect(ctx.destination);
      await ctx.resume();
      const first = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);
        node.port.onmessage = (e) => { clearTimeout(timer); resolve({ bytes: e.data.pcm.byteLength, rms: e.data.rms, sampleRate: e.data.sampleRate }); };
      });
      stream.getTracks().forEach(t => t.stop());
      await ctx.close();
      return { ok: true, sampleRate: ctx.sampleRate, first, label: stream.getAudioTracks()[0]?.label };
    } catch (e) {
      return { ok: false, name: e.name, message: e.message };
    }
  });
  console.log(JSON.stringify({ mainStatus, result }, null, 2));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
