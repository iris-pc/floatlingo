'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  dialog,
  shell,
  systemPreferences,
  session,
  screen,
  globalShortcut
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { CaptionPipeline } = require('./pipeline');
const { SystemAudioCapture } = require('./audio/system-audio');
const { generateMinutes, buildTranscriptText } = require('./minutes');
const settingsStore = require('./settings');
const logger = require('./logger');

let mainWindow = null;
let tray = null;
let pipeline = null;
let historyPipeline = null;
let systemCapture = null;
let quitting = false;
let clickThrough = false;
let boundsTimer = null;
let simulationTimer = null;
let minutesRun = null;

const isDev = process.argv.includes('--dev');
const isDemo = process.argv.includes('--demo');
const simulateAudio = process.argv.includes('--simulate-audio');
const screenshotArg = process.argv.find((arg) => arg.startsWith('--screenshot='));
const screenshotPath = screenshotArg ? screenshotArg.slice('--screenshot='.length) : null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}

app.setName('FloatLingo');

app
  .whenReady()
  .then(async () => {
    logger.init();
    settingsStore.init();
    setupPermissions();
    buildMenu();
    createWindow();
    createTray();
    registerShortcuts();
    logger.info('App ready', {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      userData: app.getPath('userData')
    });
    if (screenshotPath) {
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const image = await mainWindow.webContents.capturePage();
            fs.mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
            fs.writeFileSync(path.resolve(screenshotPath), image.toPNG());
            logger.info('Screenshot saved', { screenshotPath });
          } catch (error) {
            logger.error('Screenshot failed', error);
          }
          quitting = true;
          app.quit();
        }, simulateAudio ? 9000 : 2200);
      });
    }
  })
  .catch((error) => {
    try {
      logger.error('Failed to start app', error);
    } catch {
      console.error(error);
    }
    dialog.showErrorBox('FloatLingo 启动失败', String(error?.stack || error));
    app.quit();
  });

app.on('activate', () => showWindow());
app.on('window-all-closed', (event) => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  quitting = true;
  stopSession({ silent: true });
  globalShortcut.unregisterAll();
});

function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'audioCapture'];
    callback(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'display-capture', 'audioCapture'].includes(permission);
  });
  // Windows uses Chromium loopback; macOS uses the ScreenCaptureKit helper.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const { desktopCapturer } = require('electron');
    desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        if (!sources.length) {
          callback(null);
          return;
        }
        if (process.platform === 'win32') {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({ video: sources[0] });
        }
      })
      .catch(() => callback(null));
  });
}

function buildMenu() {
  const template = [
    {
      label: 'FloatLingo',
      submenu: [
        { role: 'about', label: '关于 FloatLingo' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 FloatLingo' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 FloatLingo' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const settings = settingsStore.getSettings();
  const bounds = settings.bounds || defaultBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const width = Math.min(Math.max(bounds.width || 620, 460), workArea.width);
  const height = Math.min(Math.max(bounds.height || 420, 300), workArea.height);
  const x = Number.isFinite(bounds.x)
    ? Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width)
    : workArea.x + workArea.width - width - 24;
  const y = Number.isFinite(bounds.y)
    ? Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height)
    : workArea.y + 56;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 460,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    hasShadow: true,
    roundedCorners: true,
    titleBarStyle: 'hidden',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(false);
  mainWindow.setOpacity(settings.opacity);

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'), {
    query: isDemo ? { demo: '1' } : {}
  });

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('move', queueBoundsSave);
  mainWindow.on('resize', queueBoundsSave);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });
  if (simulateAudio) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const result = await startSession();
        if (result.ok) startSimulatedAudio();
      }, 1200);
    });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function defaultBounds() {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    x: display.x + display.width - 644,
    y: display.y + 56,
    width: 620,
    height: 420
  };
}

function queueBoundsSave() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    settingsStore.updateBounds(mainWindow.getBounds());
  }, 250);
}

