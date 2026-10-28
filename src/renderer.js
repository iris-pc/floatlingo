const api = window.floatlingo;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const el = {
  app: $('#app'),
  statusPill: $('#statusPill'),
  statusText: $('#statusText'),
  btnSettings: $('#btnSettings'),
  btnMinimize: $('#btnMinimize'),
  btnClose: $('#btnClose'),
  permissionBanner: $('#permissionBanner'),
  permissionTitle: $('#permissionTitle'),
  permissionText: $('#permissionText'),
  btnPermissionFix: $('#btnPermissionFix'),
  btnPermissionClose: $('#btnPermissionClose'),
  emptyState: $('#emptyState'),
  btnStart: $('#btnStart'),
  btnDemo: $('#btnDemo'),
  captionList: $('#captionList'),
  listening: $('#listening'),
  listeningText: $('#listeningText'),
  micMeter: $('#micMeter'),
  systemMeter: $('#systemMeter'),
  micMeterState: $('#micMeterState'),
  systemMeterState: $('#systemMeterState'),
  providerBadge: $('#providerBadge'),
  latencyBadge: $('#latencyBadge'),
  recognitionBadge: $('#recognitionBadge'),
  btnStop: $('#btnStop'),
  btnStartSmall: $('#btnStartSmall'),
  btnMinutes: $('#btnMinutes'),
  minutesBtnSettings: $('#minutesBtnSettings'),
  minutesPanel: $('#minutesPanel'),
  minutesClose: $('#minutesClose'),
  minutesTabs: $('#minutesTabs'),
  minutesMeta: $('#minutesMeta'),
  minutesContent: $('#minutesContent'),
  minutesTranscript: $('#minutesTranscript'),
  minutesEmpty: $('#minutesEmpty'),
  minutesEmptyTitle: $('#minutesEmptyTitle'),
  minutesEmptyText: $('#minutesEmptyText'),
  minutesError: $('#minutesError'),
  minutesGenerate: $('#minutesGenerate'),
  minutesLoading: $('#minutesLoading'),
  minutesLoadingText: $('#minutesLoadingText'),
  minutesStatus: $('#minutesStatus'),
  minutesCopy: $('#minutesCopy'),
  minutesExportMd: $('#minutesExportMd'),
  minutesExportTxt: $('#minutesExportTxt'),
  minutesRegenerate: $('#minutesRegenerate'),
  clickThroughStrip: $('#clickThroughStrip'),
  settingsPanel: $('#settingsPanel'),
  settingsBody: $('#settingsBody'),
  settingsClose: $('#settingsClose'),
  settingsSave: $('#settingsSave'),
  saveStatus: $('#saveStatus'),
  openaiKey: $('#openaiKey'),
  deepseekKey: $('#deepseekKey'),
  openaiKeyState: $('#openaiKeyState'),
  deepseekKeyState: $('#deepseekKeyState'),
  providerSegmented: $('#providerSegmented'),
  sourceProfile: $('#sourceProfile'),
  sttDelay: $('#sttDelay'),
  sttPrompt: $('#sttPrompt'),
  keywords: $('#keywords'),
  sttMode: $('#sttMode'),
  sttModel: $('#sttModel'),
  httpModel: $('#httpModel'),
  openaiBaseUrl: $('#openaiBaseUrl'),
  deepseekBaseUrl: $('#deepseekBaseUrl'),
  deepseekModel: $('#deepseekModel'),
  openaiTranslationModel: $('#openaiTranslationModel'),
  vadSensitivity: $('#vadSensitivity'),
  vadSensitivityValue: $('#vadSensitivityValue'),
  silenceMs: $('#silenceMs'),
  silenceMsValue: $('#silenceMsValue'),
  maxSegmentSec: $('#maxSegmentSec'),
  maxSegmentSecValue: $('#maxSegmentSecValue'),
  micEnabled: $('#micEnabled'),
  systemEnabled: $('#systemEnabled'),
  opacity: $('#opacity'),
  opacityValue: $('#opacityValue'),
  fontScale: $('#fontScale'),
  fontScaleValue: $('#fontScaleValue'),
  alwaysOnTop: $('#alwaysOnTop'),
  showOriginal: $('#showOriginal'),
  clickThroughBtn: $('#clickThroughBtn'),
  glossary: $('#glossary'),
  permissionMicState: $('#permissionMicState'),
  permissionScreenState: $('#permissionScreenState'),
  exportBtn: $('#exportBtn'),
  clearBtn: $('#clearBtn'),
  logBtn: $('#logBtn'),
  toastStack: $('#toastStack')
};

const state = {
  config: null,
  draftProvider: 'deepseek',
  session: null,
  active: false,
  starting: false,
  demo: false,
  demoRun: 0,
  simulate: false,
  demoTimeouts: [],
  captions: new Map(),
  order: [],
  elements: new Map(),
  mic: null,
  permissions: null,
  settingsOpen: false,
  saveBusy: false,
  restartAfterSave: false,
  lastToast: { message: '', at: 0 },
  clickThrough: false,
  minutes: {
    open: false,
    busy: false,
    markdown: '',
    transcript: '',
    meta: null,
    tab: 'minutes',
    error: '',
    generated: false,
    runId: 0
  }
};

const DEMO_SCRIPT = [
  {
    channel: 'mic',
    zh: '大家好，今天主要讨论第三季度的产品路线图。',
    ko: '여러분 안녕하세요. 오늘은 3분기 제품 로드맵을 주로 논의하겠습니다.'
  },
  {
    channel: 'system',
    zh: '我们可以在十月底之前完成第一版吗？',
    ko: '10월 말까지 첫 번째 버전을 완성할 수 있을까요?'
  },
  {
    channel: 'mic',
    zh: '可以，但需要把多语言测试提前。',
    ko: '가능하지만 다국어 테스트를 앞당겨야 합니다.'
  },
  {
    channel: 'system',
    zh: '那韩国市场的上线时间也一起调整。',
    ko: '그럼 한국 시장 출시 일정도 함께 조정하겠습니다.'
  }
];

function init() {
  bindEvents();
  updateEmptyState();
  resetMinutes();
  subscribeEvents();
  api.rendererReady();
  loadConfig()
    .then(() => {
      applyConfigToForm();
      applyVisualSettings();
      return refreshPermissions();
    })
    .then(() => {
      if (state.config && !state.config.hasOpenAIKey && !isDemoQuery()) {
        setTimeout(() => {
          openSettings();
          setSaveStatus('先填写 API Key，才能开始实时识别。', '');
        }, 500);
      }
    })
    .catch((error) => {
      console.error(error);
      showToast({ type: 'error', message: `初始化失败：${error.message}` });
    });
}

