# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability or a leaked credential.

Use GitHub's private vulnerability reporting:

1. Open <https://github.com/iris-pc/floatlingo/security/advisories>
2. Choose **Report a vulnerability**
3. Include reproduction steps, impact, and the affected version

If private reporting is unavailable, open an issue that only asks for a private
contact channel and does not include exploit details or secrets.

## Secrets in this repository

This repository does **not** contain OpenAI or DeepSeek API keys. The app reads
keys in one of two ways:

- entered by the user in the app settings, encrypted with macOS Keychain
  (`safeStorage`) whenever available;
- `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` environment variables for development.

`.env`, local Electron profiles, `secrets.json`, build outputs, and release
archives are excluded by `.gitignore`. Test suites use the literal key `test`
against a local-only mock server (`127.0.0.1:8787`); they do not call real APIs.

## Audio and transcript data

- Microphone and system audio are streamed to OpenAI for transcription.
- Transcripts are streamed to DeepSeek or OpenAI for Korean translation and,
  when requested by the user, meeting-minutes generation.
- Audio is not written to disk by the app.
- Transcript history and generated minutes live in process memory. Export is
  user-triggered. Generate/export minutes before quitting if you need an archive.
- System audio capture uses ScreenCaptureKit and does not record or upload video.

## macOS permissions

The app requires Microphone permission and, for system audio, Screen & System
Audio Recording permission for the bundled **FloatLingo Audio** helper. Grant
only if you trust the application and the API endpoints you configure.

## Build provenance

The public release artifacts are locally built and **ad-hoc signed**, not
notarized by Apple. For production distribution, build from source with your own
Developer ID certificate and notarize the result. See `README.md`.
