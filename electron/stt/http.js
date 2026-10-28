'use strict';

const { EventEmitter } = require('node:events');
const { encodeWav } = require('../audio/wav');

class HttpTranscriber extends EventEmitter {
  constructor(options) {
    super();
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = options.httpModel || 'gpt-4o-transcribe';
    this.language = Array.isArray(options.languages) && options.languages.length === 1
      ? options.languages[0]
      : '';
    this.prompt = (options.prompt || '').slice(0, 900);
    this.logger = options.logger;
    this.sequence = 0;
    this.abortController = null;
    this.closed = false;
  }

  async transcribe(pcm, meta = {}) {
    if (this.closed) throw new Error('转写器已关闭');
    if (!pcm || pcm.length < 4_800) {
      throw Object.assign(new Error('音频片段太短'), { code: 'AUDIO_TOO_SHORT' });
    }
    this.sequence += 1;
    const itemId = `http-${this.sequence}`;
    const wav = encodeWav(pcm, 24_000);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'segment.wav');
    form.append('model', this.model);
    form.append('response_format', 'json');
    if (this.language) form.append('language', this.language);
    if (this.prompt) form.append('prompt', this.prompt);

    const controller = new AbortController();
    this.abortController = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    timeout.unref?.();

    try {
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal
      });
      const bodyText = await response.text();
      if (!response.ok) {
        let detail = bodyText;
        try {
          detail = JSON.parse(bodyText)?.error?.message || bodyText;
        } catch {
          // keep raw
        }
        throw Object.assign(new Error(`标准转写失败（HTTP ${response.status}）：${String(detail).slice(0, 300)}`), {
          code: response.status === 401 ? 'AUTH' : 'HTTP_STT',
          statusCode: response.status
        });
      }
      let text = '';
      try {
        const parsed = JSON.parse(bodyText);
        text = parsed.text || parsed.transcript || '';
      } catch {
        text = bodyText;
      }
      text = String(text).trim();
      if (!text) throw new Error('转写结果为空');
      this.emit('completed', {
        itemId,
        transcript: text,
        languages: this.language ? [{ code: this.language }] : [],
        usage: null,
        http: true,
        meta
      });
      return text;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error('标准转写超时'), { code: 'STT_TIMEOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.abortController === controller) this.abortController = null;
    }
  }

  close() {
    this.closed = true;
    try {
      this.abortController?.abort();
    } catch {
      // ignore
    }
  }
}

module.exports = { HttpTranscriber };
