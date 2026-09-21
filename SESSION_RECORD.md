# SESSION RECORD — 夯048 / Hang2048 桌面游戏项目

> 本文件是给"失忆的自己"（新会话的 AI）恢复上下文的记忆转储。
> 项目根目录：`E:\HYTools\Project\Hang2048\`（新会话工作目录可能是父目录，先 cd 进去）。
> **详细实现见 `DEV_DOC.md`，使用说明见 `README.md`。本文件只记当前状态与红线。**

---

## 0. 一句话摘要

Electron 桌面游戏「夯048（Hang2048）」：4×4 网格，合成链
`拉完了 → NPC → 人上人 → 顶级 → 夯`，合成「夯」即胜利，棋盘填满即失败，带计时器。
**v2.0.0 已完成架构重构**：单文件内联 → `main.js` / `preload.js` / `renderer/` 三层，
玩法与外观与 v1.2.0 完全一致。已打包并验证可运行。

## 1. 当前状态

| 项 | 值 |
|---|---|
| 版本 | **2.0.0** |
| 依赖 | electron 31.7.7 / electron-builder 24.13.3（已装好在 `node_modules/`） |
| 源码结构 | `main.js` + `preload.js` + `renderer/{index.html,styles.css,renderer.js}` |
| 打包产物 | `dist\Hang2048-Setup-2.0.0.exe`、`dist\Hang2048-Portable-2.0.0.exe`（各约 75 MB） |
| 交付副本 | `output\` 同名两个 exe |
| 验证 | `npm run smoke` 45 项断言全过；两个 exe 均已实际启动验证（窗口标题「夯048 · Hang2048」） |
| 遗留产物 | `release\` 里是 v1.x 的旧 exe，**保留不动** |

## 2. 旧版备份

- 文件夹：`E:\HYTools\Project\Hang2048.backup-v1.2.0\`（136 MB，含源码 + v1.0.0/v1.2.0 exe）
- git 标签：`legacy-v1.2.0`（挂在 `e9c4190`）

## 3. 常用命令

```powershell
cd E:\HYTools\Project\Hang2048
npm start          # 源码运行
npm run smoke      # 45 项断言 + 截图到 captures/
npm run icon       # icon.png → build/icon.ico
npm run dist:cn    # 国内镜像打包（推荐）
```

## 4. 环境坑（与扫雷项目同源，务必保留）

### 4.1 系统 schannel 不可用
`curl.exe` / `Invoke-WebRequest` 报 `SEC_E_NO_CREDENTIALS`。
所有下载一律走 Node 自带 TLS（`tools/fetch-electron.cjs`、`build.ps1` 的 `Get-WithNode`）。
CDN 偶发 `fetch failed`，`Get-WithNode` 已内置 4 次重试。

### 4.2 winCodeSign 符号链接
`winCodeSign-2.6.0.7z` 含 macOS 符号链接，普通权限解压失败（7za 退出码 2），
electron-builder 会当成失败重试 4 次后整体报错。
`build.ps1` 优先从 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`
直接搬运（离线瞬时），没有才下载 + 手工解压并忽略该错误。
> `Copy-Item -Recurse` 目标已存在时会再嵌一层子目录 —— 拷贝前必须先删目标目录。

### 4.3 build.ps1 必须纯 ASCII
Windows PowerShell 5.1 用 ANSI 读取无 BOM 的 `.ps1`；中文注释会让它解析失败。
脚本内注释一律英文。

### 4.4 无边框窗口 + 非整数 DPI
150% 缩放下 `setContentSize(N)` 会得到 **N+1**，导致页面 0.667px 半像素偏移、文字发虚。
`main.js` 的 `applyContentSize()` 测出偏差后反向补偿一次。

### 4.5 截图必须让窗口上屏
隐藏窗口的 `capturePage` 会漏掉合成层；`.tile` 带 `transition` + `z-index`
会被提升为独立合成层，结果是断言全对、截图里却没有棋子。
`tools/smoke.cjs` 里必须先 `win.showInactive()` 再截图。

### 4.6 executeJavaScript 返回值必须可克隆
`js('Math.random = function(){...}')` 会试图回传一个函数，
报 `Error: An object could not be cloned`。脚本末尾要 `return true`。

## 5. 用户偏好与约束（红线）

- 全自动执行，不要反过来叫用户操作。
- 不生成任何 `.bat` / `.sh` 打包脚本（`.ps1` 可以）。
- 名称：中文「夯048」、英文「Hang2048」。改名前先核对。
- 项目目录就是 `Hang2048` 本身，不建二级目录。
- 不引用外部 CDN；页面自有 CSP 收紧。
- **玩法与外观不要擅自改动**——本次重构是纯架构重构。

## 6. 文件清单

| 文件 | 说明 |
|---|---|
| `main.js` | 主进程：无边框 550×600 窗口、`applyContentSize` 尺寸修正、IPC、生命周期 |
| `preload.js` | contextBridge：`window.desktop.{resize, closeWindow}` |
| `renderer/index.html` | DOM 骨架 + CSP |
| `renderer/styles.css` | 全部样式（含 `.title-en`，替代原来的内联 style） |
| `renderer/renderer.js` | 游戏逻辑 + 渲染 + `window.__h2048` 测试钩子 |
| `tools/make-icon.cjs` | 用 Electron nativeImage 把 512 PNG 转成 7 尺寸 ICO |
| `tools/fetch-electron.cjs` | 8 连接分块下载 Electron（约 0.6 MB/s，单连接只有 70 KB/s） |
| `tools/build.ps1` | 国内镜像打包脚本（纯 ASCII） |
| `tools/smoke.cjs` | 冒烟测试：45 项断言 + 4 张截图 |
| `build/icon.ico` | 生成物，electron-builder 用它 |
| `icon.png` | 图标源（512×512，用户提供，勿动） |

## 7. 后续可能的走向（仅供参考）

音效、存档/读档、难度、撤销（`move()` 已有 `oldBoard` 快照可直接入栈）、
排行榜。若改了合成链或规则，注意同步 `README.md` / `DEV_DOC.md` 与本文件的描述。
