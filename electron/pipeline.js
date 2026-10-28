'use strict';

const { EventEmitter } = require('node:events');
const { EnergyVad } = require('./audio/vad');
const { RealtimeTranscriber } = require('./stt/realtime');
const { HttpTranscriber } = require('./stt/http');
const { Translator } = require('./translate');
const { SOURCE_PROFILES } = require('./settings');

const CHANNEL_LABELS = {
  mic: '现场',
  system: '设备'
};

const HALLUCINATION_PATTERNS = [
  /^请不吝点赞.*$/u,
  /^字幕由.{0,20}(提供|制作).*$/u,
  /^谢谢(大家)?观看.*$/u,
  /^thank you for watching.*$/i,
  /^subtitles? by.*$/i,
  /^ご視聴(ありがとう|いただき).*$/u,
  /^시청해\s*주셔서\s*감사.*$/u,
  /^\[?(音乐|掌声|笑声|music|applause|laughter)\]?$/iu,
  /^\.+$/
];

function isHallucination(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (value.length > 80) return false;
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(value));
}

function cloneCaption(caption) {
  return {
    id: caption.id,
    itemId: caption.itemId,
    channel: caption.channel,
    source: caption.source,
    original: caption.original,
    translation: caption.translation,
    status: caption.status,
    error: caption.error || '',
    final: caption.finalized,
    latencyMs: caption.latencyMs,
    recognitionLatencyMs: caption.recognitionLatencyMs,
    speechStartedAt: caption.speechStartedAt,
    createdAt: caption.createdAt,
    updatedAt: caption.updatedAt
  };
}

class CaptionPipeline extends EventEmitter {
  constructor({ settings, keys, logger }) {
    super();
    this.settings = settings;
    this.keys = keys;
    this.logger = logger;
    this.active = false;
    this.startedAt = 0;
    this.stoppedAt = 0;
    this.channels = new Map();
    this.captions = new Map();
    this.captionOrder = [];
    this.recentContext = [];
    this.seq = 0;
    this.levelTimer = null;
    this.tickTimer = null;
    this.lastSessionSignature = '';
    this.lastLatencyMs = null;
    this.lastRecognitionMs = null;
    this.lastLevels = { mic: { levelDb: -90, speaking: false }, system: { levelDb: -90, speaking: false } };

    const profile = SOURCE_PROFILES[settings.sourceProfile] || SOURCE_PROFILES.auto;
    const translatorKey = settings.translationProvider === 'openai' ? keys.openai : keys.deepseek;
    const translatorBase =
      settings.translationProvider === 'openai' ? settings.openaiBaseUrl : settings.deepseekBaseUrl;
    const translatorModel =
      settings.translationProvider === 'openai' ? settings.openaiTranslationModel : settings.deepseekModel;

    this.translator = new Translator({
      provider: settings.translationProvider,
      apiKey: translatorKey,
      baseUrl: translatorBase,
      model: translatorModel,
      glossary: settings.glossary,
      targetLanguage: settings.targetLanguage,
      logger
    });

    this.languages = profile.languages;
  }

  start() {
    if (this.active) return this.state();
    if (!this.keys.openai) {
      throw Object.assign(new Error('请先填写 OpenAI API Key（用于语音识别）。'), {
        code: 'MISSING_OPENAI_KEY'
      });
    }
    const enabled = [];
    if (this.settings.micEnabled) enabled.push('mic');
    if (this.settings.systemEnabled) enabled.push('system');
    if (!enabled.length) {
      throw Object.assign(new Error('请至少开启“现场人声”或“设备声音”中的一路。'), {
        code: 'NO_AUDIO_SOURCE'
      });
    }

    this.active = true;
    this.startedAt = Date.now();
    this.stoppedAt = 0;
    this.channels.clear();
    for (const id of enabled) this.channels.set(id, this._createChannel(id));

    this.logger.info('Caption pipeline starting', {
      channels: enabled,
      sttMode: this.settings.sttMode,
      sttModel: this.settings.sttModel,
      translationProvider: this.settings.translationProvider
    });

    this._emitSession();
    for (const channel of this.channels.values()) this._connectChannel(channel);

    this.levelTimer = setInterval(() => this._emitLevels(), 120);
    this.tickTimer = setInterval(() => {
      for (const channel of this.channels.values()) {
        try {
          channel.vad.tick();
        } catch (error) {
          this.logger.warn('VAD tick failed', error);
        }
      }
    }, 100);
    return this.state();
  }

