# 夯048 / Hang2048 开发文档

> 本文件记录 Hang2048 桌面游戏项目的**各处细节与实现**，供后续开发/排障/重构时查阅。
> 覆盖：整体架构、目录结构、窗口主进程、页面结构、样式、核心玩法逻辑、输入、计时器、打包、已知坑。
> 当前版本：**1.2.0**（`output\Hang2048 1.2.0.exe`）。

---

## 0. 项目概要

- **类型**：基于 Electron 的 4×4 网格 2048 变体桌面合成游戏。
- **玩法**：合成链 `拉完了 → NPC → 人上人 → 顶级 → 夯`。相邻同等级合并升一级，合成出「夯」即胜利；棋盘 16 格填满即失败。
- **技术栈**：Electron 31 + 原生 HTML/CSS/JS（**无框架、无外部 CDN，全部代码内联于 `index.html`**）。
- **打包**：electron-builder 生成 Windows portable 免安装 exe（带自定义图标）。
- **代码总量**：`index.html` 约 525 行（内联 CSS + JS），`main.js` 38 行。

> 与经典 2048 的区别：数值换成中文合成链、含「计时器」、胜利/失败条件自定义、可键盘+鼠标拖拽双操作。

---

## 1. 目录结构

```
hang2048/
├── main.js              # Electron 主进程（窗口创建、菜单、生命周期）
├── index.html           # 唯一游戏代码文件：界面 + CSS + 全部游戏逻辑
├── package.json         # 项目名/版本/依赖/electron-builder 配置
├── icon.png             # 512×512 应用图标（打包时嵌入 exe）
├── package-lock.json    # 依赖锁文件（勿手动改）
├── SESSION_RECORD.md    # 跨会话记忆转储（开发文档见本文件）
├── DEV_DOC.md           # 本开发文档
├── tools/
│   ├── 7za_wrapper.cs       # C#：7za 容错包装器（解决符号链接解压失败）
│   └── bin-proxy.js         # node 本地/回退代理（二进制下载备用，见 §9）
├── release/             # 打包产物目录（electron-builder 输出）
│   ├── Hang2048 1.0.0.exe
│   ├── Hang2048 1.2.0.exe
│   ├── win-unpacked/        # 解包目录（运行版 Hang2048.exe）
│   └── builder-debug.yml
├── output/              # 交付 exe 副本目录
│   ├── Hang2048 1.0.0.exe
│   └── Hang2048 1.2.0.exe
└── node_modules/        # 依赖（electron, electron-builder 等）
```

---

## 2. 主进程 `main.js`

窗口 + 菜单 + 应用生命周期，仅 38 行。

```js
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');   // 注：实际未使用，属遗留
```

| 项 | 值 | 说明 |
|---|---|---|
| `width` / `height` | 550 × 600 | 与 `index.html` 的 `#app` 尺寸一致 |
| `resizable` | `false` | 固定不可调窗口大小 |
| `frame` | `false` | 无系统边框（自绘关闭按钮，见 §4「close-btn」） |
| `autoHideMenuBar` | `true` | 隐藏默认菜单栏 |
| `nodeIntegration` | `false` | 渲染进程**禁用** Node 集成（安全） |
| `contextIsolation` | `true` | 上下文隔离（安全） |
| `Menu.setApplicationMenu(null)` | — | 彻底移除应用菜单 |
| `win.loadFile('index.html')` | — | 加载内联游戏页面 |

**生命周期**：
- `app.whenReady()` → 创建窗口；`activate` 时窗口全部关闭则重建（macOS 惯例）。
- `window-all-closed`：非 macOS 平台直接退出。

> `path` 被 require 但未使用，属无害遗留；如需清理可在主进程两侧同步移除。

---

## 3. `package.json` 与打包配置

