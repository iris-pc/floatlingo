'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'mock-settings.json');

/**
 * Create an isolated Electron userData directory for a test. Keeping this
 * outside the repository's tracked files prevents browser profiles, cookies
 * and local API-key stores from ever being committed.
 */
function ensureProfile(name, overrides = {}) {
  const profile = path.join(__dirname, `${name}-profile`);
  fs.mkdirSync(profile, { recursive: true });
  const base = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  fs.writeFileSync(
    path.join(profile, 'settings.json'),
    `${JSON.stringify({ ...base, ...overrides }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return profile;
}

module.exports = { ROOT, ensureProfile };