  _createChannel(id) {
    const channel = {
      id,
      label: CHANNEL_LABELS[id],
      status: 'connecting',
      error: '',
      mode: this.settings.sttMode,
      transcriber: null,
      vad: null,
      currentMeta: null,
      metaQueue: [],
      pendingCommit: null,
      segments: new Map(),
      httpBuffer: Buffer.alloc(0),
      httpQueue: Promise.resolve(),
      levelDb: -90,
      speaking: false
    };

    const common = {
      apiKey: this.keys.openai,
      baseUrl: this.settings.openaiBaseUrl,
      languages: this.languages,
      prompt: this.settings.sttPrompt,
      logger: this.logger
    };

    if (channel.mode === 'http') {
      channel.transcriber = new HttpTranscriber({
        ...common,
        httpModel: this.settings.httpModel || 'gpt-4o-transcribe'
      });
      channel.transcriber.on('completed', (event) => {
        if (!this.active) return;
        const caption = this._ensureCaption(channel, event.itemId, event.meta);
        this._finishTranscript(channel, caption, event.transcript);
      });
    } else {
      channel.transcriber = new RealtimeTranscriber({
        ...common,
        model: this.settings.sttModel,
        delay: this.settings.sttDelay,
        keywords: this.settings.keywords
      });
      channel.transcriber.on('delta', (event) => this._handleDelta(channel, event));
      channel.transcriber.on('completed', (event) => {
        if (!this.active) return;
        const caption = this._ensureCaption(channel, event.itemId);
        this._finishTranscript(channel, caption, event.transcript);
      });
      channel.transcriber.on('ready', () => {
        if (!this.active) return;
        channel.status = 'ready';
        channel.error = '';
        this._emitSession();
        if (channel.pendingCommit) {
          const meta = channel.pendingCommit;
          channel.pendingCommit = null;
          if (channel.transcriber.commit()) channel.metaQueue.push(meta);
        }
      });
      channel.transcriber.on('api-error', (event) => {
        this.logger.warn('STT API error', event);
        this.emit('toast', { type: 'warn', message: event.message });
      });
      channel.transcriber.on('fatal', (error) => {
        channel.status = 'error';
        channel.error = error.message;
        this.emit('toast', { type: 'error', message: error.message });
        this._emitSession();
      });
      channel.transcriber.on('closed', ({ code, reason }) => {
        if (!this.active) return;
        channel.status = 'error';
        channel.error = `实时识别连接已断开${code ? `（${code}）` : ''}${reason ? `：${reason}` : ''}`;
        this.emit('toast', { type: 'error', message: channel.error });
        this._emitSession();
      });
    }

    channel.vad = new EnergyVad({
      sensitivity: this.settings.vadSensitivity,
      silenceMs: this.settings.silenceMs,
      maxSegmentMs: this.settings.maxSegmentSec * 1000,
      minSpeechMs: 320,
      onSpeechStart: (meta) => {
        channel.currentMeta = { startedAt: meta.startedAt || Date.now(), continued: Boolean(meta.continued) };
        if (channel.mode === 'http') channel.httpBuffer = Buffer.alloc(0);
        this._emitSession();
      },
      onCommit: (meta) => this._handleVadCommit(channel, meta),
      onDiscard: () => {
        channel.currentMeta = null;
        if (channel.mode === 'http') channel.httpBuffer = Buffer.alloc(0);
        if (channel.mode === 'realtime') channel.transcriber.clear();
      },
      onLevel: (levelDb, speaking) => {
        channel.levelDb = levelDb;
        channel.speaking = speaking;
      }
    });

    return channel;
  }

  _connectChannel(channel) {
    if (channel.mode === 'http') {
      channel.status = 'ready';
      this._emitSession();
      return;
    }
    let connection;
    try {
      connection = channel.transcriber.connect();
    } catch (error) {
      channel.status = 'error';
      channel.error = error.message;
      this.emit('toast', { type: 'error', message: error.message });
      this._emitSession();
      return;
    }
    connection
      .then(() => {
        if (!this.active) {
          channel.transcriber.close();
          return;
        }
        channel.status = 'ready';
        channel.error = '';
        this._emitSession();
      })
      .catch((error) => {
        if (!this.active) return;
        channel.status = 'error';
        channel.error = error.message;
        this.logger.error('STT channel failed', error);
        this.emit('toast', { type: 'error', message: error.message });
        this._emitSession();
      });
  }