```jsonc
{
  "name": "hang2048",
  "version": "1.2.0",          // 当前版本（影响 exe 文件名与元数据）
  "productName": "Hang2048",
  "main": "main.js",
  "scripts": { "start": "electron .", "dist": "electron-builder --win portable" },
  "devDependencies": { "electron": "^31.0.0", "electron-builder": "^24.13.3" },
  "build": {
    "appId": "com.hytools.hang2048",
    "directories.output": "release",
    "files": ["main.js", "index.html", "icon.png"],
    "win": { "icon": "icon.png", "target": [{ "target": "portable", "arch": ["x64"] }] }
  }
}
```

关键点：
- **版本号** `version` 直接决定 portable exe 文件名 `Hang2048 <version>.exe` 及 exe 内嵌元数据（ProductVersion / FileVersion），并出现在 FileDescription 之外的信息。
- `build.files` 只打包所列 3 个文件，`node_modules` 运行时依赖随 Electron 框架打包。
- **`win.icon`** 指向 `icon.png`，打包时嵌入 exe。**不可**设置 `win.signAndEditExecutable: false`，否则 rcedit 被跳过、自定义图标不生效（见 §9 坑）。
- `productName: "Hang2048"` 控制 exe 内 ProductName 与解包主程序名。

---

## 4. 页面结构 `index.html`

### 4.1 DOM 骨架

```
#app (550×600, 居中)
├── .header
│   ├── .title  → h1「夯048 Hang2048」 + .chain 合成链提示文字
│   ├── .stats
│   │   ├── .stat-box → 用时 (id=timer, 00:00)
│   │   └── .score-box→ 得分 (id=score, 0)
│   └── button#resetBtn 「重置」
├── .board#board (500×500, touch-action:none)
│   ├── #grid     → 4×4 静态格子背景
│   ├── #tiles    → 动态棋子容器（重建式渲染）
│   ├── .toast#toast    （合成「夯」提示，浮层）
│   └── .overlay#overlay → 结束面板
│       ├── #overMsg / #overSub / #overTime / button#againBtn「再来一局」
└── button#closeBtn 「×」 (右上角自绘关闭)
```

### 4.2 界面布局关键数值

| 项 | 值 |
|---|---|
| #app | 550×600，内边距 14px 25px |
| .board | 500×500，圆角 12 |
| .cell / .tile | 110×110，圆角 10 |
| GAP | 12px |
| 棋盘计算式 | `位置 = GAP + 序号 × (CELL + GAP)`，即 `12 + n×122` |

### 4.3 动画样式

| 场景 | class / keyframes | 效果 |
|---|---|---|
| 新块出现 | `.tile.appear` / `appear` | scale 0→1 + opaci(160ms) |
| 合并 | `.tile.merged` / `pop` | scale→1.28 + brightness→1.7（240ms），z-index 提升 |
| 棋子移动 | `.tile` 的 `transition` | `left/top 120ms ease` |
| 结束用时徽章 | `.overlay .time` / `timePulse` | 金色胶囊，0.9s 脉动放大强调 |
| Toast | `.toast` | 顶部淡入，1400ms 消失 |

### 4.4 颜色表（`.tile` 背景）

| 等级 | 名称 | 背景 | 前景 | 字号 |
|---|---|---|---|---|
| 0 | 拉完了 | `#eee4da` | `#776e65` | 28px |
| 1 | NPC | `#ede0c8` | `#776e65` | 32px |
| 2 | 人上人 | `#f2b179` | `#f9f6f2` | 28px |
| 3 | 顶级 | `#f59563` | `#f9f6f2` | 30px |
| 4 | 夯 | `#edc22e` | `#f9f6f2` | 36px |

---

## 5. 数据结构与核心常量

```js
var SIZE = 4;         // 网格 size（4×4）
var CELL = 110;       // 棋子/格子像素
var GAP = 12;         // 间距像素
var MAX_LEVEL = 4;    // 最高等级「夯」。

var NAMES = ['拉完了','NPC','人上人','顶级','夯'];
var STYLES = [ {bg,color,fs} × 5 ]; // 见上表

var board = [];       // board[r][c] = {level, id, row, col} | null
var score, tileId;    // 得分 / 递增全局 id
var gameOver;         // 本局是否结束
var startTime, timerInterval;  // 计时器状态
```

