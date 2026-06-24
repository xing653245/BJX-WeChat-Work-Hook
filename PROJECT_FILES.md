# 北极熊企微框架 Pro — 项目文件说明

> **vwork-electron** 是基于 Electron + Vue 3 的企业微信（企微）管理框架。  

## electron/ — 主进程与 API 服务

### 核心入口

| 文件 | 作用 |
|------|------|
| `electron/main.js` | **Electron 主进程入口**。负责：创建主窗口与系统托盘、读写配置（IPC）、启动/重启 Express API 服务、企微注入工具调用、消息推送中转、登录状态定时检查、企微崩溃对话框自动关闭、自动更新（electron-updater）、窗口关闭确认等全部主进程逻辑。 |
| `electron/preload.js` | **预加载脚本**。通过 `contextBridge` 向渲染进程暴露安全的 `window.electronAPI`，桥接配置读写、API 调用、端口检测、进程管理、注入工具、消息监听、自动更新、关闭确认等 IPC 通道。 |
| `electron/express_server.js` | **Express HTTP 服务**。替代原 Python FastAPI，对外提供 `/api/*` REST 接口；接收企微消息推送（`POST /msg`），根据配置转发到 Electron 主进程或用户配置的回调地址。由主进程以子进程方式启动。 |

### commons/ — 公共工具

| 文件 | 作用 |
|------|------|
| `electron/commons/common.js` | 主进程与 Express 共用的工具函数：配置文件路径解析（开发/打包环境）、读写 INI、日志落盘、回调 HTTP 转发、授权到期校验、按端口杀进程、获取应用根目录等。 |

### configs/ — 默认配置

| 文件 | 作用 |
|------|------|
| `electron/configs/defaults.js` | 全局默认常量：框架默认监听端口 `8888`、默认 API URL、企微注入 key 等，供主进程、Express、前端多处引用。 |

### middleware/ — API 中间件

| 文件 | 作用 |
|------|------|
| `electron/middleware/apiHandler.js` | 统一 API 处理中间件。提供 `callVWorkAPI()`（向企微本地 HTTP 端口发请求）和 `createAPIHandler()`（生成 Express 路由处理器，含参数校验与授权检查）。 |

### utils/ — 数据模型

| 文件 | 作用 |
|------|------|
| `electron/utils/schemas.js` | 配置数据模型：`LoginInfo`（单个企微账号信息）、`ReadConfig`（完整配置结构），用于 INI 解析后的类型化封装。 |

### services/ — 业务服务

| 文件 | 作用 |
|------|------|
| `electron/services/wecomInject.js` | 企微注入服务：检测端口可用性、查找空闲端口（1025–10000）、读取注入配置、执行 `it.exe start` 启动企微实例。供主进程 IPC 与 Express `/api/other/start-wecom` 共用。 |
| `electron/services/wecomCrashDialog.js` | Windows 专用：定时检测并关闭企微崩溃后的「错误报告」弹窗，便于注入工具自动重启实例。内部调用 PowerShell 脚本。 |

### scripts/ — 主进程辅助脚本

| 文件 | 作用 |
|------|------|
| `electron/scripts/closeWecomErrorReportDialog.ps1` | PowerShell 脚本。枚举顶层窗口，匹配标题含「错误报告」且进程为 WXWork 的窗口，发送 `WM_CLOSE` 关闭。由 `wecomCrashDialog.js` 以 EncodedCommand 方式调用（兼容 asar 打包）。 |

### routes/ — Express API 路由

所有路由挂载在 `/api` 前缀下，由 `routes/index.js` 统一注册。每个路由将 HTTP 请求转换为对应 `type` 编号的企微 API 调用。

| 文件 | 作用 |
|------|------|
| `electron/routes/index.js` | API 路由入口。注册所有子路由模块，并提供通用接口 `POST /api/call`（直接按 `port` + `type` 调用任意企微 API）。 |
| `electron/routes/login.js` | 登录相关：`/api/login/status`（1000）、`/qrcode`（1001）、`/info`（1002）、`/logout`（1003）、验证码等。登录流程接口免授权校验。 |
| `electron/routes/contact.js` | 联系人/列表：`/api/contact/list`（2000 外部联系人）、`/friends`（2001 好友）、`/groups`（2002 群列表）等分页查询。 |
| `electron/routes/message.js` | 消息发送：`/api/message/text`（3000）、`/image`（3001）、`/gif`（3002）、`/file`（3003）、`/video`（3004）、`/card`（3005）、`/applet`（3006）、`/video-number`（3007）、`/card-link` 等多种消息类型。 |
| `electron/routes/friend.js` | 好友管理：`/api/friend/add`（4000 添加）、`/delete`（4001 删除）、备注修改、好友资料查询等。 |
| `electron/routes/group.js` | 群组操作：`/api/group/create`（5000 外部建群）、`/create-internal`（5001 内部建群）、邀请成员、踢人、改群名、群公告、群二维码等。 |
| `electron/routes/tag.js` | 标签管理：`/api/tag/groups`（6000 标签组列表）、`/add`（6001）、`/modify`、删除、给联系人打标签等。 |
| `electron/routes/settings.js` | 企微客户端设置：`/api/settings/auto-update`（7000）、`/auto-login`（7001）、`/message-dnd`（7002 免打扰）、`/auto-download`（7003）等。 |
| `electron/routes/id-convert.js` | ID 转换：`/api/id-convert/corp-user-to-open`（8000）、`/corp-group-to-open`（8001）、`/open-to-corp-user`（8002）、`/open-to-corp-group`（8003），用于企业 ID 与开放平台 ID 互转。 |
| `electron/routes/cdn.js` | CDN 文件操作：`/api/cdn/upload`（9000 上传）、`/vwork-image`（9001 下载企微图片）、`/vwork-file`（9002 下载文件）、`/wx-image`（9003 下载微信图片）等。 |
| `electron/routes/other.js` | 其他功能：`/api/other/clear-chat`（10000 清空聊天）、`/voice-to-text`（10003）、`/wx-pid`（10004）、`/chat-window`（10005）、`/start-wecom`（HTTP 方式启动企微实例）等。 |

---

## 构建产物（不在版本库中）

| 目录/文件 | 作用 |
|-----------|------|
| `node_modules/` | npm 安装的第三方依赖。 |
| `dist/` | Vite 构建输出的前端静态文件，供 Electron 加载。 |
| `dist-electron/` | electron-builder 打包输出的安装包与解包目录。 |

---

## 数据流简图

```
外部调用方 / 设置页调试
        │
        ▼
Express API 服务 (express_server.js)  ──port──►  企微客户端 HTTP API
        │                                              ▲
        │ POST /msg                                    │ it.exe 注入
        ▼                                              │
Electron 主进程 (main.js) ◄──IPC──► Vue 前端 (src/)     │
        │                                              │
        └── 消息推送 / 配置读写 / 进程管理 ──────────────┘
```

---

## 常用 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动 Vite 开发服务器（端口 5173）。 |
| `npm run electron:dev` | 同时启动 Vite + Electron，用于完整本地开发。 |
| `npm run build` | 构建前端到 `dist/`。 |
| `electron:build:publish` | 转换图标 → 构建前端 → 重置打包配置 → 打包 → 上传到 Gitee Release（`latest` 标签）。需设置 `GITEE_TOKEN`。 |

---