  _handleVadCommit(channel, meta) {
    if (!this.active) return;
    if (channel.mode === 'http') {
      const pcm = channel.httpBuffer;
      channel.httpBuffer = Buffer.alloc(0);
      channel.currentMeta = null;
      if (pcm.length >= 4_800) {
        channel.httpQueue = channel.httpQueue
          .then(() => {
            if (!this.active) return null;
            return channel.transcriber.transcribe(pcm, meta);
          })
          .catch((error) => {
            if (!this.active) return null;
            this.logger.warn('HTTP transcription failed', error);
            this.emit('toast', { type: 'error', message: error.message });
            return null;
          });
      }
      return;
    }

    if (channel.status !== 'ready') {
      channel.pendingCommit = meta;
      channel.currentMeta = null;
      return;
    }
    const ok = channel.transcriber.commit();
    if (ok) {
      channel.metaQueue.push(meta);
    }
    channel.currentMeta = null;
    this._emitSession();
  }

  pushAudio(channelId, buffer) {
    if (!this.active || !buffer || !buffer.length) return;
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const pcm = buffer.length % 2 === 0 ? buffer : buffer.subarray(0, buffer.length - 1);
    if (!pcm.length) return;

    // Realtime audio is appended before VAD processing so a commit triggered
    // by this chunk includes the chunk itself.
    if (channel.mode === 'realtime') channel.transcriber.sendAudio(pcm);
    channel.vad.push(pcm);
    if (channel.mode === 'http') {
      if (channel.vad.speaking || channel.currentMeta) {
        channel.httpBuffer = Buffer.concat([channel.httpBuffer, pcm]);
        if (channel.httpBuffer.length > 24_000 * 2 * 30) {
          channel.httpBuffer = channel.httpBuffer.subarray(channel.httpBuffer.length - 24_000 * 2 * 30);
        }
      }
    }
  }

  _ensureCaption(channel, itemId, metaOverride) {
    const key = `${channel.id}:${itemId}`;
    const existing = channel.segments.get(key);
    if (existing) return existing;

    const meta = metaOverride || channel.metaQueue.shift() || channel.currentMeta || {};
    const now = Date.now();
    const caption = {
      id: `${channel.id}-${now.toString(36)}-${++this.seq}`,
      itemId,
      channel: channel.id,
      source: channel.label,
      original: '',
      translation: '',
      status: 'live',
      error: '',
      finalized: false,
      translationFinal: false,
      latencyMs: null,
      recognitionLatencyMs: null,
      speechStartedAt: Math.min(now, Math.max(now - 120_000, meta.startedAt || now)),
      createdAt: now,
      updatedAt: now,
      lastPartialAt: 0,
      translationTask: null
    };
    channel.segments.set(key, caption);
    this.captions.set(caption.id, caption);
    this.captionOrder.push(caption.id);
    this._trimCaptions();
    this._emitCaption(caption);
    return caption;
  }

  _handleDelta(channel, event) {
    if (!this.active || !event.delta) return;
    const caption = this._ensureCaption(channel, event.itemId);
    if (caption.finalized) return;
    const delta = String(event.delta).replace(/\u0000/g, '');
    if (!delta) return;

    if (caption.original && delta.startsWith(caption.original)) {
      caption.original = delta;
    } else {
      caption.original += delta;
    }
    caption.original = caption.original.replace(/[ \t]+\n/g, '\n');
    caption.updatedAt = Date.now();
    if (caption.recognitionLatencyMs == null && caption.original.trim()) {
      caption.recognitionLatencyMs = Math.max(0, Date.now() - caption.speechStartedAt);
      this.lastRecognitionMs = caption.recognitionLatencyMs;
    }
    if (!caption.original.trim()) return;
    caption.status = 'live';
    this._emitCaption(caption);
    this._maybeTranslatePartial(caption);
  }

  _finishTranscript(channel, caption, transcript) {
    const text = String(transcript || caption.original || '').trim();
    if (!text || isHallucination(text)) {
      this._removeCaption(caption);
      return;
    }
    caption.original = text;
    caption.finalized = true;
    if (caption.recognitionLatencyMs == null) {
      caption.recognitionLatencyMs = Math.max(0, Date.now() - caption.speechStartedAt);
      this.lastRecognitionMs = caption.recognitionLatencyMs;
    }
    caption.status = 'translating';
    caption.error = '';
    caption.updatedAt = Date.now();
    this._emitCaption(caption);
    this._translate(caption, true);
  }

