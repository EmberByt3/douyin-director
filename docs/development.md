# 开发与架构

```text
desktop/renderer        界面、报告、素材库、设置
        ↓ preload IPC
desktop/main.js         本机生命周期、登录窗口、加密设置
        ↓ loopback + random bearer token
server/index.js         本地 HTTP API
server/jobs.js          下载 → FFmpeg → ASR/视觉 → 报告 → 可选素材同步
server/providers/       DeepSeek、MiniMax、火山适配器
server/materials/       飞书表结构、连接和素材检索
scripts/                离线测试、构建及公开内容检查
```

桌面主进程在启动时注入随机本地 API 令牌。HTTP 服务只监听回环地址，渲染页面通过 preload 获取访问能力。报告和模型结果需要清洗，远程抖音窗口不启用 Node 集成。

`npm start` 启动桌面；`npm run start:api` 仅用于 API 开发，没有桌面登录和加密配置桥接。单独启动 API 时需要自己设置随机 `LOCAL_API_TOKEN` 并在受保护请求中使用 Bearer 认证；默认空令牌将拒绝受保护请求，不会退化为免认证。

`npm test` 启动独立子进程运行回归脚本，使用临时目录、合成数据、模拟 API。测试不需要模型 Key 或 FFmpeg。Windows 上 `npm run test:desktop` 使用隔离资料目录启动 Electron，检查设置页和本地模式；测试产物在忽略的 `artifacts/` 中。

`npm run build:desktop` 从公开默认值创建 `build/private.env`，不读取开发者 `.env`；electron-builder 仅打包白名单源目录。Windows 默认无签名且不包含 FFmpeg。CI 构建用于确认源码可构建，不自动将每次提交作为发行版发布。

原始云账户、计费和网关适配模块暂时保留用于兼容和回归测试。本开源版默认不调用它们，旧云服务器部署脚本、数据及管理后台不在发行范围内。新增功能应以独立本机运行作为默认行为。

后续欢迎贡献：可验证的跨平台桌面发行、额外模型适配器、更清晰的任务恢复与失败诊断。请避免用界面显示“成功”来代替真实模型或下载结果。