function bindEvents() {
  el.btnStart.addEventListener('click', startFlow);
  el.btnStop.addEventListener('click', stopFlow);
  el.btnStartSmall.addEventListener('click', startFlow);
  el.btnMinutes.addEventListener('click', () => openMinutesPanel(true));
  el.minutesBtnSettings.addEventListener('click', () => openMinutesPanel(true));
  el.minutesClose.addEventListener('click', closeMinutesPanel);
  el.minutesGenerate.addEventListener('click', generateMinutes);
  el.minutesRegenerate.addEventListener('click', generateMinutes);
  el.minutesCopy.addEventListener('click', copyMinutes);
  el.minutesExportMd.addEventListener('click', () => exportMinutes('md'));
  el.minutesExportTxt.addEventListener('click', () => exportMinutes('txt'));
  el.minutesTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-minutes-tab]');
    if (!button || button.disabled) return;
    setMinutesTab(button.dataset.minutesTab);
  });
  el.btnDemo.addEventListener('click', () => (state.demo ? stopDemo() : startDemo()));
  el.settingsClose.addEventListener('click', closeSettings);
  el.btnMinimize.addEventListener('click', () => api.minimize());
  el.btnClose.addEventListener('click', () => api.hide());
  el.btnPermissionClose.addEventListener('click', () => el.permissionBanner.classList.add('hidden'));
  el.btnPermissionFix.addEventListener('click', fixPermission);
  el.btnSettings.addEventListener('click', openSettings);
  el.settingsSave.addEventListener('click', saveAllSettings);
  el.exportBtn.addEventListener('click', exportHistory);
  el.clearBtn.addEventListener('click', clearHistory);
  el.logBtn.addEventListener('click', () => api.openLog());
  el.clickThroughBtn.addEventListener('click', () => api.setIgnoreMouse(!state.clickThrough));

  el.providerSegmented.addEventListener('click', (event) => {
    const button = event.target.closest('[data-provider]');
    if (!button) return;
    setProvider(button.dataset.provider);
  });

  for (const button of $$('[data-clear-key]')) {
    button.addEventListener('click', () => clearKey(button.dataset.clearKey));
  }
  for (const button of $$('[data-open-permission]')) {
    button.addEventListener('click', () => api.openPermission(button.dataset.openPermission));
  }
  for (const button of $$('[data-reveal-helper]')) {
    button.addEventListener('click', () => api.revealHelper());
  }

  el.openaiKey.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveAllSettings();
  });
  el.deepseekKey.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveAllSettings();
  });

  let opacityTimer = null;
  el.opacity.addEventListener('input', () => {
    el.opacityValue.textContent = `${Math.round(Number(el.opacity.value) * 100)}%`;
    clearTimeout(opacityTimer);
    opacityTimer = setTimeout(() => api.setOpacity(Number(el.opacity.value)).catch(() => {}), 120);
  });
  el.alwaysOnTop.addEventListener('change', () => {
    api.setAlwaysOnTop(el.alwaysOnTop.checked).catch(() => {});
  });
  el.showOriginal.addEventListener('change', () => {
    document.body.classList.toggle('show-original-off', !el.showOriginal.checked);
  });
  el.fontScale.addEventListener('input', () => {
    el.fontScaleValue.textContent = `${Math.round(Number(el.fontScale.value) * 100)}%`;
    document.documentElement.style.setProperty('--font-scale', el.fontScale.value);
  });
  el.vadSensitivity.addEventListener('input', () => {
    el.vadSensitivityValue.textContent = `${Math.round(Number(el.vadSensitivity.value) * 100)}%`;
  });
  el.silenceMs.addEventListener('input', () => {
    el.silenceMsValue.textContent = `${el.silenceMs.value}ms`;
  });
  el.maxSegmentSec.addEventListener('input', () => {
    el.maxSegmentSecValue.textContent = `${el.maxSegmentSec.value}s`;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.minutes.open) closeMinutesPanel();
    else if (event.key === 'Escape' && state.settingsOpen) closeSettings();
    if ((event.metaKey || event.ctrlKey) && event.key === ',') {
      event.preventDefault();
      openSettings();
    }
  });
}

function subscribeEvents() {
  api.onCaption((caption) => upsertCaption(caption));
  api.onCaptionRemove(({ id }) => removeCaption(id));
  api.onLevels((levels) => applyLevels(levels));
  api.onSession((session) => applySession(session));
  api.onToast((payload) => showToast(payload));
  api.onHistoryCleared(() => {
    clearCaptionDom();
    resetMinutes();
    updateEmptyState();
  });
  api.onClickThrough((value) => {
    state.clickThrough = Boolean(value);
    document.body.classList.toggle('click-through', state.clickThrough);
    el.clickThroughStrip.classList.toggle('hidden', !state.clickThrough);
    el.clickThroughBtn.textContent = state.clickThrough ? '关闭' : '开启';
    el.clickThroughBtn.classList.toggle('active', state.clickThrough);
  });
  api.onOpenSettings(() => openSettings());
  api.onToggleSession(() => (state.active || state.demo ? stopFlow() : startFlow()));
  api.onMinutesShortcut(() => openMinutesPanel(true));
  api.onMinutesProgress((progress) => applyMinutesProgress(progress));
  api.onAppFlags((flags) => {
    state.simulate = Boolean(flags?.simulate);
    if (flags?.demo) startDemo();
  });
}

async function loadConfig() {
  state.config = await api.getConfig();
  return state.config;
}

function applyConfigToForm() {
  const config = state.config;
  if (!config) return;

  el.sourceProfile.innerHTML = '';
  const profiles = config.sourceProfiles || {};
  for (const [key, value] of Object.entries(profiles)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = value.label;
    el.sourceProfile.append(option);
  }

  setValue(el.sourceProfile, config.sourceProfile);
  setValue(el.sttDelay, config.sttDelay);
  setValue(el.sttMode, config.sttMode);
  setValue(el.sttModel, config.sttModel);
  setValue(el.httpModel, config.httpModel);
  setValue(el.openaiBaseUrl, config.openaiBaseUrl);
  setValue(el.deepseekBaseUrl, config.deepseekBaseUrl);
  setValue(el.deepseekModel, config.deepseekModel);
  setValue(el.openaiTranslationModel, config.openaiTranslationModel);
  setValue(el.sttPrompt, config.sttPrompt);
  setValue(el.keywords, config.keywords);
  setValue(el.glossary, config.glossary);
  setValue(el.vadSensitivity, config.vadSensitivity);
  setValue(el.silenceMs, config.silenceMs);
  setValue(el.maxSegmentSec, config.maxSegmentSec);
  setValue(el.opacity, config.opacity);
  setValue(el.fontScale, config.fontScale);
  el.micEnabled.checked = Boolean(config.micEnabled);
  el.systemEnabled.checked = Boolean(config.systemEnabled);
  el.alwaysOnTop.checked = Boolean(config.alwaysOnTop);
  el.showOriginal.checked = Boolean(config.showOriginal);
  setProvider(config.translationProvider);
  updateRangeLabels();
  applyKeyStatus(config);
  if (!state.demo) el.providerBadge.textContent = `${providerName(config.translationProvider)} · KO`;
}