  _maybeTranslatePartial(caption) {
    if (!this.active || caption.finalized) return;
    const text = caption.original.trim();
    if (text.length < 2) return;
    if (caption.translationTask) return;
    const now = Date.now();
    if (now - caption.lastPartialAt < this.settings.partialTranslateMs) return;
    caption.lastPartialAt = now;
    this._translate(caption, false);
  }

  _translate(caption, isFinal) {
    if (!this.active) return;
    if (isFinal && caption.translationFinal) return;
    const existing = caption.translationTask;
    if (existing) {
      if (existing.isFinal && !isFinal) return;
      try {
        existing.controller.abort();
      } catch {
        // ignore
      }
    }

    const controller = new AbortController();
    const task = { controller, isFinal };
    caption.translationTask = task;
    const text = caption.original.trim();
    if (!text) {
      caption.translationTask = null;
      return;
    }

    let draft = '';
    let firstTokenAt = null;
    const wasFinal = caption.translationFinal;

    if (isFinal) {
      caption.status = 'translating';
      caption.error = '';
      this._emitCaption(caption);
    }

    this.translator
      .stream({
        text,
        context: this.recentContext,
        isFinal,
        signal: controller.signal,
        onDelta: (piece) => {
          if (!this.active || caption.translationTask !== task) return;
          draft += piece;
          if (firstTokenAt === null) {
            firstTokenAt = Date.now();
            caption.latencyMs = firstTokenAt - caption.speechStartedAt;
            this.lastLatencyMs = caption.latencyMs;
          }
          caption.translation = draft;
          caption.status = isFinal ? 'translating' : 'live';
          caption.updatedAt = Date.now();
          this._emitCaption(caption);
        }
      })
      .then((result) => {
        if (caption.translationTask !== task) return;
        if (!this.active) return;
        const finalText = String(result.text || '').trim();
        if (!finalText) throw new Error('翻译结果为空');
        caption.translationTask = null;
        caption.translation = finalText;
        caption.error = '';
        caption.updatedAt = Date.now();
        if (isFinal) {
          caption.status = 'done';
          caption.translationFinal = true;
          caption.finalized = true;
          if (!wasFinal) {
            this.recentContext.push({ original: caption.original, translation: finalText });
            if (this.recentContext.length > 10) this.recentContext.splice(0, this.recentContext.length - 10);
          }
        } else {
          caption.status = 'live';
        }
        this.lastLatencyMs = caption.latencyMs ?? this.lastLatencyMs;
        this._emitCaption(caption);
        this._emitSession();
      })
      .catch((error) => {
        if (caption.translationTask !== task) return;
        caption.translationTask = null;
        if (!this.active) return;
        if (error.code === 'ABORTED' || error.name === 'AbortError') return;
        this.logger.warn('Translation failed', error);
        caption.error = error.message;
        if (isFinal) {
          caption.status = 'error';
        } else {
          caption.status = 'live';
        }
        this._emitCaption(caption);
        this.emit('toast', {
          type: 'error',
          message: isFinal ? `翻译失败：${error.message}` : `实时翻译暂时失败：${error.message}`
        });
      });
  }

  setChannelError(channelId, message) {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    channel.status = 'error';
    channel.error = String(message || '音频不可用');
    try {
      channel.transcriber.close();
    } catch {
      // ignore
    }
    channel.vad.reset();
    this._emitSession();
  }

  retryTranslation(captionId) {
    const caption = this.captions.get(captionId);
    if (!caption || !caption.finalized) return false;
    caption.error = '';
    caption.translationFinal = false;
    this._translate(caption, true);
    return true;
  }

  _trimCaptions() {
    while (this.captionOrder.length > 5000) {
      const oldest = this.captionOrder.shift();
      const caption = this.captions.get(oldest);
      if (caption) this._removeCaption(caption, false);
    }
  }

  _removeCaption(caption, emit = true) {
    try {
      caption.translationTask?.controller.abort();
    } catch {
      // ignore
    }
    caption.translationTask = null;
    this.captions.delete(caption.id);
    const channel = this.channels.get(caption.channel);
    if (channel) {
      for (const [key, value] of channel.segments.entries()) {
        if (value === caption) channel.segments.delete(key);
      }
    }
    const index = this.captionOrder.indexOf(caption.id);
    if (index !== -1) this.captionOrder.splice(index, 1);
    if (emit) this.emit('caption-remove', { id: caption.id });
  }

