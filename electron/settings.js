'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const SOURCE_PROFILES = {
  auto: { label: '自动识别', languages: [] },
  'zh-en': { label: '中文 + 英文', languages: ['zh', 'en'] },
  zh: { label: '中文', languages: ['zh'] },
  en: { label: 'English', languages: ['en'] },
  ja: { label: '日本語', languages: ['ja'] },
  ko: { label: '한국어', languages: ['ko'] }
};

const DEFAULTS = {
  sourceProfile: 'zh-en',
  targetLanguage: 'ko',
  sttMode: 'realtime',
  sttModel: 'gpt-live-transcribe',
  sttDelay: 'low',
  httpModel: 'gpt-4o-transcribe',
  sttPrompt:
    'Live meeting and conversation audio. Transcribe speech verbatim with natural punctuation. The speakers may use Mandarin Chinese, English, Korean or Japanese. Ignore music, notifications and background noise.',
  keywords: '',
  translationProvider: 'deepseek',
  deepseekModel: 'deepseek-chat',
  openaiTranslationModel: 'gpt-4o-mini',
  deepseekBaseUrl: 'https://api.deepseek.com',
  openaiBaseUrl: 'https://api.openai.com/v1',
  micEnabled: true,
  systemEnabled: true,
  vadSensitivity: 0.55,
  silenceMs: 600,
  maxSegmentSec: 12,
  partialTranslateMs: 1400,
  fontScale: 1,
  opacity: 0.96,
  alwaysOnTop: true,
  showOriginal: true,
  glossary: '',
  bounds: null
};

let settingsPath = null;
let secretsPath = null;
let settings = { ...DEFAULTS };
let secrets = {};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function init() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  secretsPath = path.join(app.getPath('userData'), 'secrets.json');
  settings = { ...DEFAULTS, ...readJson(settingsPath, {}) };
  secrets = readJson(secretsPath, {});
  normalize();
  saveSettings();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalize() {
  if (!SOURCE_PROFILES[settings.sourceProfile]) settings.sourceProfile = DEFAULTS.sourceProfile;
  if (!['realtime', 'http'].includes(settings.sttMode)) settings.sttMode = 'realtime';
  if (!['deepseek', 'openai'].includes(settings.translationProvider)) {
    settings.translationProvider = 'deepseek';
  }
  if (!['minimal', 'low', 'medium', 'high'].includes(settings.sttDelay)) settings.sttDelay = 'low';
  settings.micEnabled = Boolean(settings.micEnabled);
  settings.systemEnabled = Boolean(settings.systemEnabled);
  settings.alwaysOnTop = Boolean(settings.alwaysOnTop);
  settings.showOriginal = Boolean(settings.showOriginal);
  settings.vadSensitivity = clamp(settings.vadSensitivity, 0, 1, DEFAULTS.vadSensitivity);
  settings.silenceMs = clamp(settings.silenceMs, 300, 1600, DEFAULTS.silenceMs);
  settings.maxSegmentSec = clamp(settings.maxSegmentSec, 4, 30, DEFAULTS.maxSegmentSec);
  settings.partialTranslateMs = clamp(settings.partialTranslateMs, 800, 5000, DEFAULTS.partialTranslateMs);
  settings.fontScale = clamp(settings.fontScale, 0.8, 1.5, DEFAULTS.fontScale);
  settings.opacity = clamp(settings.opacity, 0.5, 1, DEFAULTS.opacity);
  for (const key of [
    'sttModel',
    'httpModel',
    'deepseekModel',
    'openaiTranslationModel',
    'deepseekBaseUrl',
    'openaiBaseUrl'
  ]) {
    if (typeof settings[key] !== 'string' || !settings[key].trim()) settings[key] = DEFAULTS[key];
  }
  if (typeof settings.keywords !== 'string') settings.keywords = '';
  if (typeof settings.glossary !== 'string') settings.glossary = '';
  if (settings.bounds && typeof settings.bounds === 'object') {
    const b = settings.bounds;
    settings.bounds = {
      x: Number.isFinite(b.x) ? Math.round(b.x) : undefined,
      y: Number.isFinite(b.y) ? Math.round(b.y) : undefined,
      width: clamp(b.width, 420, 1400, 600),
      height: clamp(b.height, 260, 1000, 400)
    };
  } else {
    settings.bounds = null;
  }
}

function getSettings() {
  return { ...settings };
}

function getPublicSettings() {
  const keyStatus = getKeyStatus();
  return {
    ...settings,
    sourceProfiles: SOURCE_PROFILES,
    ...keyStatus
  };
}

function saveSettings(patch) {
  if (patch && typeof patch === 'object') {
    settings = { ...settings, ...patch };
    normalize();
  }
  if (settingsPath) writeJson(settingsPath, settings);
  return getSettings();
}

function updateBounds(bounds) {
  if (!bounds) return;
  settings.bounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
  if (settingsPath) writeJson(settingsPath, settings);
}

function encrypt(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(value).toString('base64'), scheme: 'safeStorage' };
  }
  return { value: Buffer.from(value, 'utf8').toString('base64'), scheme: 'base64' };
}

function decrypt(record) {
  if (!record || typeof record.value !== 'string') return '';
  try {
    if (record.scheme === 'safeStorage' && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(record.value, 'base64'));
    }
    return Buffer.from(record.value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function setKey(name, value) {
  if (!['openai', 'deepseek'].includes(name)) return;
  if (value === null || value === '') {
    delete secrets[name];
  } else if (typeof value === 'string') {
    secrets[name] = encrypt(value.trim());
  }
  if (secretsPath) writeJson(secretsPath, secrets);
}

function getKey(name) {
  const stored = decrypt(secrets[name]);
  if (stored) return stored;
  if (name === 'openai') return process.env.OPENAI_API_KEY || '';
  if (name === 'deepseek') return process.env.DEEPSEEK_API_KEY || '';
  return '';
}

function getKeyStatus() {
  return {
    hasOpenAIKey: Boolean(getKey('openai')),
    hasDeepSeekKey: Boolean(getKey('deepseek')),
    openaiKeySource: secrets.openai ? 'saved' : process.env.OPENAI_API_KEY ? 'env' : 'none',
    deepseekKeySource: secrets.deepseek ? 'saved' : process.env.DEEPSEEK_API_KEY ? 'env' : 'none',
    keyEncryption: secrets.openai?.scheme === 'safeStorage' || secrets.deepseek?.scheme === 'safeStorage'
      ? 'safeStorage'
      : 'base64'
  };
}

module.exports = {
  DEFAULTS,
  SOURCE_PROFILES,
  init,
  getSettings,
  getPublicSettings,
  saveSettings,
  updateBounds,
  setKey,
  getKey,
  getKeyStatus
};
