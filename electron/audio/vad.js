'use strict';

const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;

/**
 * A small, dependency-free energy VAD tuned for 100 ms PCM16 chunks.
 *
 * It is deliberately conservative: the STT stream receives all audio, and the
 * VAD only decides when to commit a turn. A wall-clock tick also handles macOS
 * system-audio streams, which may stop delivering buffers while the speaker is
 * silent.
 */
class EnergyVad {
  constructor(options = {}) {
    this.sensitivity = Number.isFinite(options.sensitivity) ? options.sensitivity : 0.55;
    this.silenceMs = Number.isFinite(options.silenceMs) ? options.silenceMs : 600;
    this.maxSegmentMs = Number.isFinite(options.maxSegmentMs) ? options.maxSegmentMs : 12_000;
    this.minSpeechMs = Number.isFinite(options.minSpeechMs) ? options.minSpeechMs : 320;
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onCommit = options.onCommit || (() => {});
    this.onDiscard = options.onDiscard || (() => {});
    this.onLevel = options.onLevel || (() => {});

    this.levelDb = -90;
    this.noiseFloorDb = -58;
    this.speaking = false;
    this.speechStartedAt = 0;
    this.lastVoiceAt = 0;
    this.speechMs = 0;
    this.voiceMs = 0;
    this.loudMs = 0;
    this.quietMs = 0;
    this.startedAt = Date.now();
    this.lastCommitAt = 0;
    this.lastReason = null;
    this.commits = 0;
  }

  setOptions(options = {}) {
    if (Number.isFinite(options.sensitivity)) this.sensitivity = options.sensitivity;
    if (Number.isFinite(options.silenceMs)) this.silenceMs = options.silenceMs;
    if (Number.isFinite(options.maxSegmentMs)) this.maxSegmentMs = options.maxSegmentMs;
  }

  get thresholds() {
    const offset = 6 + (1 - this.sensitivity) * 9; // 6..15 dB above the floor
    const start = Math.max(-55, Math.min(-20, this.noiseFloorDb + offset));
    return { start, stop: start - 5 };
  }

  push(buffer) {
    if (!buffer || buffer.length < 2) return;
    const samples = Math.floor(buffer.length / BYTES_PER_SAMPLE);
    if (samples <= 0) return;

    let sumSquares = 0;
    for (let i = 0; i < samples; i += 1) {
      const sample = buffer.readInt16LE(i * BYTES_PER_SAMPLE);
      const normalized = sample / 32_768;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / samples);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    this.levelDb = this.levelDb * 0.65 + db * 0.35;
    const chunkMs = (samples / SAMPLE_RATE) * 1000;

    if (!this.speaking) {
      if (this.levelDb < this.noiseFloorDb + 7) {
        this.noiseFloorDb = this.noiseFloorDb * 0.97 + this.levelDb * 0.03;
        this.noiseFloorDb = Math.max(-68, Math.min(-30, this.noiseFloorDb));
      }
      const { start } = this.thresholds;
      if (this.levelDb > start) {
        this.loudMs += chunkMs;
      } else {
        this.loudMs = Math.max(0, this.loudMs - chunkMs * 1.5);
      }
      if (this.loudMs >= 140) {
        this._startSpeech(chunkMs);
      }
    } else {
      const { stop } = this.thresholds;
      if (this.levelDb > stop) {
        this.lastVoiceAt = Date.now();
        this.quietMs = 0;
        this.voiceMs += chunkMs;
      } else {
        this.quietMs += chunkMs;
      }
      this.speechMs += chunkMs;
      if (Date.now() - this.lastVoiceAt >= this.silenceMs && this.quietMs >= Math.min(this.silenceMs, 300)) {
        this._commit('silence');
      } else if (Date.now() - this.speechStartedAt >= this.maxSegmentMs) {
        this._commit('max', true);
      }
    }

    this.onLevel(this.levelDb, this.speaking);
    this.tick();
  }

  tick() {
    if (!this.speaking) return;
    const now = Date.now();
    if (now - this.lastVoiceAt >= this.silenceMs) {
      this._commit('silence');
    } else if (now - this.speechStartedAt >= this.maxSegmentMs) {
      this._commit('max', true);
    }
  }

  _startSpeech(chunkMs) {
    const now = Date.now();
    this.speaking = true;
    this.speechStartedAt = now - Math.min(this.loudMs, 500);
    this.lastVoiceAt = now;
    this.speechMs = chunkMs;
    this.voiceMs = chunkMs;
    this.quietMs = 0;
    this.loudMs = 0;
    this.onSpeechStart({
      startedAt: this.speechStartedAt,
      continued: false
    });
  }

  _commit(reason, keepSpeaking = false) {
    if (!this.speaking) return;
    const now = Date.now();
    const durationMs = now - this.speechStartedAt;
    const voicedMs = this.voiceMs;
    const meta = {
      startedAt: this.speechStartedAt,
      durationMs,
      reason,
      continued: keepSpeaking
    };

    this.speaking = false;
    this.speechMs = 0;
    this.voiceMs = 0;
    this.loudMs = 0;
    this.quietMs = 0;
    this.lastVoiceAt = now;
    this.lastCommitAt = now;
    this.lastReason = reason;
    this.commits += 1;

    if (voicedMs < this.minSpeechMs && reason === 'silence') {
      this.onDiscard(meta);
      return;
    }

    this.onCommit(meta);

    if (keepSpeaking) {
      this.speaking = true;
      this.speechStartedAt = now;
      this.lastVoiceAt = now;
      this.onSpeechStart({
        startedAt: now,
        continued: true
      });
    }
  }

  reset() {
    this.speaking = false;
    this.loudMs = 0;
    this.quietMs = 0;
    this.voiceMs = 0;
    this.speechMs = 0;
    this.lastVoiceAt = Date.now();
  }

  state() {
    return {
      speaking: this.speaking,
      levelDb: this.levelDb,
      noiseFloorDb: this.noiseFloorDb,
      thresholds: this.thresholds,
      commits: this.commits,
      lastReason: this.lastReason
    };
  }
}

module.exports = { EnergyVad, SAMPLE_RATE };
