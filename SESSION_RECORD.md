# SESSION RECORD — 夯048 / Hang2048 桌面游戏项目

> 本文件是给"失忆的自己"（新会话的 AI）恢复上下文的记忆转储。
> 若新会话的工作目录是父目录 E:\HYTools\Project，请先 cd 到 E:\HYTools\Project\hang2048 再操作。

---

## 0. 一句话摘要
用 Electron 构建的 2048 变体桌面游戏「夯048（英文 Hang2048）」，已打包为 Windows portable exe。
游戏规则：4×4 网格，合成链 拉完了→NPC→人上人→顶级→夯，合成「夯」即胜利，棋盘填满即失败，带计时器。
所有代码内联在 index.html，无外部 CDN。当前最新版已打包完成并验证可运行。

## 1. 项目位置与产物
- 项目根目录：`E:\HYTools\Project\hang2048\`（新会话工作目录可能是父目录 `E:\HYTools\Project`，项目在其 hang2048 子目录）
- 交付 exe：`E:\HYTools\Project\hang2048\output\Hang2048 1.0.0.exe`（约 71MB，portable 免安装，带自定义图标）
- 项目目录即 hang2048 本身，**不要**再创建二级项目文件夹

## 2. 项目文件清单
| 文件 | 说明 |
|---|---|
| `main.js` | Electron 主进程：无边框窗口 550×600、无菜单栏、loadFile('index.html') |
| `index.html` | 全部界面+CSS+游戏逻辑内联（唯一游戏代码文件，无外部资源） |
| `package.json` | electron + electron-builder；`dist` 脚本打包 `--win portable`；build.win.icon=icon.png；输出目录 release |
| `icon.png` | 512×512 游戏图标（用户提供） |
| `release/` | 打包产物（win-unpacked/ + Hang2048 1.0.0.exe） |
| `output/` | 交付 exe 副本（任务要求的最终位置） |
| `tools/7za_wrapper.cs` | C# 源码：7za 容错包装器（解决符号链接问题，见 §5.2） |
| `tools/bin-proxy.js` | node 静态/回退代理：本地优先 + GitHub 回退（解决二进制下载问题，见 §5.3） |

## 3. 游戏规格（当前已实现）
- 4×4 网格（CELL=110px, GAP=12px, board 500px）
- 合成链等级：0拉完了 → 1NPC → 2人上人 → 3顶级 → 4夯（两个同级合并升一级；「夯」为最高级不可再合）
- 操作：键盘方向键 ↑↓←→ + 鼠标拖拽滑动（pointer 事件，阈值 30px，支持连续拖）
- 合并动画：缩放+闪烁（pop 240ms，scale 1→1.28 + brightness 1→1.7）；新块 appear 动画
- 计分：每次合并 +10；合成「夯」额外 +100（toast 提示）
- **胜利条件：合成出「夯」**（结束面板：🏆 合成【夯】！恭喜通关）
- **失败条件：棋盘填满**（16 格全占即败，无论下一步是否可动；结束面板：游戏失败 棋盘已填满）
- 计时器：顶部「用时」实时显示 MM:SS（Date.now 差值，200ms 刷新）；结束时停止计时，结束面板金色胶囊徽章 `⏱ 用时 XX:XX` 带脉动动画强调
- 中文名「夯048」英文名「Hang2048」：index.html 的 `<title>` 与 h1、package.json 的 description
- package.json：name=hang2048, productName=Hang2048, appId=com.hytools.hang2048, author=HYTools

## 4. 环境
- Node v25.8.1 / npm 11.11.0
- electron 31.7.7、electron-builder 24.13.3（node_modules 已安装于项目目录）
- 7zip-bin 的 7za.exe 已被替换为 C# 包装器（原版备份为同目录 7za_orig.exe）——**这是有意为之**，见 §5.2

## 5. 关键坑与解决方案（务必保留，重打包时按此恢复）
### 5.1 npm install 证书错误
现象：`npm error RequestError: unable to verify the first certificate`
解决：安装/打包前设置
```
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
```

### 5.2 winCodeSign 解压失败（符号链接权限）—— 已用 7za 包装器解决
现象：electron-builder 打包时下载 winCodeSign-2.6.0 后用 7za 解压，因 darwin 目录下的
`libcrypto.dylib / libssl.dylib` 符号链接需要 SeCreateSymbolicLinkPrivilege 而失败
（错误：`Cannot create symbolic link : 客户端没有所需的特权`）。
- 关键认知：app-builder **内置** winCodeSign-2.6.0.7z 的 sha512，**不能修改包内容**（checksum mismatch），必须用原包。
- 解决方案：把 `node_modules\7zip-bin\win\x64\7za.exe` 换成 C# 编译的包装器：
  包装器逻辑 = 调用同目录 `7za_orig.exe` 透传全部参数；若为解压命令(x/e)且退出码非0，删除输出目录下的 darwin 目录并返回 0。
- **重装 node_modules 会还原 7za.exe，需重做包装器**。恢复步骤：
```
$dir = "<项目>\node_modules\7zip-bin\win\x64"
Copy-Item "$dir\7za.exe" "$dir\7za_orig.exe" -Force   # 原版备份（如已被还原则跳过/先还原原版）
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /out:"$dir\7za.exe" /target:exe "<项目>\tools\7za_wrapper.cs"
```
- 打包时建议把 7zip-bin 目录加入 PATH（某些 app-builder 命令按 PATH 找 7za）：
```
$env:PATH = "<项目>\node_modules\7zip-bin\win\x64;" + $env:PATH
```

### 5.3 二进制下载（winCodeSign/nsis）走 GitHub —— 可用本地代理
- electron-builder 的 app-builder 认 `ELECTRON_BUILDER_BINARIES_MIRROR`，URL 拼法：`<MIRROR>/<name>-<version>/<name>-<version>.7z`
- 需要时启动本地代理（本地优先 + GitHub 回退，监听 127.0.0.1:18888）：
```
node "<项目>\tools\bin-proxy.js" <服务目录> 18888
```
  服务目录需放 `winCodeSign-2.6.0\winCodeSign-2.6.0.7z`（**原始包**！可从 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\*.7z` 复制，特征是大小 5635384 字节；不要用修改过的包，会 checksum mismatch）
