'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EnergyVad } = require('../electron/audio/vad');
const { encodeWav } = require('../electron/audio/wav');
const { realtimeUrl } = require('../electron/stt/realtime');
const { buildSystemPrompt } = require('../electron/translate');
const { buildTranscriptText, chunkSegments, formatDuration } = require('../electron/minutes');

function toneChunk(amplitude = 0.25) {
  const samples = 2400;
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.sin((2 * Math.PI * 220 * i) / 24000) * amplitude;
    buffer.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  return buffer;
}

function silenceChunk() {
  return Buffer.alloc(4800);
}

test('VAD starts on speech and commits after silence', async () => {
  const events = [];
  let commits = 0;
  let discards = 0;
  const vad = new EnergyVad({
    sensitivity: 0.55,
    silenceMs: 500,
    maxSegmentMs: 10_000,
    onSpeechStart: (meta) => events.push(['start', meta]),
    onCommit: (meta) => {
      commits += 1;
      events.push(['commit', meta]);
    },
    onDiscard: () => {
      discards += 1;
    }
  });

  for (let i = 0; i < 12; i += 1) {
    vad.push(toneChunk());
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  for (let i = 0; i < 12; i += 1) {
    vad.push(silenceChunk());
    await new Promise((resolve) => setTimeout(resolve, 70));
  }

  assert.equal(discards, 0);
  assert.equal(commits, 1);
  assert.equal(events[0][0], 'start');
  assert.equal(events[1][0], 'commit');
  assert.equal(events[1][1].reason, 'silence');
  assert.ok(events[1][1].durationMs >= 300);
});

test('VAD discards a very short click', async () => {
  let commits = 0;
  let discards = 0;
  const vad = new EnergyVad({
    sensitivity: 0.55,
    silenceMs: 400,
    onCommit: () => {
      commits += 1;
    },
    onDiscard: () => {
      discards += 1;
    }
  });
  vad.push(toneChunk());
  vad.push(toneChunk());
  vad.push(toneChunk());
  await new Promise((resolve) => setTimeout(resolve, 180));
  for (let i = 0; i < 6; i += 1) {
    vad.push(silenceChunk());
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.equal(commits, 0);
  assert.equal(discards, 1);
});

test('WAV encoder writes a valid mono 24k header', () => {
  const wav = encodeWav(Buffer.alloc(4800), 24000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.length, 44 + 4800);
});

test('realtime URL preserves API base paths', () => {
  assert.equal(
    realtimeUrl('https://api.openai.com/v1'),
    'wss://api.openai.com/v1/realtime?intent=transcription'
  );
  assert.equal(
    realtimeUrl('http://127.0.0.1:8787/v1/'),
    'ws://127.0.0.1:8787/v1/realtime?intent=transcription'
  );
});

test('translation prompt is Korean-only and handles partials', () => {
  const prompt = buildSystemPrompt({ glossary: 'DeepSeek = 딥시크', isFinal: false, targetLanguage: 'ko' });
  assert.match(prompt, /Korean/);
  assert.match(prompt, /ONLY/);
  assert.match(prompt, /partial/i);
  assert.match(prompt, /딥시크/);
});


test('minutes chunking keeps every segment and preserves original text', () => {
  const segments = Array.from({ length: 8 }, (_, index) => ({
    index: index + 1,
    time: `10:00:${String(index).padStart(2, '0')}`,
    source: index % 2 ? '设备' : '现场',
    original: `第${index + 1}段原文，包含数字 ${index + 1}0% 和名称 DeepSeek。`,
    translation: `제${index + 1}단계 번역`,
    createdAt: Date.now()
  }));
  const chunks = chunkSegments(segments, 260);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.reduce((sum, chunk) => sum + chunk.length, 0), segments.length);
  const text = buildTranscriptText(segments);
  assert.match(text, /\[S001\]/);
  assert.match(text, /第8段原文/);
  assert.match(text, /DeepSeek/);
  assert.match(text, /韩译/);
});

test('minutes duration label is human readable', () => {
  assert.equal(formatDuration(7_000), '7 秒');
  assert.equal(formatDuration(67_000), '1 分 7 秒');
  assert.equal(formatDuration(3_720_000), '1 小时 2 分钟');
});
