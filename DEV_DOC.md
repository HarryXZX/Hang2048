# 夯048 / Hang2048 开发文档

> 记录 **v2.0.0（架构重构版）** 的实现细节，供后续开发/排障/继续重构时查阅。
> 覆盖：整体架构、目录结构、主进程、页面结构、样式、核心玩法、输入、计时器、测试、打包、已知坑。
> 当前版本：**2.0.0**（`dist\Hang2048-Setup-2.0.0.exe` / `dist\Hang2048-Portable-2.0.0.exe`）。

---

## 0. 项目概要

- **类型**：基于 Electron 的 4×4 网格 2048 变体桌面合成游戏。
- **玩法**：合成链 `拉完了 → NPC → 人上人 → 顶级 → 夯`。相邻同等级合并升一级，合成出「夯」即胜利；棋盘 16 格填满即失败。
- **技术栈**：Electron 31 + electron-builder 24 + 原生 HTML/CSS/JS（无框架、无外部 CDN）。
- **打包**：Windows NSIS 安装包 + portable 免安装单文件（均带自定义图标）。

> **v2.0.0 重构说明**：v1.2.0 把 HTML + CSS + JS 全部内联在单个 `index.html` 里。
> v2.0.0 拆成 `main.js` / `preload.js` / `renderer/{index.html,styles.css,renderer.js}` 三层，
> **玩法与外观一行没改**，只做架构与工程化，并顺手修掉了几个真实缺陷（见 §11）。

---

## 1. 目录结构

```
Hang2048/
├─ main.js                  # 主进程：窗口、尺寸修正、IPC、生命周期
├─ preload.js               # contextBridge：resize / closeWindow
├─ renderer/
│  ├─ index.html            # DOM 骨架 + CSP
│  ├─ styles.css            # 全部样式
│  └─ renderer.js           # 游戏逻辑 + 渲染 + window.__h2048 测试钩子
├─ tools/
│  ├─ make-icon.cjs         # icon.png → build/icon.ico（7 尺寸）
│  ├─ fetch-electron.cjs    # 多连接分块下载 Electron
│  ├─ build.ps1             # 国内镜像打包脚本
│  └─ smoke.cjs             # 冒烟测试：45 项断言 + 截图
├─ build/icon.ico           # 由 icon.png 生成
├─ icon.png                 # 图标源（512×512）
├─ package.json             # 版本/依赖/electron-builder 配置
├─ dist/                    # 打包产物（gitignore）
├─ output/                  # 交付 exe 副本（gitignore）
├─ captures/                # 冒烟测试截图（gitignore）
├─ .cache/                  # npm/electron/builder 缓存（gitignore）
└─ release/                 # v1.x 遗留产物，保留不动
```

---

## 2. 主进程 `main.js`

| 项 | 值 | 说明 |
|---|---|---|
| `width` / `height` | 550 × 600 | 与 `#app` 尺寸一致，`useContentSize: true` |
| `show` | `false` | 等渲染进程测量完尺寸再显示 |
| `resizable` | `false` | 固定不可调 |
| `frame` | `false` | 无系统边框，页面内自绘 × 关闭按钮 |
| `backgroundColor` | `#faf8ef` | 与页面底色一致，避免白闪 |
| `webPreferences.preload` | `preload.js` | contextBridge 桥接 |
| `contextIsolation` | `true` | 上下文隔离 |
| `nodeIntegration` | `false` | 渲染进程禁用 Node |
| `sandbox` | `true` | 渲染进程沙箱 |
| `Menu.setApplicationMenu(null)` | — | 彻底移除应用菜单 |

### IPC 通道

| 通道 | 方向 | 载荷 | 作用 |
|---|---|---|---|
| `resize-window` | renderer → main | `(width, height)` | 把 `#app` 的实测尺寸同步给窗口 |
| `close-window` | renderer → main | — | 自绘 × 按钮关闭窗口 |

### 2.1 窗口尺寸修正 `applyContentSize()`

```js
function applyContentSize(width, height) {
  win.setContentSize(width, height);
  const [aw, ah] = win.getContentSize();
  const dw = aw - width, dh = ah - height;
  if (dw || dh) win.setContentSize(width - dw, height - dh);
}
```

无边框窗口在非整数缩放下（本机 150% DPI）`setContentSize(N)` 可能得到 **N+1**：
窗口会比内容宽 1px，而 `#app` 是 `margin: 0 auto`，于是整体偏移 **0.667px**，
文字渲染发虚。测出偏差后反向补偿一次即可收敛到精确值（已实测 550×600 / 260×300 / 744×456 均 OK）。