function setProvider(provider) {
  const value = provider === 'openai' ? 'openai' : 'deepseek';
  state.draftProvider = value;
  for (const button of $$('[data-provider]')) {
    button.classList.toggle('active', button.dataset.provider === value);
  }
  if (!state.demo) el.providerBadge.textContent = `${providerName(value)} · KO`;
}

function providerName(provider) {
  return provider === 'openai' ? 'OpenAI' : 'DeepSeek';
}

function setValue(input, value) {
  if (!input) return;
  input.value = value ?? '';
}

function updateRangeLabels() {
  el.vadSensitivityValue.textContent = `${Math.round(Number(el.vadSensitivity.value) * 100)}%`;
  el.silenceMsValue.textContent = `${el.silenceMs.value}ms`;
  el.maxSegmentSecValue.textContent = `${el.maxSegmentSec.value}s`;
  el.opacityValue.textContent = `${Math.round(Number(el.opacity.value) * 100)}%`;
  el.fontScaleValue.textContent = `${Math.round(Number(el.fontScale.value) * 100)}%`;
}

function applyKeyStatus(config) {
  const openaiReady = Boolean(config.hasOpenAIKey);
  const deepseekReady = Boolean(config.hasDeepSeekKey);
  el.openaiKeyState.textContent = openaiReady
    ? `已保存 · ${sourceLabel(config.openaiKeySource)}`
    : '未设置，语音识别无法启动';
  el.openaiKeyState.classList.toggle('ok', openaiReady);
  el.deepseekKeyState.textContent = deepseekReady
    ? `已保存 · ${sourceLabel(config.deepseekKeySource)}`
    : '未设置，DeepSeek 翻译会失败';
  el.deepseekKeyState.classList.toggle('ok', deepseekReady);
  el.openaiKey.placeholder = openaiReady ? '已保存 · 输入新 Key 可替换' : 'sk-...';
  el.deepseekKey.placeholder = deepseekReady ? '已保存 · 输入新 Key 可替换' : 'sk-...';
  if (!state.demo) el.providerBadge.textContent = `${providerName(config.translationProvider)} · KO`;
}

function sourceLabel(source) {
  if (source === 'env') return '环境变量';
  if (source === 'saved') return configEncryptionLabel();
  return '未设置';
}

function configEncryptionLabel() {
  return state.config?.keyEncryption === 'safeStorage' ? '系统钥匙串加密' : '本机存储';
}

function applyVisualSettings() {
  if (!state.config) return;
  document.documentElement.style.setProperty('--font-scale', state.config.fontScale);
  document.body.classList.toggle('show-original-off', !state.config.showOriginal);
}

async function refreshPermissions() {
  try {
    const permissions = await api.getPermissions();
    state.permissions = permissions;
    updatePermissionLabels();
    maybeShowPermissionBanner();
  } catch (error) {
    console.warn('Permission check failed', error);
  }
}

function updatePermissionLabels() {
  if (!state.permissions) return;
  const mic = state.permissions.microphone;
  const screen = state.permissions.screen;
  el.permissionMicState.textContent = permissionText(mic);
  el.permissionScreenState.textContent = permissionText(screen);
}

function permissionText(value) {
  if (value === 'granted') return '已允许';
  if (value === 'denied') return '未允许';
  if (value === 'restricted') return '受系统限制';
  if (value === 'not-determined') return '尚未请求';
  if (value === 'unknown') return '未知';
  if (value === 'helper') return '由音频组件独立管理';
  return value || '未知';
}

function maybeShowPermissionBanner() {
  if (state.demo) {
    el.permissionBanner.classList.add('hidden');
    return;
  }
  if (!state.config || !state.permissions) return;
  const issues = [];
  if (state.config.micEnabled && state.permissions.microphone === 'denied') {
    issues.push({ kind: 'microphone', title: '麦克风未授权', text: '现场人声无法识别。请在系统设置中允许浮译使用麦克风。' });
  }
  if (!issues.length) {
    el.permissionBanner.classList.add('hidden');
    return;
  }
  const issue = issues[0];
  state.permissionIssue = issue;
  el.permissionTitle.textContent = issue.title;
  el.permissionText.textContent = issue.text;
  el.permissionBanner.classList.remove('hidden');
}

async function fixPermission() {
  const issue = state.permissionIssue;
  if (!issue) return;
  if (issue.kind === 'microphone') {
    const result = await api.askMicrophone().catch(() => ({ granted: false }));
    if (result.granted) {
      el.permissionBanner.classList.add('hidden');
      await refreshPermissions();
      showToast({ type: 'info', message: '麦克风权限已开启' });
      return;
    }
  }
  await api.openPermission(issue.kind);
  showToast({ type: 'info', message: '请在系统设置中授权后，重新开始会话。' });
}

async function startFlow() {
  if (state.starting) return;
  closeMinutesPanel();
  if (state.demo) stopDemo();
  if (!state.config) await loadConfig();
  if (!state.config.hasOpenAIKey) {
    openSettings();
    setSaveStatus('请先填写 OpenAI API Key（语音识别）。', 'error');
    showToast({ type: 'warn', message: '语音识别需要 OpenAI API Key。' });
    return;
  }
  if (!state.config.micEnabled && !state.config.systemEnabled) {
    openSettings();
    setSaveStatus('请至少开启一路声音来源。', 'error');
    return;
  }
  if (state.config.translationProvider === 'deepseek' && !state.config.hasDeepSeekKey) {
    openSettings();
    setSaveStatus('DeepSeek 翻译需要 DeepSeek API Key，或在设置中改用 OpenAI。', 'error');
    showToast({ type: 'warn', message: '请填写 DeepSeek Key，或把翻译引擎切换为 OpenAI。' });
    return;
  }

  updateLatency(null);
  updateRecognition(null);
  state.starting = true;
  el.btnStart.disabled = true;
  el.btnStart.textContent = '正在连接…';
  try {
    const result = await api.startSession();
    if (!result?.ok) {
      showToast({ type: 'error', message: result?.error || '会话启动失败' });
      openSettings();
      return;
    }
    state.active = true;
    state.session = result.state || null;
    applySession(result.state || { active: true, status: 'connecting', channels: {} });
    if (state.config.micEnabled && !state.simulate) {
      try {
        await startMicCapture();
      } catch (error) {
        console.error(error);
        const message = micErrorMessage(error);
        showToast({ type: 'error', message });
        await api.reportMicError(message);
      }
    }
    await refreshPermissions();
  } catch (error) {
    showToast({ type: 'error', message: `启动失败：${error.message}` });
  } finally {
    state.starting = false;
    el.btnStart.disabled = false;
    el.btnStart.innerHTML = '<span class="play-icon">▶</span> 开始实时翻译';
    updateEmptyState();
  }
}