function createTray() {
  const trayPath = path.join(app.getAppPath(), 'src', 'assets', 'trayTemplate.png');
  let image = nativeImage.createFromPath(trayPath);
  if (image.isEmpty()) {
    image = nativeImage.createEmpty();
  } else if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }
  tray = new Tray(image);
  tray.setToolTip('浮译 FloatLingo · 实时韩语翻译');
  refreshTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const active = Boolean(pipeline?.active);
  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏浮窗' : '显示浮窗',
      click: () => (mainWindow?.isVisible() ? mainWindow.hide() : showWindow())
    },
    {
      label: active ? '停止识别' : '开始识别',
      click: () => sendToRenderer('shortcut:toggle-session')
    },
    { type: 'separator' },
    {
      label: clickThrough ? '关闭点击穿透' : '开启点击穿透',
      accelerator: 'CommandOrControl+Shift+L',
      click: () => setClickThrough(!clickThrough)
    },
    {
      label: '生成会议纪要',
      click: () => {
        showWindow();
        sendToRenderer('shortcut:minutes');
      }
    },
    {
      label: '打开设置',
      click: () => {
        showWindow();
        sendToRenderer('ui:open-settings');
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  refreshTrayMenu();
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function registerShortcuts() {
  const toggle = globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showWindow();
  });
  const through = globalShortcut.register('CommandOrControl+Shift+L', () => setClickThrough(!clickThrough));
  const sessionShortcut = globalShortcut.register('CommandOrControl+Shift+S', () => {
    showWindow();
    sendToRenderer('shortcut:toggle-session');
  });
  const minutesShortcut = globalShortcut.register('CommandOrControl+Shift+M', () => {
    showWindow();
    sendToRenderer('shortcut:minutes');
  });
  logger.info('Global shortcuts', { toggle, through, sessionShortcut, minutesShortcut });
}

function setClickThrough(value) {
  clickThrough = Boolean(value);
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
    sendToRenderer('window:click-through', clickThrough);
  }
  refreshTrayMenu();
  if (clickThrough) {
    sendToRenderer('toast', {
      type: 'info',
      message: '点击穿透已开启 · 按 ⌘⇧L 或使用菜单栏图标恢复鼠标操作'
    });
  }
}

function getPermissionStatus() {
  const mic = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted';
  // ScreenCaptureKit runs in FloatLingo Audio with its own TCC identity;
  // the Electron app's screen status is not the helper's status.
  const screenStatus = process.platform === 'darwin' ? 'helper' : 'granted';
  return {
    microphone: mic,
    screen: screenStatus,
    platform: process.platform,
    systemAudioSupported: process.platform === 'darwin'
  };
}

function openPermissionPane(kind) {
  if (process.platform !== 'darwin') return;
  const pane =
    kind === 'microphone'
      ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
  shell.openExternal(pane);
}

function makePipeline() {
  const settings = settingsStore.getSettings();
  if (simulateAudio) settings.systemEnabled = false;
  const keys = {
    openai: settingsStore.getKey('openai'),
    deepseek: settingsStore.getKey('deepseek')
  };
  const instance = new CaptionPipeline({ settings, keys, logger });
  instance.on('caption', (caption) => {
    if (pipeline === instance) sendToRenderer('caption', caption);
  });
  instance.on('caption-remove', (payload) => {
    if (pipeline === instance) sendToRenderer('caption-remove', payload);
  });
  instance.on('levels', (levels) => {
    if (pipeline === instance) sendToRenderer('levels', levels);
  });
  instance.on('session', (state) => {
    if (pipeline === instance) {
      sendToRenderer('session', state);
      refreshTrayMenu();
    }
  });
  instance.on('toast', (payload) => {
    if (pipeline === instance) sendToRenderer('toast', payload);
  });
  instance.on('history-cleared', () => {
    if (pipeline === instance) sendToRenderer('history-cleared');
  });
  return instance;
}

async function startSession() {
  if (pipeline?.active) return { ok: true, state: pipeline.state() };
  stopSession({ silent: true });
  pipeline = makePipeline();
  try {
    pipeline.start();
  } catch (error) {
    pipeline = null;
    return { ok: false, error: error.message, code: error.code };
  }
  historyPipeline = null;
  sendToRenderer('history-cleared');

  const settings = settingsStore.getSettings();
  if (settings.systemEnabled && !simulateAudio) {
    systemCapture = new SystemAudioCapture(logger);
    try {
      await systemCapture.start({
        onChunk: (buffer) => {
          if (pipeline) pipeline.pushAudio('system', buffer);
        },
        onError: (error) => {
          logger.error('System audio capture error', error);
          if (pipeline) pipeline.setChannelError('system', error.message);
          sendToRenderer('toast', {
            type: 'error',
            message: error.message,
            action: 'open-screen-permission'
          });
        },
        onLog: (line) => logger.debug('helper', line)
      });
    } catch (error) {
      logger.error('System audio start failed', error);
      pipeline.setChannelError('system', error.message);
      sendToRenderer('toast', {
        type: 'error',
        message: error.message,
        action: 'open-screen-permission'
      });
    }
  }

  sendToRenderer('session', pipeline.state());
  refreshTrayMenu();
  return { ok: true, state: pipeline.state() };
}

