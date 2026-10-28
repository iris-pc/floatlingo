'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

let logFile = null;
const MAX_BYTES = 2 * 1024 * 1024;

function init() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'floatlingo.log');
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > MAX_BYTES) {
      fs.renameSync(logFile, `${logFile}.1`);
    }
  } catch {
    // no existing log
  }
}

function write(level, message, detail) {
  const suffix = detail ? ` ${safeDetail(detail)}` : '';
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}\n`;
  if (level === 'ERROR') process.stderr.write(line);
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    // Logging must never break the audio pipeline.
  }
}

function safeDetail(detail) {
  if (detail instanceof Error) return `${detail.name}: ${detail.message}`;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

module.exports = {
  init,
  info: (message, detail) => write('INFO', message, detail),
  warn: (message, detail) => write('WARN', message, detail),
  error: (message, detail) => write('ERROR', message, detail),
  debug: (message, detail) => {
    if (process.env.FLOATLINGO_DEBUG) write('DEBUG', message, detail);
  },
  logPath: () => logFile
};
