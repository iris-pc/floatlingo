'use strict';

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

const SAMPLE_RATE = 24_000;

function realtimeUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const pathname = url.pathname.replace(/\/+$/, '') || '/v1';
  url.pathname = `${pathname}/realtime`;
  url.search = 'intent=transcription';
  url.hash = '';
  return url.toString();
}

function cleanKeywords(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s && !/[<>\r\n]/.test(s))
    .slice(0, 80);
}

class RealtimeTranscriber extends EventEmitter {
  constructor(options) {
    super();
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.model = options.model || 'gpt-live-transcribe';
    this.languages = Array.isArray(options.languages) ? options.languages : [];
    this.prompt = (options.prompt || '').slice(0, 900);
    this.keywords = cleanKeywords(options.keywords);
    this.delay = options.delay || 'low';
    this.logger = options.logger;

    this.ws = null;
    this.ready = false;
    this.closedByUser = false;
    this.hasError = false;
    this.appendedBytes = 0;
    this.pending = [];
    this.pendingBytes = 0;
    this.sentUpdate = false;
    this.readyResolve = null;
    this.readyReject = null;
    this.readyTimer = null;
    this.updateTimer = null;
    this.connectionStartedAt = 0;
  }

  connect() {
    if (this.ws) return Promise.resolve();
    const endpoint = realtimeUrl(this.baseUrl);
    this.logger?.info('Connecting realtime transcription', { endpoint, model: this.model });
    this.connectionStartedAt = Date.now();

    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.readyTimer = setTimeout(() => {
        this._fail(Object.assign(new Error('连接 OpenAI 实时识别超时（10 秒）。'), { code: 'STT_TIMEOUT' }));
      }, 10_000);
      this.readyTimer.unref?.();

      let ws;
      try {
        ws = new WebSocket(endpoint, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`
          },
          handshakeTimeout: 10_000,
          perMessageDeflate: false
        });
      } catch (error) {
        this._fail(error);
        return;
      }
      this.ws = ws;

      ws.on('open', () => {
        this.logger?.info('Realtime WebSocket open');
        // Some compatible gateways do not send session.created. Send the
        // update after a short grace period if it has not happened yet.
        this.updateTimer = setTimeout(() => this._sendSessionUpdate(), 250);
        this.updateTimer.unref?.();
      });

      ws.on('message', (data) => {
        let event;
        try {
          event = JSON.parse(data.toString());
        } catch {
          return;
        }
        this._handleEvent(event);
      });

      ws.on('unexpected-response', (request, response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk.toString();
        });
        response.on('end', () => {
          const detail = this._httpError(body, response.statusCode);
          this._fail(
            Object.assign(new Error(`OpenAI 实时识别连接失败（HTTP ${response.statusCode}）：${detail}`), {
              code: 'STT_HTTP',
              statusCode: response.statusCode
            })
          );
        });
      });

      ws.on('error', (error) => {
        this.logger?.error('Realtime WebSocket error', error);
        this._fail(Object.assign(new Error(`实时识别连接错误：${error.message}`), { code: 'STT_SOCKET' }));
      });

      ws.on('close', (code, reason) => {
        const wasReady = this.ready;
        this.ready = false;
        if (this.ws === ws) this.ws = null;
        if (this.closedByUser || this.hasError) return;
        const text = reason?.toString() || '';
        if (!wasReady) {
          this._fail(
            Object.assign(new Error(`实时识别连接在就绪前关闭${code ? `（${code}）` : ''}${text ? `：${text}` : ''}`), {
              code: 'STT_CLOSED'
            })
          );
          return;
        }
        this.emit('closed', { code, reason: text });
      });
    });
  }

  _httpError(body, statusCode) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) return parsed.error.message;
    } catch {
      // fall through
    }
    if (statusCode === 401) return 'API Key 无效或没有权限';
    if (statusCode === 404) return '模型或接口不存在';
    return body.slice(0, 300) || '未知错误';
  }

  _sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.sentUpdate) return;
    this.sentUpdate = true;
    const transcription = {
      model: this.model,
      delay: this.delay
    };
    if (this.languages.length) transcription.languages = this.languages;
    if (this.prompt) transcription.prompt = this.prompt;
    if (this.keywords.length) transcription.keywords = this.keywords;

    const payload = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            transcription,
            turn_detection: null
          }
        }
      }
    };
    this._send(payload);
    this.logger?.info('Realtime session.update sent', {
      model: this.model,
      languages: this.languages,
      delay: this.delay
    });
  }

  _handleEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    switch (event.type) {
      case 'session.created': {
        this._sendSessionUpdate();
        break;
      }
      case 'session.updated': {
        if (this.updateTimer) clearTimeout(this.updateTimer);
        this.updateTimer = null;
        this.ready = true;
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = null;
        this.logger?.info('Realtime transcription session ready');
        this._flushPending();
        this.readyResolve?.();
        this.readyResolve = null;
        this.readyReject = null;
        this.emit('ready', event.session);
        break;
      }
      case 'conversation.item.input_audio_transcription.delta': {
        this.emit('delta', {
          itemId: event.item_id || 'unknown',
          delta: event.delta || '',
          raw: event
        });
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        this.emit('completed', {
          itemId: event.item_id || 'unknown',
          transcript: event.transcript || '',
          languages: event.languages || [],
          usage: event.usage || null,
          raw: event
        });
        break;
      }
      case 'conversation.item.input_audio_transcription.failed': {
        const message = event.error?.message || '转写失败';
        this.emit('transcription-error', {
          itemId: event.item_id || 'unknown',
          message
        });
        break;
      }
      case 'input_audio_buffer.committed': {
        this.emit('committed', {
          itemId: event.item_id || event.previous_item_id || 'unknown',
          raw: event
        });
        break;
      }
      case 'input_audio_buffer.cleared': {
        this.emit('cleared');
        break;
      }
      case 'error': {
        const message = event.error?.message || 'OpenAI Realtime 返回错误';
        const code = event.error?.code || 'STT_EVENT';
        this.logger?.error('Realtime API error', { code, message });
        this.emit('api-error', { code, message, raw: event });
        if (!this.ready) {
          this._fail(Object.assign(new Error(message), { code }));
        }
        break;
      }
      default:
        break;
    }
  }

  _send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      this.logger?.error('Realtime send failed', error);
      return false;
    }
  }

  sendAudio(buffer) {
    if (!buffer || !buffer.length) return;
    if (!this.ready) {
      this.pending.push(Buffer.from(buffer));
      this.pendingBytes += buffer.length;
      while (this.pendingBytes > SAMPLE_RATE * 2 * 10 || this.pending.length > 120) {
        const dropped = this.pending.shift();
        this.pendingBytes -= dropped.length;
      }
      return;
    }
    this._append(buffer);
  }

  _append(buffer) {
    const ok = this._send({
      type: 'input_audio_buffer.append',
      audio: buffer.toString('base64')
    });
    if (ok) this.appendedBytes += buffer.length;
  }

  _flushPending() {
    if (!this.ready) return;
    const pending = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    for (const chunk of pending) this._append(chunk);
  }

  commit() {
    if (!this.ready || this.appendedBytes <= 0) return false;
    const ok = this._send({ type: 'input_audio_buffer.commit' });
    if (ok) this.appendedBytes = 0;
    return ok;
  }

  clear() {
    this.appendedBytes = 0;
    if (!this.ready) {
      this.pending = [];
      this.pendingBytes = 0;
      return true;
    }
    return this._send({ type: 'input_audio_buffer.clear' });
  }

  _fail(error) {
    if (this.hasError) return;
    this.hasError = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.readyTimer = null;
    this.updateTimer = null;
    this.readyReject?.(error);
    this.readyReject = null;
    this.readyResolve = null;
    this.emit('fatal', error);
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }

  close() {
    this.closedByUser = true;
    this.ready = false;
    this.pending = [];
    this.pendingBytes = 0;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.readyTimer = null;
    this.updateTimer = null;
    try {
      this.ws?.close(1000, 'client stop');
    } catch {
      // ignore
    }
    this.ws = null;
  }
}

module.exports = { RealtimeTranscriber, realtimeUrl };