async function stopFlow() {
  if (state.demo) {
    stopDemo();
    return;
  }
  stopMicCapture();
  try {
    await api.stopSession();
  } catch (error) {
    console.warn(error);
  }
  state.active = false;
  state.session = null;
  applySession({
    active: false,
    status: 'idle',
    channels: {},
    latencyMs: null,
    recognitionLatencyMs: null,
    model: state.config?.sttModel,
    translationProvider: state.config?.translationProvider
  });
}

async function startMicCapture() {
  if (state.mic) return;
  const ctx = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
  try {
    if (Math.abs(ctx.sampleRate - 24000) > 1) {
      throw new Error(`音频采样率异常：${ctx.sampleRate}Hz（需要 24000Hz）`);
    }
    await ctx.audioWorklet.addModule('./audio-worklet.js');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    });
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit'
    });
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    source.connect(node);
    node.connect(silentSink);
    silentSink.connect(ctx.destination);
    node.port.onmessage = (event) => {
      const pcm = event.data?.pcm;
      if (pcm) api.sendMic(pcm);
    };
    await ctx.resume();
    state.mic = { ctx, stream, source, node, silentSink };
  } catch (error) {
    try {
      await ctx.close();
    } catch {
      // ignore
    }
    throw error;
  }
}

function stopMicCapture() {
  const mic = state.mic;
  state.mic = null;
  if (!mic) return;
  try {
    mic.node.port.onmessage = null;
    mic.source.disconnect();
    mic.node.disconnect();
    mic.silentSink.disconnect();
    for (const track of mic.stream.getTracks()) track.stop();
    mic.ctx.close().catch(() => {});
  } catch (error) {
    console.warn('Mic cleanup failed', error);
  }
}

function micErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return '麦克风权限被拒绝，请在系统设置中允许浮译使用麦克风。';
  if (error?.name === 'NotFoundError') return '没有找到可用的麦克风。';
  if (error?.name === 'NotReadableError') return '麦克风被其他应用占用，暂时无法读取。';
  return `麦克风启动失败：${error?.message || error}`;
}

function applySession(session) {
  state.session = session;
  state.active = Boolean(session?.active);
  const status = session?.status || (state.active ? 'connecting' : 'idle');
  const labels = {
    idle: '待命',
    connecting: '连接中…',
    listening: '聆听中 · KO',
    degraded: '部分音频不可用',
    error: '连接失败'
  };
  const classes = { idle: 'idle', connecting: 'connecting', listening: 'listening', degraded: 'degraded', error: 'error' };
  el.statusPill.className = `status-pill ${classes[status] || 'idle'}`;
  el.statusText.textContent = labels[status] || '待命';

  if (session?.latencyMs != null) updateLatency(session.latencyMs);
  if (session?.recognitionLatencyMs != null) updateRecognition(session.recognitionLatencyMs);

  const channels = session?.channels || {};
  applyChannel(el.micMeter, el.micMeterState, channels.mic, state.config?.micEnabled);
  applyChannel(el.systemMeter, el.systemMeterState, channels.system, state.config?.systemEnabled);

  if (!state.demo) {
    el.providerBadge.textContent = `${providerName(session?.translationProvider || state.config?.translationProvider)} · KO`;
  }
  if (state.active && state.captions.size === 0) {
    el.listeningText.textContent = status === 'connecting' ? '正在连接识别服务…' : '正在聆听，第一句马上出现…';
  }
  updateEmptyState();
}

function applyChannel(root, stateEl, channel, configured) {
  const enabled = configured !== false && channel?.enabled !== false && (channel?.enabled || configured);
  root.classList.toggle('enabled', Boolean(enabled && channel?.status !== 'off'));
  root.classList.toggle('error', channel?.status === 'error');
  if (!configured) {
    stateEl.textContent = '—';
    setMeter(root, 0, false);
    return;
  }
  if (!state.active) {
    stateEl.textContent = channel?.status === 'error' ? '错误' : '—';
    setMeter(root, 0, false);
    return;
  }
  if (channel?.status === 'error') stateEl.textContent = '错误';
  else if (channel?.status === 'connecting') stateEl.textContent = '连接';
  else if (channel?.speaking) stateEl.textContent = '说话';
  else stateEl.textContent = '就绪';
}

function applyLevels(levels) {
  if (!state.active) return;
  applyLevel(el.micMeter, levels?.mic, state.config?.micEnabled);
  applyLevel(el.systemMeter, levels?.system, state.config?.systemEnabled);
}

function applyLevel(root, data, configured) {
  if (!configured || !data) {
    setMeter(root, 0, false);
    return;
  }
  const db = Number(data.levelDb ?? -90);
  const percent = Math.max(0, Math.min(100, ((db + 58) / 58) * 100));
  setMeter(root, percent, Boolean(data.speaking));
}

function setMeter(root, percent, speaking) {
  const bar = root.querySelector('.meter i');
  if (bar) bar.style.width = `${percent.toFixed(1)}%`;
  root.classList.toggle('active', speaking);
}

function updateLatency(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    el.latencyBadge.textContent = '译 —';
    el.latencyBadge.classList.remove('good');
    return;
  }
  el.latencyBadge.textContent = `译 ${(ms / 1000).toFixed(1)}s`;
  el.latencyBadge.classList.toggle('good', ms <= 3000);
}

function updateRecognition(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    el.recognitionBadge.textContent = '原文 —';
    el.recognitionBadge.classList.remove('good');
    return;
  }
  el.recognitionBadge.textContent = `原文 ${(ms / 1000).toFixed(1)}s`;
  el.recognitionBadge.classList.toggle('good', ms <= 3000);
}

