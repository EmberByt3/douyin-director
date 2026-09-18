# Douyin Director

[中文](README.md) · [MIT License](LICENSE)

An open-source Electron desktop workbench for turning short videos into frame evidence, speech timelines, structural analysis and reusable script references.

![Searchable settings with masked credentials](docs/images/settings.png)

The application runs locally and calls your configured model providers directly. No project-hosted account, activation code or credit purchase is required. This is **not offline inference**: audio, frames and text are sent to your chosen API providers when you run analysis. API usage requires your own credentials and provider balance.

## Features

- Douyin share links and direct video URLs; an isolated login window for normal playback sessions.
- FFmpeg audio extraction and timestamped frame extraction, batched visual analysis and coverage reporting.
- Speech recognition, HTML analysis reports, product script rewriting and optional Feishu material libraries.
- A searchable settings page with masked secrets, encrypted persistence and explicit restart requirements.
- Local task/cache storage with a separate open-source application profile.

## Quick start (Windows 10/11 x64)

Prebuilt Windows installers and SHA-256 checksums are available in [GitHub Releases](https://github.com/R1CKYy-220/douyin-director/releases/latest). They do not require a separate Node.js installation, but still require FFmpeg and your own provider credentials.

Install Node.js 22+, Git and [FFmpeg](https://ffmpeg.org/download.html). Add FFmpeg to PATH or configure its executable path in Settings.

```powershell
git clone https://github.com/R1CKYy-220/douyin-director.git
cd douyin-director
npm ci
Copy-Item .env.example .env
npm run doctor
npm start
```

Open Settings, enter your provider credentials, check model IDs, save and restart. The default adapters target DeepSeek (text), MiniMax (vision) and Volcano (ASR). Sign into Douyin when required, then paste a video link. Feishu is optional.

Source checkout works without copying any private configuration. Encrypted settings take precedence over the source environment after restart. Do not commit `.env`, task videos, session files or database backups.

## Build and test

```powershell
npm test
npm run check:public
npm run test:desktop
npm run build:desktop
```

Windows installers are written to `dist/`. They contain Electron but do not bundle FFmpeg, Python or third-party downloaders. FFmpeg must be installed separately. Releases are unsigned. `npm run build:dir` produces an unpacked application.

Offline tests run on Windows and Linux; Windows is the supported desktop distribution. Other desktop platforms are not yet validated. Platform access restrictions and changes may affect Douyin downloads. This tool assists with analysis and writing; it does not generate finished videos.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md), [architecture](docs/development.md), [configuration](docs/configuration.md), [privacy](docs/privacy.md) and [security reporting](SECURITY.md). The legacy account adapters remain for compatibility, but the retired hosted service and its deployment materials are not distributed or required.

Project code is MIT licensed. Dependencies retain their own licenses; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). This project is not affiliated with Douyin or the model providers. Only process content you are authorized to use.
