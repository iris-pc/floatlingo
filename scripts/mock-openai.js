'use strict';

/**
 * Local mock of the small OpenAI/DeepSeek surface used by FloatLingo.
 * Useful for UI and pipeline tests without spending API credits.
 *
 *   OPENAI_BASE_URL=http://127.0.0.1:8787/v1
 *   DEEPSEEK_BASE_URL=http://127.0.0.1:8787/v1
 */
const http = require('node:http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.MOCK_PORT || 8787);

const LINES = [
  {
    zh: '大家好，今天主要讨论第三季度的产品路线图。',
    ko: '여러분 안녕하세요. 오늘은 3분기 제품 로드맵을 주로 논의하겠습니다.'
  },
  {
    zh: '我们可以在十月底之前完成第一版吗？',
    ko: '10월 말까지 첫 번째 버전을 완성할 수 있을까요?'
  },
  {
    zh: '可以，但需要把多语言测试提前。',
    ko: '가능하지만 다국어 테스트를 앞당겨야 합니다.'
  },
  {
    zh: '那韩国市场的上线时间也一起调整。',
    ko: '그럼 한국 시장 출시 일정도 함께 조정하겠습니다.'
  }
];

let sessionCounter = 0;
let commitCounter = 0;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, sessions: sessionCounter, commits: commitCounter });
    return;
  }

  if (req.method === 'POST' && url.pathname.endsWith('/audio/transcriptions')) {
    // The real endpoint is multipart; the mock only needs to prove the fallback
    // path works, so drain the body and return a deterministic transcript.
    req.resume();
    req.on('end', () => json(res, 200, { text: LINES[commitCounter % LINES.length].zh }));
    return;
  }

  if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      // ignore
    }
    const messages = payload.messages || [];
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const isMinutes = messages.some(
      (m) => m.role === 'system' && String(m.content || '').includes('会议秘书')
    );
    if (isMinutes) {
      log('minutes', { model: payload.model, chars: userText.length });
      const minutes = [
        '# 会议纪要',
        '',
        '## 会议信息',
        '- 会议开始：模拟记录',
        '- 声音来源：现场 / 设备',
        '- 说明：本段为本地 mock 生成的演示纪要，用于验证界面与导出链路。',
        '',
        '## 核心结论',
        '- 团队讨论第三季度产品路线图，并计划在十月底前完成第一版。[S001] [S002]',
        '- 多语言测试需要提前，韩国市场上线时间也要同步调整。[S003] [S004]',
        '',
        '## 决议',
        '- 第一版目标时间：十月底前。[S002]',
        '- 韩国市场与多语言测试排期联动调整。[S004]',
        '',
        '## 待办事项',
        '- 提前多语言测试。[S003]',
        '',
        '## 风险 / 分歧 / 待确认',
        '- 未提及明确负责人和具体日期，需在下次会议确认。',
        '',
        '## 关键原话',
        '> 我们可以在十月底之前完成第一版吗？ [S002]',
        '> 可以，但需要把多语言测试提前。 [S003]',
        '',
        '## 内容完整性说明',
        '- 以上要点均来自模拟逐字记录；完整原文见应用自动附加的附录。'
      ].join('\n');
      json(res, 200, {
        choices: [{ message: { role: 'assistant', content: minutes } }]
      });
      return;
    }
    const match = LINES.find((line) => userText.includes(line.zh.slice(0, 6))) || null;
    const translated = match ? match.ko : `한국어 번역: ${userText}`;
    log('chat', { model: payload.model, text: userText.slice(0, 40), stream: payload.stream });

    if (!payload.stream) {
      json(res, 200, {
        choices: [{ message: { role: 'assistant', content: translated } }]
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    const chunks = splitForStream(translated);
    let index = 0;
    const started = Date.now();
    const send = () => {
      if (res.destroyed) return;
      if (index >= chunks.length) {
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[index] } }] })}\n\n`);
      index += 1;
      setTimeout(send, 18);
    };
    setTimeout(send, 260);
    res.on('close', () => {
      log('chat stream closed', { ms: Date.now() - started });
    });
    return;
  }

  json(res, 404, { error: { message: 'mock endpoint not found' } });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/v1/realtime') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  sessionCounter += 1;
  let appendedBytes = 0;
  let itemCounter = 0;
  log('realtime connected', { sessionCounter });

  const send = (payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  send({
    type: 'session.created',
    session: { id: `sess_mock_${sessionCounter}`, type: 'transcription', model: 'gpt-live-transcribe' }
  });

  ws.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (event.type === 'session.update') {
      send({ type: 'session.updated', session: event.session });
      return;
    }
    if (event.type === 'input_audio_buffer.append') {
      appendedBytes += Buffer.from(event.audio || '', 'base64').length;
      return;
    }
    if (event.type === 'input_audio_buffer.clear') {
      appendedBytes = 0;
      send({ type: 'input_audio_buffer.cleared' });
      return;
    }
    if (event.type === 'input_audio_buffer.commit') {
      if (appendedBytes <= 0) {
        send({ type: 'error', error: { type: 'invalid_request_error', message: 'buffer is empty' } });
        return;
      }
      appendedBytes = 0;
      commitCounter += 1;
      itemCounter += 1;
      const itemId = `item_mock_${sessionCounter}_${itemCounter}`;
      const line = LINES[(commitCounter - 1) % LINES.length];
      log('commit', { itemId, text: line.zh });
      send({ type: 'input_audio_buffer.committed', item_id: itemId });
      const chunks = splitForStream(line.zh, 3);
      let index = 0;
      const sendDelta = () => {
        if (ws.readyState !== ws.OPEN) return;
        if (index >= chunks.length) {
          send({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: itemId,
            transcript: line.zh
          });
          return;
        }
        send({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: itemId,
          delta: chunks[index]
        });
        index += 1;
        setTimeout(sendDelta, 65);
      };
      setTimeout(sendDelta, 160);
    }
  });

  ws.on('close', () => log('realtime closed', { sessionCounter }));
});

function splitForStream(text, size = 2) {
  const chars = [...text];
  const chunks = [];
  for (let i = 0; i < chars.length; i += size) chunks.push(chars.slice(i, i + size).join(''));
  return chunks;
}

server.listen(PORT, '127.0.0.1', () => {
  log(`Mock OpenAI listening on http://127.0.0.1:${PORT}/v1`);
  log('Use API key "test" and set Base URL to the URL above.');
});
