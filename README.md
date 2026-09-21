# 夯048 · Hang2048

> 拉完了 → NPC → 人上人 → 顶级 → 夯 合成链 2048 桌面游戏

[![Release](https://img.shields.io/github/v/release/HarryXZX/Hang2048?color=edc22e&label=release)](https://github.com/HarryXZX/Hang2048/releases/latest)
[![License](https://img.shields.io/github/license/HarryXZX/Hang2048?color=8f7a66)](LICENSE)

---

## 🎉 v2.0.0 重磅更新：架构重构

> **一次彻底的重构，代码质量追上玩法体验。**

v1.x 把 HTML + CSS + 游戏逻辑全部塞在一个 526 行的 `index.html` 里，能跑，但没法维护。
v2.0.0 把它拆成了标准的 Electron 三层架构，并补齐了测试、打包、图标等工程化设施：

| | v1.2.0 | **v2.0.0** |
| --- | --- | --- |
| 代码组织 | 单文件 `index.html` 内联全部 | `main.js` + `preload.js` + `renderer/{index.html,styles.css,renderer.js}` |
| 进程通信 | 无（直接 `window.close()`） | `contextBridge` 安全桥接，`contextIsolation` + `sandbox` + CSP |
| 窗口尺寸 | 硬编码，150% DPI 下偏移 0.667px | 渲染进程实测 + DPI 取整误差反向补偿，像素级精确 |
| 窗口拖动 | ❌ 无边框且**完全拖不动** | ✅ 标题栏可拖动 |
| 自动化测试 | 无 | **45 项断言** + 自动截图（`npm run smoke`） |
| 图标 | 依赖系统转换 | `tools/make-icon.cjs` 生成 7 种尺寸 ICO |
| 打包 | 手动 `npm run dist` | `tools/build.ps1` 一键镜像打包，NSIS + portable 双产物 |

**玩法、手感、画面与 v1.2.0 完全一致**——这是一次纯粹的架构升级，不是改版。

同时顺手修掉了 5 个真实缺陷（窗口不可拖、CSP 拦截内联样式、DPI 半像素偏移、
渲染空值崩溃、未使用的 require）。详见 [DEV_DOC.md](DEV_DOC.md#11-v200-修掉的真实缺陷)。

📦 **[前往 Releases 下载 v2.0.0](https://github.com/HarryXZX/Hang2048/releases/latest)** · 免安装单文件，双击即玩

---

## 简介

**Hang2048** 是一款基于 [Electron](https://www.electronjs.org/) 的 4×4 网格 2048 变体桌面合成游戏。
经典的「数值合并」玩法被替换为一条中文合成链：

```
拉完了 → NPC → 人上人 → 顶级 → 夯
```

相邻同等级合并升一级，合成出「**夯**」即胜利；棋盘 16 格填满即失败。

- 支持 **键盘方向键** 与 **鼠标 / 触摸拖拽** 双操作方式
- 流畅的滑动 / 合并动画（CSS transition + 强制回流）
- 自定义合成链得分、实时计时器、胜利 / 失败结算面板
- **v2.0.0 起完成架构重构**：从单文件内联拆分为主进程 / 预加载 / 渲染进程三层，
  并补齐冒烟测试、图标生成、打包脚本等工程化设施

## 功能特性

| 特性 | 说明 |
| --- | --- |
| 玩法 | 4×4 合成链，相邻同等级合并升级，合成「夯」通关 |
| 操作 | 键盘方向键 + 鼠标/触摸拖拽（阈值 30px，支持不抬手连续拖拽） |
| 计分 | 每次合并 +10，合成「夯」额外 +100 |
| 计时 | 计时器从本局第一次「有效操作」才开始（无效操作不计时） |
| 结算 | 胜利 / 失败面板，显示用时与得分，一键再来一局 |
| 窗口 | 550×600 无边框窗口，右上角自绘关闭按钮，标题栏区域可拖动 |
| 快捷键 | `F2` 重新开始、`Esc`（预留） |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│ 主进程 main.js                                               │
│  · 创建 550×600 无边框窗口（尺寸由渲染进程测得后回调）          │
│  · 移除应用菜单、单实例锁、生命周期                            │
│  · ipcMain: resize-window / close-window                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ contextBridge（preload.js）
                            │ window.desktop.{resize, closeWindow}
┌───────────────────────────▼─────────────────────────────────┐
│ 渲染进程 renderer/                                            │
│  · index.html  仅 DOM 骨架 + CSP                              │
│  · styles.css  全部样式                                       │
│  · renderer.js 游戏逻辑 + 渲染 + window.__h2048 测试钩子        │
└─────────────────────────────────────────────────────────────┘
```

安全设置：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，
页面用 CSP `default-src 'none'; style-src 'self'; script-src 'self'` 收紧，不引用任何外部 CDN。

## 目录结构

```
Hang2048/
├─ main.js                  Electron 主进程：无边框窗口、应用生命周期、窗口尺寸修正
├─ preload.js               contextBridge 安全桥接（resize / closeWindow）
├─ renderer/
│  ├─ index.html            DOM 骨架 + CSP
│  ├─ styles.css            全部样式
│  └─ renderer.js           游戏逻辑 + 渲染 + 自动化测试钩子
├─ tools/
│  ├─ make-icon.cjs         icon.png(512) → build/icon.ico（7 种尺寸，PNG 载荷）
│  ├─ fetch-electron.cjs    多连接分块下载 Electron 预编译包（走 Node TLS）
│  ├─ build.ps1             国内镜像打包脚本
│  ├─ smoke.cjs             冒烟测试：45 项断言 + 界面截图
│  └─ 7za_wrapper.cs        【v1 遗留】旧版 7za 容错包装器，已被 build.ps1 取代
│     bin-proxy.js          【v1 遗留】旧版本地下载代理，已被 npmmirror 取代
├─ build/icon.ico           应用图标（由 make-icon.cjs 生成）
├─ icon.png                 图标源文件（512×512）
├─ dist/                    electron-builder 产物（已 gitignore）
├─ output/                  交付 exe 副本（已 gitignore）
├─ release/                 v1.x 遗留产物（历史版本 exe，保留不动）
├─ README.md / DEV_DOC.md / SESSION_RECORD.md
```

## 开发

```bash
npm install          # 首次安装依赖（electron 31 + electron-builder 24）
npm start            # 直接运行
npm run icon         # 由 icon.png 重新生成 build/icon.ico
npm run smoke        # 跑冒烟测试，截图输出到 captures/
npm run dist         # 打包（网络正常时）
npm run dist:cn      # 打包（国内镜像，推荐）
```

## 测试

`npm run smoke` 会驱动真实的 Electron 窗口跑 **45 项断言**，并把界面截图写到 `captures/`。

关键手法：测试里把 `Math.random` 固定为 `0`，让「合并后新块落点 / 等级」完全可预测，
于是所有断言都可以写死成确定的盘面。

覆盖范围：

```
初始局面        开局 2 个块 / 计时器待命 / DOM 棋子数
合成链常量      4×4、最高等级 4、5 级名称与配色
基本合并        [0,0]→[1]、+10 分、有效操作返回 true
合并规则        不同等级不合并；三连只合一次；四连合成两对
最高级          「夯」相邻不再合并
胜利            合成「夯」+100、弹面板、不再生成新块
失败            棋盘填满弹「游戏失败」
计时器          第一次有效操作才启动、开始走字
生成概率        600 次采样验证 90% / 10%
输入            键盘方向键、拖拽阈值 30px、连续拖拽
重置            「重置」按钮 / 「再来一局」/ F2
其他            窗口尺寸、渲染进程无错误日志
```

> 注意：截图前必须让窗口真正上屏。隐藏窗口的 `capturePage` 会漏掉合成层，
> 而 `.tile` 带 `transition` + `z-index` 会被提升为独立合成层，
> 结果就是断言全对、截图里却看不到棋子。

## 打包

```bash
npm run dist:cn
```

`tools/build.ps1` 会做好这几件事，再调用 electron-builder：

1. 把 npm / Electron / electron-builder 的缓存重定向到项目内 `.cache/`；
2. 把 Electron 和 electron-builder 二进制的下载源切到 npmmirror；
3. 必要时生成 `build/icon.ico`；
4. 把 `winCodeSign` 放进项目缓存。

第 4 步是必须的：`winCodeSign-2.6.0.7z` 里含 macOS 的符号链接（`libcrypto.dylib`、
`libssl.dylib`），Windows 上普通用户权限建不了符号链接，7-Zip 会返回退出码 2，
electron-builder 会当成失败并重试 4 次后整体报错。脚本优先从系统级
`%LOCALAPPDATA%\electron-builder\Cache\` 直接搬运（离线、瞬时），
没有才去下载并手工解压（忽略这两个符号链接即可，Windows 侧需要的
`rcedit-x64.exe` 和 `windows-10/` 都能正常解出）。

### 本机环境注意事项

- 系统 schannel（`curl.exe` / `Invoke-WebRequest`）在本机不可用（`SEC_E_NO_CREDENTIALS`），
  所以 `tools/fetch-electron.cjs` 与 `build.ps1` 都改用 Node 自带的 TLS 栈下载。
- Electron 压缩包单连接只有约 70 KB/s，`tools/fetch-electron.cjs` 用 8 连接分块下载，
  实测能到 0.6 MB/s。
- `tools/build.ps1` 必须保持纯 ASCII：Windows PowerShell 5.1 会用 ANSI 读取没有 BOM 的
  `.ps1`，中文注释会把脚本解析坏。
- 无边框窗口在非整数缩放（例如 150% DPI）下 `setContentSize(N)` 可能得到 N+1，
  会让页面出现 0.5px 半像素偏移。`main.js` 的 `applyContentSize()` 会测出偏差后反向补偿一次。

## 下载

前往 **[Releases](https://github.com/HarryXZX/Hang2048/releases/latest)** 下载，两种可选：

| 产物 | 说明 |
| --- | --- |
| `Hang2048-Portable-2.0.0.exe` | **免安装单文件**，双击即玩，推荐 |
| `Hang2048-Setup-2.0.0.exe` | NSIS 安装向导，可选安装目录、创建桌面/开始菜单快捷方式 |

> 未配置代码签名证书，Windows SmartScreen 可能提示"未知发布者"，选择"仍要运行"即可。

## 打包产物

`npm run dist:cn` 之后：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `dist/Hang2048-Setup-2.0.0.exe` | ≈ 75 MB | NSIS 安装包，可选安装目录、创建桌面/开始菜单快捷方式 |
| `dist/Hang2048-Portable-2.0.0.exe` | ≈ 75 MB | 免安装单文件，双击即玩 |
| `dist/win-unpacked/Hang2048.exe` | | 解包运行版 |
| `output/*.exe` | | 上面两个的交付副本（脚本外手动复制） |

exe 内嵌 `build/icon.ico`，版本信息为 `ProductName=Hang2048`、`FileVersion=2.0.0`。
未配置代码签名证书，打包日志里的 “no signing info identified” 属正常现象。

## 版本

| 版本 | 说明 | 状态 |
| --- | --- | --- |
| 1.0.0 | 初版：合成链玩法、双操作、动画、计分、胜负规则、计时器（开局即计时）、图标打包 | 历史版本 |
| 1.2.0 | 计时器改为首次「有效操作」才开始计时 | 历史版本 |
| **2.0.0** | **🎉 重磅更新 · 架构重构**：单文件内联 → `main.js` / `preload.js` / `renderer/` 三层；新增 CSP、图标生成、打包脚本、45 项冒烟测试；修掉 5 个真实缺陷。**玩法与外观与 1.2.0 完全一致** | **最新版** |

> v1.2.0 源码完整备份在 `E:\HYTools\Project\Hang2048.backup-v1.2.0\`，
> git 上打有 `legacy-v1.2.0` 标签。

## 许可

MIT © HYTools