### 2.2 生命周期

- `requestSingleInstanceLock()`：第二次启动聚焦已有窗口。
- `ready-to-show` 时 `show()`；另有 3s 兜底 `show()`，防止渲染进程异常导致窗口永不显示。
- `window-all-closed` 直接 `quit()`（本项目只面向 Windows，不做 macOS 保留进程的约定）。

---

## 3. 预加载 `preload.js`

```js
contextBridge.exposeInMainWorld('desktop', {
  resize(width, height) { ipcRenderer.send('resize-window', width, height); },
  closeWindow() { ipcRenderer.send('close-window'); }
});
```

渲染进程侧一律通过 `window.desktop.*` 调用；`renderer.js` 里对 `window.desktop`
不存在的情况做了兜底（直接用 `window.close()`），所以 `renderer/index.html` 单独丢进
浏览器也能跑。

---

## 4. 页面结构 `renderer/index.html`

### 4.1 DOM 骨架

```
#app (550×600, 居中, padding 14/25/0/25)
├── .header            ← -webkit-app-region: drag（整个标题栏可拖动窗口）
│   ├── .title  → h1「夯048 Hang2048」 + .chain 合成链提示
│   ├── .stats
│   │   ├── .stat-box  → 用时 (id=timer, 00:00)
│   │   └── .score-box → 得分 (id=score, 0)
│   └── button#resetBtn 「重置」  ← no-drag
├── .board#board (500×500, touch-action:none)
│   ├── #grid     → 4×4 静态格子背景
│   ├── #tiles    → 动态棋子容器（重建式渲染）
│   ├── .toast#toast    （合成「夯」提示）
│   └── .overlay#overlay → 结束面板
│       ├── #overMsg / #overSub / #overTime / button#againBtn
└── button#closeBtn 「×」  ← no-drag
```

### 4.2 CSP

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:;">
```

> **坑**：v1.2.0 里 `<h1>` 内联了一个 `style="font-size:13px;..."` 的 `<span>`，
> 在 `style-src 'self'` 下会被 CSP 直接拒绝（控制台报 `Refused to apply inline style`）。
> v2.0.0 把这段样式挪进了 `styles.css` 的 `.title-en` 类。
> 注意：JS 里 `el.style.left = ...` 这类 CSSOM 赋值不受 `style-src` 限制，可以放心用。

### 4.3 界面布局关键数值

| 项 | 值 |
|---|---|
| `#app` | 550×600，内边距 14px 25px 0 25px |
| `.board` | 500×500，圆角 12 |
| `.cell` / `.tile` | 110×110，圆角 10 |
| `GAP` | 12px |
| 位置计算 | `pos(n) = GAP + n × (CELL + GAP)`，即 `12 + n×122` |

### 4.4 动画

| 场景 | class / keyframes | 效果 |
|---|---|---|
| 新块出现 | `.tile.appear` / `appear` | scale 0→1 + opacity（160ms） |
| 合并 | `.tile.merged` / `pop` | scale→1.28 + brightness→1.7（240ms），z-index 提升 |
| 棋子移动 | `.tile` 的 `transition` | `left/top 120ms ease` |
| 结束用时徽章 | `.overlay .time` / `timePulse` | 金色胶囊，0.9s 脉动 |
| Toast | `.toast` | 顶部淡入，1400ms 后消失 |

### 4.5 颜色表（`.tile` 背景）

| 等级 | 名称 | 背景 | 前景 | 字号 |
|---|---|---|---|---|
| 0 | 拉完了 | `#eee4da` | `#776e65` | 28px |
| 1 | NPC | `#ede0c8` | `#776e65` | 32px |
| 2 | 人上人 | `#f2b179` | `#f9f6f2` | 28px |
| 3 | 顶级 | `#f59563` | `#f9f6f2` | 30px |
| 4 | 夯 | `#edc22e` | `#f9f6f2` | 36px |

---

## 5. 数据结构与核心常量（`renderer/renderer.js`）