function upsertCaption(caption) {
  if (!caption) return;
  const isNew = !state.captions.has(caption.id);
  state.captions.set(caption.id, caption);
  if (isNew) state.order.push(caption.id);
  if (state.order.length > 40) {
    const removed = state.order.shift();
    state.captions.delete(removed);
    const node = state.elements.get(removed);
    if (node) node.remove();
    state.elements.delete(removed);
  }
  let node = state.elements.get(caption.id);
  if (!node) {
    node = buildCaptionNode(caption);
    state.elements.set(caption.id, node);
    el.captionList.append(node);
  }
  updateCaptionNode(node, caption);
  updateLatestClasses();
  if (caption.latencyMs != null) updateLatency(caption.latencyMs);
  if (caption.recognitionLatencyMs != null) updateRecognition(caption.recognitionLatencyMs);
  if (isNew || isNearBottom()) scrollToBottom();
  updateEmptyState();
}

function buildCaptionNode(caption) {
  const node = document.createElement('article');
  node.className = `caption-card ${caption.channel}`;
  node.dataset.id = caption.id;
  node.innerHTML = `
    <div class="caption-meta">
      <span class="source-badge"></span>
      <span class="caption-time"></span>
      <span class="caption-latency"></span>
    </div>
    <div class="translation" lang="ko"></div>
    <div class="original" lang="zh"></div>
    <div class="caption-error hidden"><span class="error-text"></span><button class="retry-btn" type="button">重试</button></div>
    <div class="caption-actions"><button class="tiny-btn copy-btn" type="button">复制</button></div>
  `;
  node.querySelector('.copy-btn').addEventListener('click', () => copyCaption(caption.id));
  node.querySelector('.retry-btn').addEventListener('click', () => retryCaption(caption.id));
  return node;
}

function updateCaptionNode(node, caption) {
  const badge = node.querySelector('.source-badge');
  badge.textContent = caption.source || (caption.channel === 'system' ? '设备' : '现场');
  badge.classList.toggle('system', caption.channel === 'system');
  node.classList.toggle('system', caption.channel === 'system');
  node.querySelector('.caption-time').textContent = formatTime(caption.createdAt);
  const latency = node.querySelector('.caption-latency');
  if (caption.recognitionLatencyMs != null) {
    latency.textContent = `识别 ${(caption.recognitionLatencyMs / 1000).toFixed(1)}s`;
    latency.classList.toggle('good', caption.recognitionLatencyMs <= 3000);
    latency.title = caption.latencyMs != null ? `翻译首字 ${(caption.latencyMs / 1000).toFixed(1)}s` : '';
  } else {
    latency.textContent = '';
    latency.classList.remove('good');
  }

  const translation = node.querySelector('.translation');
  if (caption.translation) {
    translation.classList.remove('pending');
    translation.textContent = caption.translation;
    if (!caption.final) {
      const caret = document.createElement('span');
      caret.className = 'caret';
      translation.append(caret);
    }
  } else if (caption.status === 'error') {
    translation.classList.remove('pending');
    translation.textContent = '';
  } else {
    translation.classList.add('pending');
    translation.innerHTML = '<i></i><i></i><i></i>';
  }

  const original = node.querySelector('.original');
  original.textContent = caption.original || '';
  original.classList.toggle('hidden', !caption.original);

  const error = node.querySelector('.caption-error');
  const errorText = node.querySelector('.error-text');
  if (caption.status === 'error' && caption.error) {
    error.classList.remove('hidden');
    errorText.textContent = caption.error;
  } else {
    error.classList.add('hidden');
  }
  node.dataset.status = caption.status;
  node.dataset.final = caption.final ? '1' : '0';
}

function updateLatestClasses() {
  const latestId = state.order[state.order.length - 1];
  for (const [id, node] of state.elements) {
    node.classList.toggle('latest', id === latestId);
  }
}

function removeCaption(id) {
  const node = state.elements.get(id);
  if (node) node.remove();
  state.elements.delete(id);
  state.captions.delete(id);
  state.order = state.order.filter((item) => item !== id);
  updateLatestClasses();
  updateEmptyState();
}

function clearCaptionDom() {
  for (const node of state.elements.values()) node.remove();
  state.elements.clear();
  state.captions.clear();
  state.order = [];
}

function updateEmptyState() {
  const showEmpty = !state.active && !state.demo && state.captions.size === 0;
  const waiting = state.active && state.captions.size === 0;
  el.emptyState.classList.toggle('hidden', !showEmpty);
  el.captionList.classList.toggle('hidden', showEmpty || waiting);
  el.listening.classList.toggle('hidden', !waiting);
  el.listening.classList.toggle('centered', waiting);
  updateFooterActions();
}

function updateFooterActions() {
  const active = state.active || state.demo;
  el.btnStop.classList.toggle('hidden', !active);
  el.btnMinutes.classList.toggle('hidden', active || state.captions.size === 0);
  el.btnStartSmall.classList.toggle('hidden', active || state.captions.size === 0);
}

function isNearBottom() {
  const list = el.captionList;
  return list.scrollHeight - list.scrollTop - list.clientHeight < 90;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    el.captionList.scrollTop = el.captionList.scrollHeight;
  });
}


function openMinutesPanel(autoGenerate = true) {
  if (state.active) {
    showToast({ type: 'warn', message: '请先停止识别，再生成会议纪要。' });
    return;
  }
  if (!state.captions.size) {
    showToast({ type: 'warn', message: '还没有可生成纪要的逐字记录。' });
    return;
  }
  if (state.settingsOpen) closeSettings();
  state.minutes.open = true;
  el.minutesPanel.classList.add('open');
  el.minutesPanel.setAttribute('aria-hidden', 'false');
  updateMinutesTabs();
  if (!state.minutes.generated && !state.minutes.busy && !state.minutes.error && autoGenerate) {
    generateMinutes();
  } else if (state.minutes.generated) {
    showMinutesResult();
  }
}

function closeMinutesPanel() {
  state.minutes.open = false;
  el.minutesPanel.classList.remove('open');
  el.minutesPanel.setAttribute('aria-hidden', 'true');
}

function resetMinutes() {
  state.minutes.open = false;
  state.minutes.runId += 1;
  state.minutes.busy = false;
  state.minutes.markdown = '';
  state.minutes.transcript = '';
  state.minutes.meta = null;
  state.minutes.tab = 'minutes';
  state.minutes.error = '';
  state.minutes.generated = false;
  el.minutesPanel.classList.remove('open');
  el.minutesPanel.setAttribute('aria-hidden', 'true');
  el.minutesContent.textContent = '';
  el.minutesTranscript.textContent = '';
  el.minutesContent.classList.add('hidden');
  el.minutesTranscript.classList.add('hidden');
  el.minutesLoading.classList.add('hidden');
  el.minutesEmpty.classList.remove('hidden');
  el.minutesError.classList.add('hidden');
  el.minutesError.textContent = '';
  el.minutesEmptyTitle.textContent = '整理成可追溯的会议纪要';
  el.minutesEmptyText.textContent = '基于完整逐字记录生成，保留数字、负责人、决议和原话；正文中的 [Sxxx] 可在逐字稿中核对。';
  el.minutesGenerate.textContent = '生成会议纪要';
  el.minutesGenerate.disabled = false;
  el.minutesMeta.textContent = '—';
  el.minutesStatus.textContent = '保留实际内容 · 全程可核对';
  updateMinutesTabs();
  updateMinutesButtons();
}