function startSimulatedAudio() {
  if (simulationTimer) clearInterval(simulationTimer);
  let index = 0;
  let phase = 0;
  const chunkFrames = 2400;
  simulationTimer = setInterval(() => {
    if (!pipeline?.active) {
      clearInterval(simulationTimer);
      simulationTimer = null;
      return;
    }
    const speaking = phase < 16;
    const buffer = Buffer.alloc(chunkFrames * 2);
    for (let i = 0; i < chunkFrames; i += 1) {
      const t = (index * chunkFrames + i) / 24_000;
      const envelope = speaking ? 0.13 * Math.min(1, i / 400, (chunkFrames - i) / 400) : 0;
      const sample = Math.sin(2 * Math.PI * 210 * t) * envelope + (Math.random() - 0.5) * 0.0015;
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), i * 2);
    }
    pipeline.pushAudio('mic', buffer);
    index += 1;
    phase += 1;
    if (phase >= 24) phase = 0;
  }, 100);
  logger.info('Simulated audio started');
}

function stopSession({ silent = false } = {}) {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  if (systemCapture) {
    systemCapture.stop();
    systemCapture = null;
  }
  if (pipeline) {
    historyPipeline = pipeline;
    pipeline.stop();
    pipeline = null;
  }
  if (!silent) {
    sendToRenderer('session', {
      active: false,
      status: 'idle',
      startedAt: 0,
      mode: settingsStore.getSettings().sttMode,
      model: settingsStore.getSettings().sttModel,
      translationProvider: settingsStore.getSettings().translationProvider,
      targetLanguage: 'ko',
      captionCount: 0,
      latencyMs: null,
      recognitionLatencyMs: null,
      channels: {}
    });
  }
  refreshTrayMenu();
}

ipcMain.handle('app:get-config', () => {
  return settingsStore.getPublicSettings();
});

ipcMain.handle('settings:save', (event, patch) => {
  const current = settingsStore.getSettings();
  const allowed = {};
  const keys = [
    'sourceProfile',
    'sttMode',
    'sttModel',
    'sttDelay',
    'sttPrompt',
    'keywords',
    'httpModel',
    'translationProvider',
    'deepseekModel',
    'openaiTranslationModel',
    'deepseekBaseUrl',
    'openaiBaseUrl',
    'micEnabled',
    'systemEnabled',
    'vadSensitivity',
    'silenceMs',
    'maxSegmentSec',
    'partialTranslateMs',
    'fontScale',
    'opacity',
    'alwaysOnTop',
    'showOriginal',
    'glossary'
  ];
  for (const key of keys) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  const saved = settingsStore.saveSettings(allowed);
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(saved.alwaysOnTop), 'floating');
    mainWindow.setOpacity(saved.opacity);
  }
  return { ok: true, settings: settingsStore.getPublicSettings(), restartRequired: Boolean(pipeline?.active) };
});

ipcMain.handle('keys:set', (event, payload) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'openai')) {
    settingsStore.setKey('openai', payload.openai);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'deepseek')) {
    settingsStore.setKey('deepseek', payload.deepseek);
  }
  return { ok: true, ...settingsStore.getKeyStatus(), restartRequired: Boolean(pipeline?.active) };
});

ipcMain.handle('session:start', async () => startSession());
ipcMain.handle('session:stop', () => {
  stopSession();
  return { ok: true };
});

ipcMain.handle('session:retry-translation', (event, captionId) => {
  if (!pipeline) return { ok: false, error: '会话未开始' };
  return { ok: pipeline.retryTranslation(String(captionId || '')) };
});

ipcMain.handle('audio:mic-error', (event, message) => {
  if (pipeline) pipeline.setChannelError('mic', String(message || '麦克风不可用'));
  return { ok: true };
});

ipcMain.handle('permissions:get', () => getPermissionStatus());
ipcMain.handle('permissions:open', (event, kind) => {
  openPermissionPane(kind);
  return { ok: true };
});
ipcMain.handle('permissions:reveal-helper', () => {
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'SystemAudioCapture.app')
    : path.join(app.getAppPath(), 'dist', 'SystemAudioCapture.app');
  if (!fs.existsSync(helper)) return { ok: false, error: '系统音频组件尚未构建' };
  shell.showItemInFolder(helper);
  return { ok: true, path: helper };
});
ipcMain.handle('permissions:ask-mic', async () => {
  if (process.platform !== 'darwin') return { granted: true };
  try {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return { granted };
  } catch (error) {
    return { granted: false, error: error.message };
  }
});