```js
const SIZE = 4;          // 网格 size
const CELL = 110;        // 棋子/格子像素
const GAP  = 12;         // 间距像素
const MAX_LEVEL = 4;     // 最高等级「夯」
const NAMES  = ['拉完了','NPC','人上人','顶级','夯'];
const STYLES = [ {bg,color,fs} × 5 ];

const SPAWN_LEVEL0_RATE = 0.9;  // 新块 90% 拉完了 / 10% NPC
const MERGE_SCORE   = 10;       // 每次合并
const GOAL_SCORE    = 100;      // 合成「夯」额外
const DRAG_THRESHOLD = 30;      // 拖拽阈值 px

const DELAY_MERGE = 130;        // 滑动结束 → 合并动画
const DELAY_SPAWN = 260;        // 滑动结束 → 生成新块 / 判定胜负

let board = [];   // board[r][c] = { level, id, row, col } | null
let score, tileId, gameOver, won, startTime, timerInterval, dragStart;
```

> **重点**：`board` 中每个棋子对象同时存 `row/col`（逻辑坐标）与 `level/id`。
> `row/col` 在移动时更新，供动画与 `findTileById` 使用。

---

## 6. 渲染与动画机制

### 6.1 全量重建渲染
`render()` 清空 `#tiles.innerHTML` 后按 `board` 重建全部棋子 DOM，无 DOM 打补丁。

### 6.2 移动动画双状态技巧
`renderWithMove(oldBoard)` 是滑动动画的核心，靠 CSS `transition` + **强制回流**实现：

1. 先按**旧坐标**画所有棋子 —— 旧坐标取自 `oldBoard[r][c]`（该目标格原先的棋子）；
   若该格原是空的，就直接用新坐标（该棋子没有滑动起点）；
2. `void tilesEl.offsetHeight;` **强制回流**，确保旧坐标已生效；
3. 再按**新坐标**（`board`）重设 `left/top` → 触发 `transition` 产生滑动。

### 6.3 合并动画两段式
1. `renderWithMove` 立即完成滑动（120ms 过渡）；
2. `setTimeout(DELAY_MERGE)` 之后给本次 `mergedNow` 里的 id 对应元素加 `.merged`，
   应用 `pop`（240ms）并刷新为合并后的新等级样式。

### 6.4 胜负延迟
`setTimeout(DELAY_SPAWN)` 在滑动 + 合并动画播完后才 `spawnTile()` 与判定胜负，
避免动画被新块打断。

> 连打方向键时会有多个 `setTimeout` 排队，但每个 `move()` 都基于当时的 `board`
> 快照计算，且延迟回调只做「补块 / 判定」，语义仍然是正确的（与 v1.2.0 一致）。

---

## 7. 核心玩法 `move(dir)`

`dir ∈ 'up' | 'down' | 'left' | 'right'`。完整流程：

### 7.1 预处理
- `gameOver` 时直接 `return false`。
- 深拷贝 `oldBoard`（仅 level/id/row/col）→ 供动画与 moved 判断。
- 初始化 `mergedNow = []`（本次合并保留的 id）。

### 7.2 按方向收集线
每条线取出该线上的非空棋子数组 `line`：
```js
const t = dir === 'up'   ? board[j][i]
        : dir === 'down' ? board[SIZE - 1 - j][i]
        : dir === 'left' ? board[i][j]
        :                  board[i][SIZE - 1 - j];
```
即「自移动方向起算」排序，因此合并后写回时按 `m = 0..3` 顺序放置即可。

### 7.3 合并规则（重点）
```js
if (nxt && cur.level === nxt.level && cur.level < MAX_LEVEL) { ... }
```
- **必须**相邻、**必须**同等级、**必须** `< MAX_LEVEL`（「夯」不再合并）。
- 合并时 `nxt`（靠移动方向的那块）升 1 级并保留，`cur` 消失，`k++` 跳过被吃掉的块，
  **避免连锁合并**：`[0,0,0]` 左移得到 `[1,0]` 而不是 `[2]` 或 `[0,1]`。
- 每次合并 `score += 10`；若合并出「夯」（`newLevel === MAX_LEVEL`）
  额外 `+100`、`won = true`、弹 toast。

### 7.4 写回与「有效操作」判定
```js
if (merged.length !== line.length) moved = true;         // 发生了合并
if (t.row !== r || t.col !== c)   moved = true;          // 位置变了
...
if (!moved) return false;   // 无效操作：不生成新块、不计分、不启动计时
```

### 7.5 有效操作后的三件事
```js
startTimer();             // ① 第一次有效操作才开始计时
renderWithMove(oldBoard); // ② 驱动滑动动画
// ③ 两段式 setTimeout：合并动画 → 生成新块 / 胜负判定
```