> **重点**：`board` 中每个棋子对象同时存 `row/col`（逻辑坐标）与 `level/id`。`row/col` 在移动时更新，供动画与查找使用。

---

## 6. 渲染与动画机制（重实现细节）

### 6.1 全量重建渲染
`render()` 每次清空 `#tiles.innerHTML` 后按 `board` 重建所有棋子 DOM。无 DOM 打补丁，简单直接。

### 6.2 移动动画双状态技巧（.tile 过渡）
`renderWithMove(oldBoard)` 是移动动画的核心，利用 CSS `transition` + **强制回流**实现滑动：
1. 先按**旧坐标**（`oldBoard`）画所有棋子；
2. `void tilesEl.offsetHeight;` **强制浏览器回流**，确保位置已应用；
3. 再按**新坐标**（`board`）重设 `left/top` → 触发 `transition` 产生滑动。

### 6.3 合并动画两段式
1. `renderWithMove` 立即完成滑动（120ms过渡）。
2. `setTimeout(130ms)` 之后给本次 `mergedNow` 中的 id 对应元素加 `.merged` 类，应用 `pop`（240ms）并刷新为合并后的新等级样式。

> 用 `mergedNow`（本次合并的棋子 id 数组）定位需要加强调的棋子。

### 6.4 胜负延迟
`setTimeout(260ms)` 在滑动+合并动画播放完后再 `spawnTile()` 与判定胜负，避免动画被新块打断。

---

## 7. 核心玩法逻辑 `move(dir)`

`dir` ∈ `up | down | left | right`。完整流程：

### 7.1 预处理
- `gameOver` 时直接 return。
- 深拷贝 `oldBoard`（仅拷贝 level/id/row/col）→ 供动画与 moves 判断。
- 记录 `oldScore`、初始化 `mergedNow=[]`、`won=false`。

### 7.2 按方向收集行/列线
对 4 条线（行或列）分别取出该线上的非空棋子数组 `line`：
```js
var t = (dir === 'up')   ? board[j][i] :
        (dir === 'down') ? board[SIZE-1-j][i] :
        (dir === 'left') ? board[i][j] :
                           board[i][SIZE-1-j];
```

### 7.3 合并规则（重点）
对每条 `line`，逐个检查：
```js
if (k+1 < line.length &&
    line[k].level === line[k+1].level &&
    line[k].level < MAX_LEVEL) {
```
- **必须**相邻、**必须**同等级、**必须** `< MAX_LEVEL`（最高级「夯」不再合并）。
- 合并时 `b`（右侧棋子）升 1 级并保留，`a`（左侧）消失，`k++` 跳过被吃掉的 `b`，避免连锁合并。
- 每次合并 `score += 10`；若合并出「夯」（`newLevel === MAX_LEVEL`）额外 `+100` 并置 `won=true`、弹 toast。

### 7.4 写回与「有效操作」判定
把合并结果按移动方向写回 `board` 对应槽位，同时：
```js
if (nt.row !== r2 || nt.col !== c2) moved = true;   // 位置变了
...
if (merged.length !== line.length) moved = true;    // 有合并发生
```
- **`moved` 为 true = 本次是有效操作**（位置变化或发生合并）。
- `if (!moved) return;`（无效操作：不生成新块、不计分、**不驱动计时器**）。

### 7.5 有效操作后的三件事
```js
if (!moved) return;            // 无效操作直接退出
startTimer();                  // ① 第一次有效操作才计时（v1.2.0）
renderWithMove(oldBoard);      // ② 驱动滑动动画
// ③ 两段式 setTimeout：合并动画 → 生成新块 / 胜负判定（见 §6.3/6.4）
```

