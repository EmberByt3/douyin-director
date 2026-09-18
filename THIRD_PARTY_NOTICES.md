# Third-party components

The MIT license at the repository root applies to this project's own code and documentation, not to dependencies or third-party services.

- **Electron / Node.js / Chromium**: Electron is installed from npm for development and included in Windows builds. Preserve the license and notice files supplied by Electron when distributing an application. See [Electron LICENSE](https://github.com/electron/electron/blob/main/LICENSE) and the notices accompanying its binaries.
- **electron-builder and npm dependencies**: build tools are resolved by `package-lock.json`. Their package license files apply independently. No dependency source tree is vendored in this repository.
- **FFmpeg**: invoked as a separately installed command. Neither its source nor its executable is included in this repository or the default installer. Obtain it through the [official download entry](https://ffmpeg.org/download.html) and review the [FFmpeg licensing information](https://ffmpeg.org/legal.html) for your selected build before redistributing it.
- **Optional Python downloader adapter**: `server/downloader.js` retains an integration path for [jiji262/douyin-downloader](https://github.com/jiji262/douyin-downloader). It is disabled by default; none of that repository, its Python dependencies or its runtime is bundled. The desktop download flow uses Electron and does not require this component. If you install it separately, follow its own license and setup instructions.
- **External services**: Douyin, DeepSeek, MiniMax, Volcano Engine and Feishu names identify integrations only. Service terms, account access and API charges are separate from this project's software license. No affiliation or endorsement is implied.