async function generateMinutes() {
  if (state.minutes.busy) return;
  if (state.active) {
    showToast({ type: 'warn', message: '请先停止识别，再生成会议纪要。' });
    return;
  }
  if (!state.captions.size) {
    showToast({ type: 'warn', message: '还没有可生成纪要的逐字记录。' });
    return;
  }

  const runId = ++state.minutes.runId;
  state.minutes.busy = true;
  state.minutes.error = '';
  state.minutes.generated = false;
  if (state.settingsOpen) closeSettings();
  state.minutes.open = true;
  el.minutesPanel.classList.add('open');
  el.minutesPanel.setAttribute('aria-hidden', 'false');
  el.minutesEmpty.classList.add('hidden');
  el.minutesContent.classList.add('hidden');
  el.minutesTranscript.classList.add('hidden');
  el.minutesError.classList.add('hidden');
  el.minutesLoading.classList.remove('hidden');
  el.minutesLoadingText.textContent = '正在读取完整逐字记录…';
  el.minutesStatus.textContent = '正在阅读完整逐字记录…';
  el.minutesMeta.textContent = '处理中';
  el.minutesGenerate.disabled = true;
  updateMinutesButtons();

  try {
    const result = await api.generateMinutes();
    if (runId !== state.minutes.runId) return;
    if (result?.ok) {
      state.minutes.markdown = result.markdown || '';
      state.minutes.transcript = result.transcript || '';
      state.minutes.meta = result.meta || null;
      state.minutes.generated = true;
      state.minutes.error = '';
      state.minutes.tab = 'minutes';
      const displayMarkdown = state.minutes.markdown.replace(/^#\s+会议纪要\s*\n+/, '');
      el.minutesContent.innerHTML = renderMinutesMarkdown(displayMarkdown);
      el.minutesTranscript.textContent = state.minutes.transcript;
      el.minutesLoading.classList.add('hidden');
      el.minutesEmpty.classList.add('hidden');
      el.minutesContent.classList.remove('hidden');
      el.minutesTranscript.classList.add('hidden');
      updateMinutesTabs();
      updateMinutesMeta(result);
      updateMinutesButtons();
      el.minutesStatus.textContent = `已生成 · ${state.minutes.meta?.segmentCount || 0} 段 · ${durationLabel(state.minutes.meta?.durationMs)} · 可导出`;
      el.minutesContent.parentElement.scrollTop = 0;
    } else {
      state.minutes.error = result?.error || '纪要生成失败';
      state.minutes.transcript = result?.transcript || '';
      state.minutes.meta = result?.meta || null;
      state.minutes.generated = false;
      el.minutesLoading.classList.add('hidden');
      if (state.minutes.transcript) {
        el.minutesTranscript.textContent = state.minutes.transcript;
        state.minutes.tab = 'transcript';
        el.minutesEmpty.classList.add('hidden');
        el.minutesTranscript.classList.remove('hidden');
        el.minutesContent.classList.add('hidden');
      } else {
        el.minutesEmpty.classList.remove('hidden');
        el.minutesEmptyTitle.textContent = '纪要生成失败';
        el.minutesEmptyText.textContent = '逐字记录仍然保留。请检查 API Key、网络或额度后重试。';
        el.minutesError.classList.remove('hidden');
        el.minutesError.textContent = state.minutes.error;
        el.minutesGenerate.textContent = '重试生成';
        el.minutesGenerate.disabled = false;
      }
      el.minutesStatus.textContent = '生成失败 · 逐字记录已保留';
      updateMinutesMeta(result);
      updateMinutesButtons();
      showToast({ type: 'error', message: `纪要生成失败：${state.minutes.error}` });
      if (result?.code === 'MISSING_KEY' || result?.code === 'MINUTES_AUTH') {
        setTimeout(() => {
          closeMinutesPanel();
          openSettings();
          setSaveStatus('生成会议纪要需要对应的翻译 API Key。', 'error');
        }, 900);
      }
    }
  } catch (error) {
    if (runId !== state.minutes.runId) return;
    state.minutes.error = error.message;
    el.minutesLoading.classList.add('hidden');
    el.minutesEmpty.classList.remove('hidden');
    el.minutesEmptyTitle.textContent = '纪要生成失败';
    el.minutesEmptyText.textContent = '逐字记录仍然保留。请检查网络后重试。';
    el.minutesError.classList.remove('hidden');
    el.minutesError.textContent = error.message;
    el.minutesGenerate.textContent = '重试生成';
    el.minutesGenerate.disabled = false;
    el.minutesStatus.textContent = '生成失败 · 逐字记录已保留';
    updateMinutesButtons();
    showToast({ type: 'error', message: `纪要生成失败：${error.message}` });
  } finally {
    if (runId === state.minutes.runId) {
      state.minutes.busy = false;
      el.minutesLoading.classList.add('hidden');
      updateMinutesButtons();
    }
  }
}

function applyMinutesProgress(progress) {
  if (!state.minutes.busy) return;
  const message = progress?.message || '正在整理会议纪要…';
  el.minutesLoadingText.textContent = message;
  el.minutesStatus.textContent = message;
}

function showMinutesResult() {
  el.minutesEmpty.classList.add('hidden');
  el.minutesLoading.classList.add('hidden');
  if (state.minutes.tab === 'transcript') {
    el.minutesContent.classList.add('hidden');
    el.minutesTranscript.classList.remove('hidden');
  } else {
    el.minutesTranscript.classList.add('hidden');
    el.minutesContent.classList.remove('hidden');
  }
  updateMinutesTabs();
  updateMinutesButtons();
  updateMinutesMeta({ meta: state.minutes.meta });
}

function setMinutesTab(tab) {
  state.minutes.tab = tab === 'transcript' ? 'transcript' : 'minutes';
  for (const button of $$('[data-minutes-tab]')) {
    button.classList.toggle('active', button.dataset.minutesTab === state.minutes.tab);
  }
  el.minutesContent.parentElement.scrollTop = 0;
  if (state.minutes.tab === 'transcript' && state.minutes.transcript) {
    el.minutesContent.classList.add('hidden');
    el.minutesTranscript.classList.remove('hidden');
    el.minutesEmpty.classList.add('hidden');
  } else if (state.minutes.tab === 'minutes' && state.minutes.markdown) {
    el.minutesTranscript.classList.add('hidden');
    el.minutesContent.classList.remove('hidden');
    el.minutesEmpty.classList.add('hidden');
  } else if (!state.minutes.busy) {
    el.minutesContent.classList.add('hidden');
    el.minutesTranscript.classList.add('hidden');
    if (!state.minutes.generated) el.minutesEmpty.classList.remove('hidden');
  }
}

function updateMinutesTabs() {
  const minutesButton = el.minutesTabs.querySelector('[data-minutes-tab="minutes"]');
  const transcriptButton = el.minutesTabs.querySelector('[data-minutes-tab="transcript"]');
  if (minutesButton) {
    minutesButton.disabled = !state.minutes.markdown;
    minutesButton.classList.toggle('active', state.minutes.tab === 'minutes');
  }
  if (transcriptButton) {
    transcriptButton.disabled = !state.minutes.transcript;
    transcriptButton.classList.toggle('active', state.minutes.tab === 'transcript');
  }
  if (state.minutes.tab === 'minutes' && !state.minutes.markdown && state.minutes.transcript) {
    state.minutes.tab = 'transcript';
    if (transcriptButton) transcriptButton.classList.add('active');
    if (minutesButton) minutesButton.classList.remove('active');
  }
}

function updateMinutesButtons() {
  const hasMinutes = Boolean(state.minutes.markdown);
  const hasTranscript = Boolean(state.minutes.transcript);
  const enabled = !state.minutes.busy && (hasMinutes || hasTranscript);
  el.minutesCopy.disabled = !enabled;
  el.minutesExportMd.disabled = !enabled;
  el.minutesExportTxt.disabled = !enabled;
  el.minutesRegenerate.disabled = state.minutes.busy || state.active;
  el.minutesGenerate.disabled = state.minutes.busy;
}

function updateMinutesMeta(result) {
  const meta = result?.meta || state.minutes.meta;
  if (!meta) {
    el.minutesMeta.textContent = '—';
    return;
  }
  el.minutesMeta.textContent = `${meta.segmentCount || 0} 段 · ${durationLabel(meta.durationMs)}`;
}

function durationLabel(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

async function copyMinutes() {
  const value =
    state.minutes.tab === 'transcript' ? state.minutes.transcript : state.minutes.markdown;
  if (!value) return;
  await api.copyText(value);
  showToast({ type: 'info', message: '已复制' });
}

async function exportMinutes(format) {
  const value =
    state.minutes.tab === 'transcript' ? state.minutes.transcript : state.minutes.markdown;
  if (!value) {
    showToast({ type: 'warn', message: '还没有可导出的内容' });
    return;
  }
  const stamp = new Date()
    .toLocaleString('zh-CN', { hour12: false })
    .replace(/[/: ]/g, '-');
  const result = await api
    .exportMinutes({
      content: value,
      format,
      defaultName: `FloatLingo-会议纪要-${stamp}.${format}`
    })
    .catch((error) => ({ ok: false, error: error.message }));
  if (result?.ok) showToast({ type: 'info', message: `已导出 ${format.toUpperCase()}` });
  else if (!result?.canceled) showToast({ type: 'error', message: result?.error || '导出失败' });
}

function renderMinutesMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const output = [];
  let list = null;
  let paragraph = [];
  let quote = [];
  let code = null;

  const inline = (text) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      output.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
      quote = [];
    }
  };
  const flushList = () => {
    if (list) {
      output.push(`</${list}>`);
      list = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (code === null) {
        flushAll();
        code = [];
      } else {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    let match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      flushAll();
      const level = match[1].length;
      output.push(`<h${level}>${inline(match[2])}</h${level}>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      output.push('<hr>');
      continue;
    }
    match = line.match(/^>\s?(.*)$/);
    if (match) {
      flushParagraph();
      flushList();
      quote.push(match[1]);
      continue;
    }
    match = line.match(/^\s*[-*]\s+(.*)$/);
    if (match) {
      flushParagraph();
      flushQuote();
      if (list !== 'ul') {
        flushList();
        output.push('<ul>');
        list = 'ul';
      }
      output.push(`<li>${inline(match[1])}</li>`);
      continue;
    }
    match = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (match) {
      flushParagraph();
      flushQuote();
      if (list !== 'ol') {
        flushList();
        output.push('<ol>');
        list = 'ol';
      }
      output.push(`<li>${inline(match[1])}</li>`);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line);
  }
  if (code !== null) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushAll();
  return output.join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function copyCaption(id) {
  const caption = state.captions.get(id);
  if (!caption) return;
  const text = [caption.original, caption.translation].filter(Boolean).join('\n');
  await api.copyText(text);
  showToast({ type: 'info', message: '已复制' });
}

function retryCaption(id) {
  api.retryTranslation(id).then((result) => {
    if (!result?.ok) showToast({ type: 'warn', message: '暂时无法重试，请重新开始会话。' });
  });
}

function showToast(payload) {
  const message = String(payload?.message || payload || '');
  if (!message) return;
  const now = Date.now();
  if (message === state.lastToast.message && now - state.lastToast.at < 2500) return;
  state.lastToast = { message, at: now };

  const toast = document.createElement('div');
  toast.className = `toast ${payload?.type || 'info'}`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  if (payload?.action === 'open-screen-permission') {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = '去授权';
    action.addEventListener('click', () => api.openPermission('screen'));
    toast.append(action);
  }

  el.toastStack.append(toast);
  while (el.toastStack.children.length > 3) el.toastStack.firstElementChild.remove();
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  }, payload?.duration || 4500);
}

function openSettings() {
  if (!state.config) return;
  state.settingsOpen = true;
  applyConfigToForm();
  refreshPermissions();
  el.settingsPanel.classList.add('open');
  el.settingsPanel.setAttribute('aria-hidden', 'false');
  setSaveStatus('修改后需重新开始会话生效', '');
}

function closeSettings() {
  state.settingsOpen = false;
  el.settingsPanel.classList.remove('open');
  el.settingsPanel.setAttribute('aria-hidden', 'true');
  if (state.config) {
    state.draftProvider = state.config.translationProvider;
    el.providerBadge.textContent = `${providerName(state.config.translationProvider)} · KO`;
  }
}

function setSaveStatus(text, kind) {
  el.saveStatus.textContent = text;
  el.saveStatus.className = `save-status ${kind || ''}`;
}

async function saveAllSettings() {
  if (state.saveBusy || !state.config) return;
  state.saveBusy = true;
  el.settingsSave.disabled = true;
  el.settingsSave.textContent = '保存中…';
  try {
    const patch = {
      sourceProfile: el.sourceProfile.value,
      sttDelay: el.sttDelay.value,
      sttMode: el.sttMode.value,
      sttModel: el.sttModel.value.trim(),
      httpModel: el.httpModel.value.trim(),
      openaiBaseUrl: el.openaiBaseUrl.value.trim(),
      deepseekBaseUrl: el.deepseekBaseUrl.value.trim(),
      deepseekModel: el.deepseekModel.value.trim(),
      openaiTranslationModel: el.openaiTranslationModel.value.trim(),
      sttPrompt: el.sttPrompt.value,
      keywords: el.keywords.value,
      glossary: el.glossary.value,
      vadSensitivity: Number(el.vadSensitivity.value),
      silenceMs: Number(el.silenceMs.value),
      maxSegmentSec: Number(el.maxSegmentSec.value),
      opacity: Number(el.opacity.value),
      fontScale: Number(el.fontScale.value),
      micEnabled: el.micEnabled.checked,
      systemEnabled: el.systemEnabled.checked,
      alwaysOnTop: el.alwaysOnTop.checked,
      showOriginal: el.showOriginal.checked,
      translationProvider: state.draftProvider
    };

    const openaiValue = el.openaiKey.value.trim();
    const deepseekValue = el.deepseekKey.value.trim();
    if (openaiValue) await api.setKeys({ openai: openaiValue });
    if (deepseekValue) await api.setKeys({ deepseek: deepseekValue });

    const wasActive = state.active;
    const result = await api.saveSettings(patch);
    state.config = result.settings;
    state.draftProvider = state.config.translationProvider;
    el.openaiKey.value = '';
    el.deepseekKey.value = '';
    applyConfigToForm();
    applyVisualSettings();
    await refreshPermissions();

    if (wasActive) {
      setSaveStatus('已保存，正在重启会话…', 'ok');
      await stopFlow();
      await startFlow();
    }
    setSaveStatus('设置已保存', 'ok');
    showToast({ type: 'info', message: '设置已保存' });
    if (!wasActive) setTimeout(closeSettings, 450);
  } catch (error) {
    setSaveStatus(`保存失败：${error.message}`, 'error');
    showToast({ type: 'error', message: `保存失败：${error.message}` });
  } finally {
    state.saveBusy = false;
    el.settingsSave.disabled = false;
    el.settingsSave.textContent = '保存设置';
  }
}

async function clearKey(kind) {
  try {
    const result = await api.setKeys({ [kind]: null });
    state.config = { ...state.config, ...result };
    applyKeyStatus(state.config);
    el.openaiKey.value = '';
    el.deepseekKey.value = '';
    showToast({
      type: 'info',
      message: `${kind === 'openai' ? 'OpenAI' : 'DeepSeek'} Key 已清除${state.active ? '，重新开始会话后生效' : ''}`
    });
  } catch (error) {
    showToast({ type: 'error', message: `清除失败：${error.message}` });
  }
}

async function exportHistory() {
  const result = await api.exportHistory().catch((error) => ({ ok: false, error: error.message }));
  if (result?.ok) showToast({ type: 'info', message: '记录已导出' });
  else if (!result?.canceled) showToast({ type: 'warn', message: result?.error || '没有可导出的记录' });
}

async function clearHistory() {
  if (!state.captions.size) {
    showToast({ type: 'info', message: '当前没有记录' });
    return;
  }
  await api.clearHistory();
  clearCaptionDom();
  updateEmptyState();
  showToast({ type: 'info', message: '记录已清空' });
}

async function startDemo() {
  if (state.active) await stopFlow();
  stopDemo();
  clearCaptionDom();
  state.demo = true;
  state.demoRun += 1;
  const run = state.demoRun;
  el.statusPill.className = 'status-pill demo';
  el.statusText.textContent = '演示模式';
  el.btnDemo.textContent = '停止演示';
  el.permissionBanner.classList.add('hidden');
  el.emptyState.classList.add('hidden');
  el.listening.classList.add('hidden');
  updateFooterActions();
  el.providerBadge.textContent = 'DEMO · KO';
  el.latencyBadge.textContent = '译 1.2s';
  el.latencyBadge.classList.add('good');
  el.recognitionBadge.textContent = '原文 0.6s';
  el.recognitionBadge.classList.add('good');

  DEMO_SCRIPT.forEach((item, index) => {
    scheduleDemo(run, index * 2300 + 600, () => {
      const id = `demo-${run}-${index}`;
      const base = {
        id,
        channel: item.channel,
        source: item.channel === 'system' ? '设备' : '现场',
        original: '',
        translation: '',
        status: 'live',
        final: false,
        latencyMs: null,
        recognitionLatencyMs: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      upsertCaption({ ...base, original: item.zh.slice(0, Math.ceil(item.zh.length * 0.55)) });
      scheduleDemo(run, 420, () => {
        upsertCaption({ ...state.captions.get(id), original: item.zh, translation: item.ko.slice(0, Math.ceil(item.ko.length * 0.45)), latencyMs: 1180, recognitionLatencyMs: 620 });
      });
      scheduleDemo(run, 960, () => {
        upsertCaption({ ...state.captions.get(id), original: item.zh, translation: item.ko, status: 'done', final: true, latencyMs: 1240, recognitionLatencyMs: 640 });
      });
    });
  });
}

function scheduleDemo(run, delay, fn) {
  const timer = setTimeout(() => {
    if (!state.demo || state.demoRun !== run) return;
    fn();
  }, delay);
  state.demoTimeouts.push(timer);
}

function stopDemo() {
  state.demo = false;
  for (const timer of state.demoTimeouts) clearTimeout(timer);
  state.demoTimeouts = [];
  el.btnDemo.textContent = '查看演示';
  updateFooterActions();
  if (state.active) {
    el.statusPill.className = 'status-pill listening';
    el.statusText.textContent = '聆听中 · KO';
  } else {
    el.statusPill.className = 'status-pill idle';
    el.statusText.textContent = '待命';
  }
  el.providerBadge.textContent = `${providerName(state.config?.translationProvider)} · KO`;
  el.latencyBadge.textContent = '译 —';
  el.latencyBadge.classList.remove('good');
  el.recognitionBadge.textContent = '原文 —';
  el.recognitionBadge.classList.remove('good');
  updateEmptyState();
}

function isDemoQuery() {
  return new URLSearchParams(location.search).get('demo') === '1';
}

init();