### 7.6 生成新块 `spawnTile()`
- 从空位中随机选一格。
- `90%` 生成等级 0（拉完了），`10%` 生成等级 1（NPC）。
- 新块带 `.appear` 动画。

### 7.7 胜负判定
- **胜利**：合并出「夯」→ 结束面板「🏆 合成【夯】！」，且胜利后**不再**生成新块。
- **失败**：`isBoardFull()` 为 true（16 格全占）→ 「游戏失败 棋盘已填满」。（判定时机：每次 `spawnTile` 之后，无论下一步是否还可动。）

---

## 8. 计时器（v1.2.0 行为）

计时器实现位于 `index.html` 的 `// ---------- 计时器 ----------` 段。

### 8.1 三个状态函数
| 函数 | 作用 |
|---|---|
| `armTimer()` | 待命：`stopTimer()` + `startTime=0` + 显示 `00:00`，**不计时**。开局/重置调用。 |
| `startTimer()` | 启动：`if (timerInterval) return`（防重），`startTime=Date.now()`，`setInterval` 每 200ms 刷新 `fmtTime`。 |
| `stopTimer()` | 停止：清掉 interval，`timerInterval=null`。结束面板调用。 |
| `getElapsed()` | 已耗时；`startTime` 为 0 时返回 0（未开始或已重置）。 |

### 8.2 关键行为（本次需求）
> **计时器从「用户在本局第一次『有效操作』」才开始走。**

- `reset()` 用 `armTimer()`（而非直接 startTimer），开局停在 `00:00` 待命。
- 用户按方向键进入 `move()`；**只有 `moved===true`（有效操作）** 才会在 `move()` 内触发 `startTimer()`。
- 若开局第一手是**无效操作**（如朝已贴边的空方向按、没动任何棋子），`move()` 直接 return，不生成新块也**不计时**，继续等待第一次有效操作。
- `startTimer()` 内 `if (timerInterval) return` 保证：即使后手反复有效操作也**只启动一次**（不会重置 startTime）。

### 8.3 显示
- 顶部 stat-box「用时」实时 MM:SS（`setInterval` 200ms）。
- 结束时 `showOverlay` 先 `stopTimer()` 再用 `getElapsed()` 拼出「⏱ 用时 XX:XX」放在结束面板金色胶囊徽章。
- 若整局从未有效移动（不可能，因需有效操作推进），`getElapsed()` 为 0 → 显示 00:00。

---

## 9. 输入处理

### 9.1 键盘（`keydown`）
```js
var keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
document.addEventListener('keydown', function (e) {
  var dir = keyMap[e.key];
  if (dir) { e.preventDefault(); move(dir); }
});
```
只认四个方向键；命中则 `preventDefault` 防止浏览器滚动。

### 9.2 鼠标/触摸拖拽（pointer 事件 + 连续拖拽）
- `pointerdown` 记录起始 `{x,y}`。
- `pointermove` 计算位移：`(dx,dy)` 绝对值 `< 30px` 忽略（防误触）；否则按**位移较大方向**触发一次 `move()`。
- 触发后把 `dragStart` **重置为当前点** → 支持不抬起的连续拖拽。
- `pointerup` / `pointerleave` 清空 `dragStart`。

### 9.3 其他
- `contextmenu` 全局 `preventDefault`（禁用右键菜单）。
- `#closeBtn` → `window.close()`（自绘关闭，因无系统边框）。

---

## 10. 已知坑与排障（重打包/重装环境时务必读）

> 详细背景见 `SESSION_RECORD.md` §5；此处为要点速查。