### 7.6 生成新块 `spawnTile()`
- 从空位中随机选一格；`90%` 生成等级 0（拉完了），`10%` 等级 1（NPC）。
- 新块带 `.appear` 动画。无空位时返回 `null`。

### 7.7 胜负判定
- **胜利**：合并出「夯」→ 面板「🏆 合成【夯】！」，且胜利后**不再**生成新块。
- **失败**：`isBoardFull()` 为 true（16 格全占）→ 面板「游戏失败 棋盘已填满」。
  判定时机：每次 `spawnTile` 之后，无论下一步是否还可动。

---

## 8. 计时器

| 函数 | 作用 |
|---|---|
| `armTimer()` | 待命：`stopTimer()` + `startTime = 0` + 显示 `00:00`，**不计时**。开局/重置调用。 |
| `startTimer()` | 启动：`if (timerInterval) return`（防重），`startTime = Date.now()`，每 200ms 刷新。 |
| `stopTimer()` | 清掉 interval。结束面板调用。 |
| `getElapsed()` | 已耗时；`startTime` 为 0 时返回 0。 |

**关键行为**：计时器从「本局第一次**有效操作**」才开始走。

- `reset()` 用 `armTimer()`，开局停在 `00:00` 待命；
- 只有 `move()` 里 `moved === true` 才会触发 `startTimer()`；
- 开局第一手若是无效操作（朝贴边的空方向按），不生成新块也**不计时**；
- `startTimer()` 内的防重保证只启动一次，不会重置起点。

结束时 `showOverlay` 先 `stopTimer()`，再用 `getElapsed()` 拼出「⏱ 用时 XX:XX」
放在结束面板的金色胶囊徽章里。

---

## 9. 输入处理

### 9.1 键盘
```js
document.addEventListener('keydown', (e) => {
  const dir = KEY_MAP[e.key];      // ↑↓←→
  if (dir) { e.preventDefault(); move(dir); return; }
  if (e.key === 'F2') { e.preventDefault(); reset(); }   // v2.0.0 新增
});
```

### 9.2 鼠标 / 触摸拖拽
- `pointerdown` 记录起点；
- `pointermove` 计算位移，绝对值 `< 30px` 忽略（防误触）；否则按**位移较大方向**触发一次 `move()`；
- 触发后把 `dragStart` **重置为当前点** → 支持不抬手的连续拖拽；
- `pointerup` / `pointerleave` 清空。

> 拖拽用的是 `#board` 上的 pointer 事件，所以 `.header` 上设了 `-webkit-app-region: drag`
> 也不会吃掉棋盘手势（拖动区域只覆盖标题栏）。

### 9.3 其他
- 全局 `contextmenu` 一律 `preventDefault`。
- `#closeBtn` → `window.desktop.closeWindow()`，兜底 `window.close()`。

---

## 10. 自动化测试 `tools/smoke.cjs`

驱动真实 Electron 窗口跑 45 项断言 + 4 张截图（`captures/`）。

### 10.1 确定性手法
测试里把 `Math.random` 固定为 `0`：
```js
const freezeRandom = () => js(
  `(function () { window.__rand0 = Math.random; Math.random = function () { return 0; }; return true; })()`);
```
这样 `spawnTile()` 的落点（总是第一个空位）和等级（总是 0）完全可预测，
断言可以直接写死。

> **坑**：`executeJavaScript` 的返回值必须可克隆。直接写
> `Math.random = function () {...}` 会让它试图回传一个**函数**，
> 报 `Error: An object could not be cloned`。所以脚本末尾必须 `return true`。

### 10.2 测试钩子 `window.__h2048`

| 成员 | 说明 |
|---|---|
| `size` / `maxLevel` / `names` / `styles` | 常量导出 |
| `newGame()` | 等价于 `reset()` |
| `move(dir)` | 返回是否有效操作 |
| `spawnTile()` | 手动生成一个块（用于概率统计） |
| `loadGrid(grid)` | 直接摆盘面，`null` 表示空位 |
| `snapshot()` | 导出 `grid/ids/score/gameOver/won/timerStarted/timerText/elapsed/overlay/overlayMsg/overlayTime/tileCount` |

### 10.3 截图必须让窗口上屏
```js
win.showInactive();
await sleep(700);
```
隐藏窗口的 `capturePage` 会**漏掉合成层**：`.tile` 带 `transition` + `z-index`
会被提升为独立合成层，隐藏时不参与合成 —— 结果是断言全对、截图里却看不到棋子。
（扫雷项目没踩到，是因为它的格子没有 transition/z-index。）

