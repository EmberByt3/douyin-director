# 配置

设置页展示应用配置的当前值；编辑后尚未保存、已保存待重启、系统管理项会分别标注。密钥可逐项查看、隐藏、替换和清空。保存使用操作系统安全存储；系统加密不可用时会拒绝写入。

## 优先顺序

从源码运行时，已有进程环境优先于根目录 `.env`；安装版从应用资源目录 `config/private.env` 读取公开默认值。两者随后都会加载个人资料目录内的 `workbench-settings.bin` 加密覆盖值。桌面管理的端口、访问令牌、任务路径由程序最终设置。

保存的设置重启后生效；不会改写 `.env`。清空密钥会保存明确的空值，重启后不会被旧环境配置重新填回。想撤销个人覆盖时，先关闭程序，再备份并移走 `workbench-settings.bin`，即可重新采用基础配置。

## 主要设置

| 分类 | 环境变量 | 说明 |
| --- | --- | --- |
| 本地模式 | `LOCAL_DIRECT_MODE` | 默认 `true`；开源发行不需要旧云服务 |
| 文本 | `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_API_KEY` | 默认 DeepSeek 适配器，模型名须符合自己的账户 |
| 视觉 | `VISION_PROVIDER`, `MINIMAX_VISION_URL`, `MINIMAX_VISION_MODEL`, `MINIMAX_API_KEY` | `minimax` 或 `off` |
| 画面批次 | `VISION_BATCH_SIZE`, `VISION_BATCH_CONCURRENCY` | 控制每批图片数量与并发 |
| 语音 | `VOLCANO_ASR_API_KEY`, `VOLCANO_ASR_RESOURCE_ID` | 火山 ASR 的 Key 和资源 ID |
| 语音策略 | `ASR_REQUIRED`, `VOLCANO_ASR_LANGUAGE`, `VOLCANO_ASR_TIMEOUT_MS` | 是否要求识别成功、语言和轮询超时 |
| 媒体处理 | `FFMPEG_PATH`, `FRAME_RATE_FPS`, `KEEP_VIDEO` | FFmpeg 路径、每秒抽帧数、是否保留原视频/音频 |
| 直链下载 | `DOWNLOAD_RETRY_TIMES`, `DOWNLOAD_RETRY_DELAYS_MS`, `DOWNLOAD_INTEGRITY_CHECK` | 重试次数、间隔、完整性检查 |
| 可选下载器 | `DOUYIN_DOWNLOADER_ENABLED`, `DOUYIN_DOWNLOADER_REPO`, `DOUYIN_DOWNLOADER_PYTHON` | 默认关闭；用于另外安装的 Python 下载器 |
| 平台素材库 | `PLATFORM_FEISHU_APP_ID`, `PLATFORM_FEISHU_APP_SECRET`, `PLATFORM_FEISHU_BASE_URL` | 可选的平台飞书连接 |

`.env.example` 包含常用默认值；完整字段与校验规则见 `desktop/settings.js`。接口地址要求 HTTPS。FFmpeg 可以写为 `ffmpeg` 或例如 `C:\tools\ffmpeg\bin\ffmpeg.exe`，不要添加外层引号。

个人飞书连接通过素材库页面验证并初始化，保存在单独的 `material-library.bin`，不会自动采用其他电脑或旧版本的连接。存储位置通过“存储管理”选择，不能直接把任务目录当普通文本随意改写。

## 首次启动排查

- 找不到 FFmpeg：执行 `ffmpeg -version`，或在设置里填写可执行文件完整路径并重启。
- 模型返回 401/403：检查对应 Key、接口地区、账户权限和额度；不要把密钥贴进 Issue。
- 模型不存在：默认名称可能不在你的供应商账户中，改为该账户支持的模型 ID。
- 抖音下载失败：在登录窗口打开目标作品并确认能播放，再重试；内容不可访问或平台调整可能阻止下载。
- 端口被占用：桌面会在 8789–8800 中选择可用端口，设置页展示实际地址。
- 设置保存失败：检查系统安全存储和用户资料目录写权限。不要把其他系统的加密文件直接覆盖过来。