```
$env:ELECTRON_BUILDER_BINARIES_MIRROR='http://127.0.0.1:18888/'
```
- **当前状态**：winCodeSign 与 nsis 工具均已缓存成功（%LOCALAPPDATA%\electron-builder\Cache\），常规重打包**不再需要代理**；仅当缓存被清或换机器时才需要上述流程。

### 5.4 signAndEditExecutable 与图标
- **不要**设置 `win.signAndEditExecutable: false`——那会跳过 rcedit，自定义 icon 不生效。
- 当前 package.json 未设置该字段（默认 true），icon.png 已成功嵌入 exe（已验证 ProductName=Hang2048、图标可提取、图案与源一致）。

## 6. 打包命令（在项目目录执行）
```
npm run dist
```
推荐前置环境变量（打包前设置）：
```
$env:PATH = "E:\HYTools\Project\hang2048\node_modules\7zip-bin\win\x64;" + $env:PATH
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
# 仅当 winCodeSign/nsis 缓存缺失时：启动 tools\bin-proxy.js 并设置
# $env:ELECTRON_BUILDER_BINARIES_MIRROR='http://127.0.0.1:18888/'
```
打包成功标志：`release\Hang2048 1.0.0.exe` 生成、exit code 0。之后复制到 output：
```
Copy-Item "release\Hang2048 1.0.0.exe" "output\" -Force
```

## 7. 当前状态（导出时）
- 最新版 exe 已在 `output\`，功能包含：图标、计时器、胜利/失败规则、合并动画、计分。
- 已验证：JS 语法通过、打包 exit 0、游戏启动正常、图标嵌入成功。
- 运行中的游戏进程：`Get-Process -Name "Hang2048*"`（可能有旧实例残留，必要时 Stop-Process 清理后重启最新版）。

## 8. 用户偏好与约束（红线）
- 全自动执行，不要反过来叫用户操作。
- 不生成任何 .bat / .sh 打包脚本。
- index.html 内联全部代码，不引用外部 CDN。
- 项目目录就是 hang2048 本身，不建二级目录。
- 名称：中文「夯048」、英文「Hang2048」（用户可能再改，动手前先核对）。
- 用户当前会话意图：切换工作目录到父目录 E:\HYTools\Project 后新建会话，本文件用于新会话恢复。

## 9. 推测的后续方向（仅供参考）
- 用户可能继续加功能：音效、存档/读档、难度、更多动画、排行榜等。
- 若用户改了游戏名/规则，注意同步改 index.html（标题/界面）与 package.json（name/productName/description），并重新打包。