> 两张截图之间如果隔得太近，上一局的 toast（1.4s 生命期）会留在画面上；
> 打失败截图前多等 1.6s。

---

## 11. v2.0.0 修掉的真实缺陷

| # | 缺陷 | 修法 |
|---|---|---|
| 1 | 无边框窗口**完全不能拖动**（v1.2.0 没设 `-webkit-app-region`） | `.header` 设 `drag`，按钮设 `no-drag` |
| 2 | 标题里的 `<span style="...">` 被 CSP 拒绝 | 挪进 `styles.css` 的 `.title-en` |
| 3 | 150% DPI 下窗口比内容宽 1px，页面整体 0.667px 半像素偏移、文字发虚 | `main.js` 的 `applyContentSize()` 反向补偿 |
| 4 | `renderWithMove` 里 `findTileById` 可能返回 `null` 导致抛错 | 加空值保护（无行为变化） |
| 5 | `main.js` `require('path')` 未使用（遗留） | 实际使用了 `path.join` 定位渲染资源 |

以上都不改变玩法与外观。

### 已知但**未**改动（刻意保持 v1.2.0 行为）

- `reset()` 不会清掉正在显示的 toast。正常游戏里「合成【夯】」和「重开」不会在 1.4s 内连续发生，
  只有测试连跑时才会看到，因此保持原样。

---

## 12. 打包

```bash
npm run dist:cn      # 推荐，走 npmmirror 镜像
npm run dist         # 网络正常时可用
```

`tools/build.ps1` 流程见 README §打包。要点速查：

- **缓存**：`npm_config_cache` / `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` 全部指向项目内 `.cache/`。
- **镜像**：`ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror。
- **winCodeSign**：优先从 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`
  直接搬运；没有才下载 + 手工 7za 解压（忽略 darwin 符号链接错误）。
  > `Copy-Item -Recurse` 在目标目录已存在时会**再嵌一层子目录**，所以拷贝前必须先删掉目标目录。
- **图标**：`build/icon.ico` 不存在时会自动调 `tools/make-icon.cjs` 生成。
  **不要**设 `win.signAndEditExecutable: false`，否则 rcedit 被跳过、自定义图标不生效。
- **脚本编码**：`build.ps1` 必须保持纯 ASCII。Windows PowerShell 5.1 用 ANSI 读取无 BOM 的 `.ps1`，
  中文注释会让它解析失败（`Missing closing '}'`）。
- **下载重试**：CDN 偶发 `fetch failed`，`Get-WithNode` 会重试 4 次并打印 `e.cause`。

产物：`dist\Hang2048-Setup-<version>.exe`、`dist\Hang2048-Portable-<version>.exe`，
再手工复制到 `output\` 作为交付副本。

---

## 13. 可扩展方向

常量驱动（`SIZE/CELL/NAMES/STYLES/MAX_LEVEL`）使以下改动成本低：

- **改合成链名称/等级数**：改 `NAMES`、`STYLES`、`MAX_LEVEL`。
- **改网格尺寸**：改 `SIZE`，其余自适应。
- **加音效**：在 `move` 合并点 / `spawnTile` / `showOverlay` 处挂 `Audio`。
- **存档/读档**：序列化 `board`(`id/level/row/col`) + `score` + 计时偏移。
- **难度**：调 `SPAWN_LEVEL0_RATE`。
- **排行榜/徽章**：给 `showOverlay` 增加成绩维度。
- **撤销**：`move()` 前已有完整的 `oldBoard` 快照，直接存历史栈即可。

---

## 14. 版本历史

| 版本 | 内容 |
|---|---|
| 1.0.0 | 初版：4×4 合成链游戏、双操作、动画、计分、胜负规则、计时器（开局即计时）、图标打包 |
| 1.2.0 | 计时器改为首次「有效操作」才开始；其余沿用 |
| **2.0.0** | **架构重构**：拆 `renderer/` 三层 + `preload.js` + `main.js` 重写；新增 CSP、`make-icon.cjs`、`fetch-electron.cjs`、`build.ps1`、45 项冒烟测试；修 §11 的 5 个缺陷；打包目标扩展为 NSIS + portable |

> v1.2.0 源码备份：`E:\HYTools\Project\Hang2048.backup-v1.2.0\`；git 标签 `legacy-v1.2.0`。