### 10.1 npm install 证书错误
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
```

### 10.2 winCodeSign 符号链接解压失败 → 7za 包装器
`app-builder` 内置 `winCodeSign-2.6.0` 的 sha512，**禁止改包内容**。失败源于 darwin 目录下 `libcrypto.dylib / libssl.dylib` 符号链接创建权限，已用 C# 包装器替换 `7zip-bin\win\x64\7za.exe`：
- 逻辑：调用同目录 `7za_orig.exe` 透传参数；若解压命令非 0 退出且存在 `darwin` 目录则删除并返回 0。
- **重装 node_modules 会还原 `7za.exe`，需重做**：
  ```powershell
  $dir = "E:\HYTools\Project\hang2048\node_modules\7zip-bin\win\x64"
  Copy-Item "$dir\7za.exe" "$dir\7za_orig.exe" -Force
  & "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /out:"$dir\7za.exe" /target:exe "E:\HYTools\Project\hang2048\tools\7za_wrapper.cs"
  ```

### 10.3 二进制下载走 GitHub → 本地代理（缓存缺失时才需）
```powershell
node "E:\HYTools\Project\hang2048\tools\bin-proxy.js" <服务目录> 18888
$env:ELECTRON_BUILDER_BINARIES_MIRROR='http://127.0.0.1:18888/'
```
- 服务目录放 `winCodeSign-2.6.0-winCodeSign-2.6.0.7z`（5635384 字节，**原始包**）。
- 当前 winCodeSign/nsis 已缓存于 `%LOCALAPPDATA%\electron-builder\Cache\`，常规重打包**不再需要**代理。

### 10.4 图标嵌入
**不要**设 `win.signAndEditExecutable:false`，否则 `rcedit` 被跳过、自定义 icon 不生效。当前默认 true，`icon.png` 已成功嵌入。

### 10.5 受限沙箱打包 EPERM
在受限 shell 中 `npm run dist` 会因 electron-builder 内部以 pipe `spawn app-builder.exe` 报 `EPERM`。**需要完整权限**（`danger-full-access`）才能正常打包。

---

## 11. 打包命令（标准流程）

```powershell
cd E:\HYTools\Project\hang2048

# 前置环境变量（§10）
$env:PATH = "E:\HYTools\Project\hang2048\node_modules\7zip-bin\win\x64;" + $env:PATH
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
# 仅当 winCodeSign/nsis 缓存缺失：启动 tools\bin-proxy.js 并设置 ELECTRON_BUILDER_BINARIES_MIRROR

npm run dist
```

- 产物：`release\Hang2048 <version>.exe`（文件名随 version）。
- 交付副本（不覆盖旧版，文件名带版本号天然隔离）：
  ```powershell
  Copy-Item "release\Hang2048 $ver.exe" "output\" -Force
  ```
- 成功标志：`release\Hang2048 <version>.exe` 生成、exit 0。
- 单文件 portable：免安装，双击即玩。
- 运行中的旧进程：`Get-Process -Name "Hang2048*"`（必要时 Stop-Process 清理）。

---

## 12. 可扩展方向（供参考）

声明式常量驱动（`SIZE/CELL/NAMES/STYLES/MAX_LEVEL`）使以下改动成本低：
- **改合成链名称/等级数**：改 `NAMES`、`STYLES`、`MAX_LEVEL`。
- **改网格尺寸**：改 `SIZE`，其余自适应。
- **加音效**：`move` 合并点 / `spawnTile` / `showOverlay` 处挂 `Audio`。
- **存档/读档**：序列化 `board`(`id/level/row/col`) + `score` + `startTime 偏移`。
- **难度**：调 `spawnTile` 中等级分布概率（当前 90/10）。
- **排行榜/徽章**：给 `showOverlay` 增加成绩维度。

---

## 13. 版本历史

| 版本 | 内容 |
|---|---|
| 1.0.0 | 初版：4×4 合成链游戏、双操作、动画、计分、胜负规则、计时器（开局即计时）、图标打包 |
| 1.2.0 | **计时器改为首次「有效操作」才开始**；其余沿用 |

> 备注：`SESSION_RECORD.md` 与 `DEV_DOC.md` 各自独立维护。`SESSION_RECORD.md` 侧重跨会话操作记忆，本文件侧重实现细节；改代码时建议两者同步涉及的关键点。