ipcMain.handle('minutes:generate', async () => {
  if (minutesRun) return { ok: false, error: '会议纪要正在生成中，请稍候。' };
  if (pipeline?.active) {
    return { ok: false, error: '请先停止识别，再生成会议纪要。' };
  }
  const source = historyPipeline;
  if (!source) return { ok: false, error: '还没有可生成纪要的逐字记录。' };
  const data = source.getMinutesData();
  if (!data.segments.length) {
    return { ok: false, error: '还没有可生成纪要的逐字记录。' };
  }

  const settings = settingsStore.getSettings();
  const provider = settings.translationProvider === 'openai' ? 'openai' : 'deepseek';
  const apiKey = settingsStore.getKey(provider);
  const baseUrl = provider === 'openai' ? settings.openaiBaseUrl : settings.deepseekBaseUrl;
  const model = provider === 'openai' ? settings.openaiTranslationModel : settings.deepseekModel;

  try {
    minutesRun = generateMinutes({
      data,
      provider,
      apiKey,
      baseUrl,
      model,
      logger,
      onProgress: (progress) => sendToRenderer('minutes:progress', progress)
    });
    const result = await minutesRun;
    return { ok: true, ...result };
  } catch (error) {
    logger.warn('Minutes generation failed', error);
    return {
      ok: false,
      error: error.message,
      code: error.code,
      transcript: buildTranscriptText(data.segments),
      meta: data.meta
    };
  } finally {
    minutesRun = null;
  }
});

ipcMain.handle('minutes:export', async (event, payload) => {
  const content = String(payload?.content || '');
  if (!content.trim()) return { ok: false, error: '没有可导出的内容' };
  const format = payload?.format === 'txt' ? 'txt' : 'md';
  const defaultName =
    typeof payload?.defaultName === 'string' && payload.defaultName.trim()
      ? payload.defaultName.trim()
      : `FloatLingo-会议纪要-${timestampForFile()}.${format}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出会议纪要',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters:
      format === 'md'
        ? [{ name: 'Markdown', extensions: ['md'] }]
        : [{ name: '文本文件', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, `${content.trim()}
`, 'utf8');
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('history:export', async () => {
  const source = pipeline || historyPipeline;
  if (!source) return { ok: false, error: '还没有可导出的内容' };
  const text = source.getTranscriptText();
  if (!text) return { ok: false, error: '还没有可导出的内容' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出双语记录',
    defaultPath: path.join(app.getPath('documents'), `FloatLingo-${timestampForFile()}.txt`),
    filters: [{ name: '文本文件', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, `${text}\n`, 'utf8');
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('history:clear', () => {
  if (pipeline) pipeline.clearHistory();
  if (historyPipeline && historyPipeline !== pipeline) historyPipeline.clearHistory();
  historyPipeline = null;
  sendToRenderer('history-cleared');
  return { ok: true };
});

ipcMain.handle('clipboard:write', (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('window:set-ignore-mouse', (event, value) => {
  setClickThrough(Boolean(value));
  return { clickThrough };
});

ipcMain.handle('window:set-opacity', (event, value) => {
  const opacity = Math.min(1, Math.max(0.5, Number(value) || 0.96));
  mainWindow?.setOpacity(opacity);
  settingsStore.saveSettings({ opacity });
  return { opacity };
});

ipcMain.handle('window:set-always-on-top', (event, value) => {
  const alwaysOnTop = Boolean(value);
  mainWindow?.setAlwaysOnTop(alwaysOnTop, 'floating');
  settingsStore.saveSettings({ alwaysOnTop });
  return { alwaysOnTop };
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
  return { ok: true };
});
ipcMain.handle('window:hide', () => {
  mainWindow?.hide();
  return { ok: true };
});
ipcMain.handle('window:show', () => {
  showWindow();
  return { ok: true };
});
ipcMain.handle('app:open-log', () => {
  const log = logger.logPath();
  if (log) shell.showItemInFolder(log);
  return { ok: Boolean(log) };
});
ipcMain.handle('app:quit', () => {
  quitting = true;
  app.quit();
  return { ok: true };
});

ipcMain.on('audio:mic', (event, arrayBuffer) => {
  if (!pipeline || !arrayBuffer) return;
  try {
    pipeline.pushAudio('mic', Buffer.from(arrayBuffer));
  } catch (error) {
    logger.warn('Mic chunk rejected', error);
  }
});

ipcMain.on('renderer:ready', () => {
  sendToRenderer('app:flags', { demo: isDemo, dev: isDev, simulate: simulateAudio });
  if (pipeline) sendToRenderer('session', pipeline.state());
});

ipcMain.on('shortcut:toggle-session', () => {
  sendToRenderer('shortcut:toggle-session');
});

function timestampForFile() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', error);
});
