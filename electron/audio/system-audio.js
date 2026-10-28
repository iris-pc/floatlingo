'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app, systemPreferences } = require('electron');

const CHUNK_BYTES = 4_800; // 100 ms PCM16 mono @ 24 kHz

class SystemAudioCapture {
  constructor(logger) {
    this.logger = logger;
    this.child = null;
    this.stopping = false;
    this.buffer = Buffer.alloc(0);
    this.onChunk = null;
    this.onError = null;
    this.onLog = null;
    this.startedAt = 0;
  }

  get running() {
    return Boolean(this.child);
  }

  helperPath() {
    const name = 'SystemAudioCapture.app/Contents/MacOS/SystemAudioCapture';
    if (app.isPackaged) return path.join(process.resourcesPath, name);
    return path.join(app.getAppPath(), 'dist', name);
  }

  async start({ onChunk, onError, onLog }) {
    if (process.platform !== 'darwin') {
      throw Object.assign(new Error('当前构建的系统音频捕获仅支持 macOS 13+。'), {
        code: 'UNSUPPORTED_PLATFORM'
      });
    }
    if (this.child) return;

    const helper = this.helperPath();
    if (!fs.existsSync(helper)) {
      throw Object.assign(new Error('系统音频组件尚未构建，请先运行 npm run build:helper。'), {
        code: 'HELPER_MISSING'
      });
    }

    // Do not pre-check systemPreferences.getMediaAccessStatus('screen'):
    // that reports the Electron app's status, while ScreenCaptureKit runs in
    // the separately-authorized FloatLingo Audio helper. Let the helper try
    // and surface its own TCC result.
    this.onChunk = onChunk;
    this.onError = onError;
    this.onLog = onLog;
    this.stopping = false;
    this.buffer = Buffer.alloc(0);
    this.startedAt = Date.now();

    this.logger.info('Starting system audio helper', { helper });
    const child = spawn(helper, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FLOATLINGO_HELPER: '1'
      }
    });
    this.child = child;

    child.stdout.on('data', (data) => {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, data]) : data;
      while (this.buffer.length >= CHUNK_BYTES) {
        const chunk = this.buffer.subarray(0, CHUNK_BYTES);
        this.buffer = this.buffer.subarray(CHUNK_BYTES);
        if (this.onChunk) this.onChunk(Buffer.from(chunk));
      }
    });

    let stderrBuffer = '';
    child.stderr.on('data', (data) => {
      stderrBuffer += data.toString('utf8');
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.logger.info('system audio helper', line);
        if (this.onLog) this.onLog(line);
      }
    });

    child.on('error', (error) => {
      this.logger.error('System audio helper failed to spawn', error);
      this.child = null;
      if (!this.stopping && this.onError) {
        this.onError(
          Object.assign(new Error(`系统音频组件启动失败：${error.message}`), { code: 'HELPER_SPAWN' })
        );
      }
    });

    child.on('exit', (code, signal) => {
      this.child = null;
      this.buffer = Buffer.alloc(0);
      const wasStopping = this.stopping;
      this.stopping = false;
      this.logger.info('System audio helper exited', { code, signal, wasStopping });
      if (wasStopping) return;
      if (this.onError) {
        const permissionHint =
          '请确认“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中已允许 FloatLingo Audio，然后重新开始会话。';
        this.onError(
          Object.assign(
            new Error(
              `系统音频捕获已停止（退出码 ${code ?? 'unknown'}）。${permissionHint}`.trim()
            ),
            { code: code === 2 ? 'SCREEN_PERMISSION' : 'HELPER_EXIT' }
          )
        );
      }
    });
  }

  stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    this.child = null;
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }, 800);
    timer.unref?.();
    this.buffer = Buffer.alloc(0);
  }
}

module.exports = { SystemAudioCapture };
