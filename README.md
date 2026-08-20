# 夯048 · Hang2048

> 拉完了 → NPC → 人上人 → 顶级 → 夯 合成链 2048 桌面游戏

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
- 全部游戏代码内联于单个 `index.html`，**无框架、无外部 CDN**

## 功能特性

| 特性 | 说明 |
| --- | --- |
| 跨平台 | Windows / macOS / Android / Web（Electron 桌面 + 可移植 HTML） |
| 玩法 | 4×4 合成链，相邻同等级合并升级，合成「夯」通关 |
| 操作 | 键盘方向键 + 鼠标/触摸拖拽（连续拖拽支持） |
| 计分 | 每次合并 +10，合成「夯」额外 +100 |
| 计时 | 计时器从本局第一次「有效操作」才开始（v1.2.0） |
| 结算 | 胜利 / 失败面板，显示用时与得分，一键再来一局 |

## 版本

| 版本 | 说明 | 状态 |
| --- | --- | --- |
| **1.0.0** | 初版：合成链玩法、双操作、动画、计分、胜负规则、计时器（开局即计时）、图标打包 | 稳定版 |
| **1.2.0** | 计时器改为首次「有效操作」才开始计时；其余沿用 | 最新版 |

> 各版本安装包以文件名带版本号天然隔离，可在 `releases/` 目录中并存。

## 运行方法

### 方式一：安装包（推荐）

下载对应版本的带版本号安装包（如 `Hang2048 1.2.0.exe`），双击运行并按引导安装即可。

- Windows：`Hang2048 1.2.0.exe`（NSIS 安装向导，可选安装目录）
- 安装过程中允许选择安装路径。

### 方式二：免安装版（Portable）

- **单文件免安装 exe**：`Hang2048 1.2.0.exe`（portable 构建，双击即玩，无需安装）。
- **解包运行版**：`releases/win-unpacked-Hang2048.exe`（`release/win-unpacked/` 解包目录中的主程序，
  首次运行需连带同目录依赖；适合不想走安装向导的场景）。

### 方式三：源码运行（开发）

```bash
# 需要 Node.js + npm
npm install
npm start          # 以 Electron 开发模式启动
```

### 方式四：Web / 移动端

`index.html` 为自包含页面（HTML+CSS+JS 全部内联），可将 `index.html` 直接部署 / 嵌入 Web 或
打包为 Android WebView，核心玩法无需任何外部依赖即可运行。

## 开发技术栈

- **Electron 31**：跨平台桌面运行时（主进程 + 渲染进程，上下文隔离、禁用 Node 集成）
- **electron-builder 24**：Windows portable / NSIS 打包，自定义 `icon.png` 嵌入
- **原生 HTML / CSS / JavaScript**：无任何前端框架与 CDN，全部逻辑内联于 `index.html`
- 语言：JavaScript（主进程 `main.js` 38 行 / 页面 `index.html` 约 525 行）

### 打包命令

```bash
npm run dist       # electron-builder --win portable，产物输出到 release/
```

## 目录结构

```
Hang2048/
├── main.js              # Electron 主进程（窗口创建、菜单、生命周期）
├── index.html           # 唯一游戏代码文件：界面 + CSS + 全部游戏逻辑（内联）
├── package.json         # 项目名/版本/依赖/electron-builder 配置
├── package-lock.json    # 依赖锁文件（勿手动改）
├── icon.png             # 应用图标（打包时嵌入 exe）
├── DEV_DOC.md           # 开发文档（架构/实现细节/打包/已知坑）
├── SESSION_RECORD.md    # 跨会话开发记忆转储
├── tools/               # 构建辅助脚本（7za 包装器 / 二进制代理）
├── node_modules/        # 依赖（已 gitignore）
├── output/              # 交付 exe 副本目录（已 gitignore）
├── release/             # 打包产物目录（electron-builder 输出，win-unpacked 已 gitignore）
│   ├── Hang2048 1.0.0.exe
│   ├── Hang2048 1.2.0.exe
│   ├── win-unpacked/    # 解包目录（已 gitignore）
│   └── builder-debug.yml
└── releases/            # 最终发布产物（纳入版本库）
    ├── Hang2048 1.0.0.exe          # 稳定版安装/免安装包
    ├── Hang2048 1.2.0.exe          # 最新版安装/免安装包
    └── win-unpacked-Hang2048.exe   # 解包运行版主程序
```

## 许可

MIT © HYTools