  _emitCaption(caption) {
    this.emit('caption', cloneCaption(caption));
  }

  _emitLevels() {
    if (!this.active) return;
    const levels = {};
    for (const id of ['mic', 'system']) {
      const channel = this.channels.get(id);
      levels[id] = channel
        ? { levelDb: channel.levelDb, speaking: channel.speaking }
        : { levelDb: -90, speaking: false };
    }
    this.lastLevels = levels;
    this.emit('levels', levels);
  }

  _sessionStatus() {
    if (!this.active) return 'idle';
    const channels = [...this.channels.values()];
    if (!channels.length) return 'error';
    if (channels.some((c) => c.status === 'ready')) {
      return channels.some((c) => c.status === 'error') ? 'degraded' : 'listening';
    }
    if (channels.every((c) => c.status === 'error')) return 'error';
    return 'connecting';
  }

  _emitSession() {
    const status = this._sessionStatus();
    const channels = {};
    for (const id of ['mic', 'system']) {
      const channel = this.channels.get(id);
      channels[id] = channel
        ? {
            enabled: true,
            label: channel.label,
            status: channel.status,
            error: channel.error,
            speaking: channel.speaking,
            levelDb: channel.levelDb
          }
        : { enabled: false, label: CHANNEL_LABELS[id], status: 'off', error: '', speaking: false, levelDb: -90 };
    }
    const state = this.state(status);
    state.channels = channels;
    const signature = JSON.stringify(state);
    if (signature === this.lastSessionSignature) return;
    this.lastSessionSignature = signature;
    this.emit('session', state);
  }

  state(status) {
    return {
      active: this.active,
      status: status || this._sessionStatus(),
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      mode: this.settings.sttMode,
      model: this.settings.sttModel,
      translationProvider: this.settings.translationProvider,
      targetLanguage: 'ko',
      captionCount: this.captions.size,
      latencyMs: this.lastLatencyMs,
      recognitionLatencyMs: this.lastRecognitionMs,
      channels: {}
    };
  }

  getMinutesData() {
    const segments = [];
    let index = 0;
    for (const id of this.captionOrder) {
      const caption = this.captions.get(id);
      if (!caption || !caption.original.trim()) continue;
      index += 1;
      segments.push({
        index,
        id: caption.id,
        time: new Date(caption.createdAt).toLocaleTimeString('zh-CN', { hour12: false }),
        source: caption.source,
        channel: caption.channel,
        original: caption.original,
        translation: caption.translation || '',
        createdAt: caption.createdAt
      });
    }
    const endedAt = this.stoppedAt || Date.now();
    const firstAt = segments[0]?.createdAt || this.startedAt || endedAt;
    return {
      meta: {
        startedAt: this.startedAt || firstAt,
        endedAt,
        durationMs: Math.max(0, endedAt - (this.startedAt || firstAt)),
        segmentCount: segments.length,
        sources: [...new Set(segments.map((segment) => segment.source))],
        provider: this.settings.translationProvider,
        sttModel: this.settings.sttModel,
        targetLanguage: 'ko'
      },
      segments
    };
  }

  getTranscriptText() {
    const lines = [];
    for (const id of this.captionOrder) {
      const caption = this.captions.get(id);
      if (!caption) continue;
      const time = new Date(caption.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
      lines.push(`[${time}] [${caption.source}] ${caption.original}`);
      if (caption.translation) lines.push(`    ${caption.translation}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  clearHistory() {
    for (const caption of this.captions.values()) {
      try {
        caption.translationTask?.controller.abort();
      } catch {
        // ignore
      }
      caption.translationTask = null;
    }
    this.captions.clear();
    this.captionOrder = [];
    this.recentContext = [];
    for (const channel of this.channels.values()) channel.segments.clear();
    this.emit('history-cleared');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.levelTimer) clearInterval(this.levelTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.levelTimer = null;
    this.tickTimer = null;
    for (const caption of this.captions.values()) {
      try {
        caption.translationTask?.controller.abort();
      } catch {
        // ignore
      }
      caption.translationTask = null;
    }
    for (const channel of this.channels.values()) {
      try {
        channel.transcriber.close();
      } catch {
        // ignore
      }
      channel.status = 'off';
    }
    this.stoppedAt = Date.now();
    this.channels.clear();
    this._emitSession();
    this.logger.info('Caption pipeline stopped');
  }
}

module.exports = { CaptionPipeline, isHallucination };
