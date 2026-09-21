'use strict';

/**
 * 冒烟测试：逻辑断言 + 界面截图。
 *   npm run smoke
 * 截图输出到 captures/，断言结果打印到控制台。
 *
 * 关键手法：测试里把 Math.random 固定为 0，
 * 这样「合并后新块落点 / 等级」完全可预测，断言可以写死。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'captures');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, extra) {
  if (!ok) failures++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   ' + extra : ''));
}

let win = null;

/**
 * 与 main.js 保持一致的窗口尺寸处理。
 * 无边框窗口在非整数缩放下 setContentSize(N) 可能得到 N+1，需要反向补偿一次。
 */
function applyContentSize(w, h) {
  win.setContentSize(w, h);
  const [aw, ah] = win.getContentSize();
  const dw = aw - w;
  const dh = ah - h;
  if (dw || dh) win.setContentSize(w - dw, h - dh);
}

ipcMain.on('resize-window', (_e, w, h) => {
  if (!win || win.isDestroyed()) return;
  applyContentSize(Math.max(120, Math.round(w)), Math.max(120, Math.round(h)));
});

const EMPTY_ROW = [null, null, null, null];
const blank = () => [EMPTY_ROW.slice(), EMPTY_ROW.slice(), EMPTY_ROW.slice(), EMPTY_ROW.slice()];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#faf8ef',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const errors = [];
  win.webContents.on('console-message', (...args) => {
    const ev = args[0];
    const level = ev && typeof ev === 'object' && 'level' in ev ? ev.level : args[1];
    const message = ev && typeof ev === 'object' && 'message' in ev ? ev.message : args[2];
    if (level === 'error' || level === 3) errors.push(String(message));
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await sleep(400);

  // 必须让窗口真正上屏：隐藏窗口的 capturePage 会漏掉合成层，
  // 而 .tile 带 transition + z-index，会被提升为独立合成层，
  // 结果就是断言全对、截图里却看不到棋子。
  win.showInactive();
  await sleep(700);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  const setup = (grid) => js(`window.__h2048.loadGrid(${JSON.stringify(grid)})`);
  const snap = () => js(`window.__h2048.snapshot()`);
  // 注意：这里的表达式必须返回可克隆的值 —— 直接写 `Math.random = fn`
  // 会让 executeJavaScript 试图回传一个函数，报 "An object could not be cloned"
  const freezeRandom = () => js(
    `(function () { window.__rand0 = Math.random; Math.random = function () { return 0; }; return true; })()`);
  const unfreezeRandom = () => js(
    `(function () { Math.random = window.__rand0; return true; })()`);

  async function moveAndSettle(dir) {
    const moved = await js(`window.__h2048.move(${JSON.stringify(dir)})`);
    await sleep(430);
    return moved;
  }

  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    const size = img.getSize();
    console.log('shot  ' + name + '.png  ' + size.width + 'x' + size.height);
  }

  const row0 = (g) => JSON.stringify(g[0]);

  /* ---------- 0. 窗口尺寸 ---------- */
  await sleep(300);
  const [cw, ch] = win.getContentSize();
  check('窗口尺寸贴合 #app (550×600)', cw === 550 && ch === 600, cw + 'x' + ch);

  /* ---------- 1. 初始局面 ---------- */
  await js(`window.__h2048.newGame()`);
  await sleep(60);
  let s = await snap();
  const filled = s.grid.flat().filter((v) => v !== null).length;
  check('开局生成 2 个初始块', filled === 2, JSON.stringify(s.grid));
  check('初始块只会是「拉完了」或「NPC」',
    s.grid.flat().every((v) => v === null || v === 0 || v === 1));
  check('开局计时器处于待命 (00:00)', s.timerStarted === false && s.timerText === '00:00', s.timerText);
  check('开局得分 0、无结束面板', s.score === 0 && s.overlay === false);
  check('开局 DOM 上正好 2 个棋子', s.tileCount === 2, 'tiles=' + s.tileCount);

  /* ---------- 2. 合成链常量 ---------- */
  const cfg = await js(`({
    size: window.__h2048.size,
    maxLevel: window.__h2048.maxLevel,
    names: window.__h2048.names,
    styles: window.__h2048.styles
  })`);
  check('4×4 网格、最高等级 4', cfg.size === 4 && cfg.maxLevel === 4);
  check('合成链 5 级且首尾正确',
    cfg.names.length === 5 && cfg.names[0] === '拉完了' && cfg.names[4] === '夯',
    cfg.names.join(' → '));
  check('每级都配了背景/前景/字号',
    cfg.styles.length === 5 && cfg.styles.every((x) => x.bg && x.color && x.fs));

  /* ---------- 3. 基本合并 ---------- */
  await setup([[0, 0, null, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await freezeRandom();
  let moved = await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('[0,0] 左移合并成 [1]', s.grid[0][0] === 1, row0(s.grid));
  check('合并一次 +10 分', s.score === 10, 'score=' + s.score);
  check('有效操作 move() 返回 true', moved === true);
  check('合并后补了 1 个新块', s.tileCount === 2, 'tiles=' + s.tileCount);

  /* ---------- 4. 不同等级不合并 = 无效操作 ---------- */
  await setup([[0, 1, null, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  moved = await moveAndSettle('left');
  s = await snap();
  check('相邻但等级不同 → 不合并', s.grid[0][0] === 0 && s.grid[0][1] === 1, row0(s.grid));
  check('贴边同行不合并属无效操作 (返回 false)', moved === false);
  check('无效操作不生成新块', s.tileCount === 2, 'tiles=' + s.tileCount);
  check('无效操作不启动计时器', s.timerStarted === false);
  check('无效操作不加分', s.score === 0);

  /* ---------- 5. 每块每回合只合并一次 ---------- */
  await setup([[0, 0, 0, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('三连相同只合一次 → [1,0]（不连锁成 2）',
    s.grid[0][0] === 1 && s.grid[0][1] === 0, row0(s.grid));
  check('三连只计一次分 (+10)', s.score === 10, 'score=' + s.score);

  await setup([[0, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('四连相同合并成两对 → [1,1]',
    s.grid[0][0] === 1 && s.grid[0][1] === 1, row0(s.grid));
  check('四连计两次分 (+20)', s.score === 20, 'score=' + s.score);

  /* ---------- 6. 「夯」不再合并 ---------- */
  await setup([[4, 4, null, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  moved = await moveAndSettle('left');
  s = await snap();
  check('两个「夯」相邻也不会合并',
    s.grid[0][0] === 4 && s.grid[0][1] === 4, row0(s.grid));
  check('「夯」相邻属无效操作、也没判胜', moved === false && s.won === false && s.gameOver === false);

  /* ---------- 7. 合成「夯」= 胜利 ---------- */
  await setup([[3, 3, null, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('合成「夯」判定胜利', s.won === true && s.gameOver === true, JSON.stringify({won: s.won, over: s.gameOver}));
  check('合出「夯」额外 +100（合计 110）', s.score === 110, 'score=' + s.score);
  check('得分显示已同步', s.scoreText === '110', s.scoreText);
  check('胜利面板弹出且文案含「夯」', s.overlay === true && s.overlayMsg.indexOf('夯') >= 0, s.overlayMsg);
  check('胜利后不再生成新块', s.tileCount === 1, 'tiles=' + s.tileCount);
  check('胜利面板显示用时', /用时 \d\d:\d\d/.test(s.overlayTime), s.overlayTime);

  await sleep(200);
  await shot('03-win');

  /* ---------- 8. 棋盘填满 = 失败 ---------- */
  const fullish = [
    [0, 0, 1, 2],
    [1, 2, 1, 2],
    [2, 3, 2, 3],
    [3, 1, 3, 0]
  ];
  await setup(fullish);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('棋盘填满判定失败', s.gameOver === true && s.won === false);
  check('失败面板文案正确', s.overlay === true && s.overlayMsg === '游戏失败', s.overlayMsg);

  // 上一局的「合成【夯】」toast 有 1.4s 生命期，等它消失再截图
  await sleep(1600);
  await shot('04-lose');

  /* ---------- 9. 「再来一局」按钮 ---------- */
  await js(`document.getElementById('againBtn').click()`);
  await sleep(80);
  s = await snap();
  check('「再来一局」重开：面板关闭、得分归零、2 个初始块',
    s.overlay === false && s.score === 0 && s.tileCount === 2,
    JSON.stringify({ overlay: s.overlay, score: s.score, tiles: s.tileCount }));

  /* ---------- 10. 计时器：第一次有效操作才启动 ---------- */
  await setup([[null, 0, null, null], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  s = await snap();
  check('操作前计时器仍未启动', s.timerStarted === false && s.timerText === '00:00');
  const t0 = Date.now();
  await js(`window.__h2048.move('left')`);
  s = await snap();
  check('第一次有效操作后计时器启动', s.timerStarted === true);
  await sleep(Math.max(0, 1300 - (Date.now() - t0)));
  s = await snap();
  check('计时器开始走字', s.timerText !== '00:00', 'timer=' + s.timerText);

  /* ---------- 11. 新块生成概率 90% / 10% ---------- */
  const dist = await js(`(() => {
    const ms = window.__h2048;
    const empty = [[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null]];
    let zero = 0, one = 0;
    for (let i = 0; i < 600; i++) {
      ms.loadGrid(empty);
      const t = ms.spawnTile();
      if (t && t.level === 1) one++; else zero++;
    }
    return { zero, one };
  })()`);
  const rate = dist.zero / (dist.zero + dist.one);
  check('新块 90% 是「拉完了」/ 10% 是「NPC」',
    rate > 0.86 && rate < 0.94,
    'level0=' + (rate * 100).toFixed(1) + '%  ' + JSON.stringify(dist));

  /* ---------- 12. 键盘方向键 ---------- */
  await setup([[null, null, null, 2], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await freezeRandom();
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  await sleep(430);
  await unfreezeRandom();
  s = await snap();
  check('键盘 ← 触发左移', s.grid[0][0] === 2, row0(s.grid));

  /* ---------- 13. 鼠标拖拽 ---------- */
  const drag = async (fromX, toX) => js(`(() => {
    const board = document.getElementById('board');
    const r = board.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fire = (type, x, y) => board.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true
    }));
    fire('pointerdown', cx, cy);
    fire('pointermove', cx + ${fromX}, cy);
    fire('pointermove', cx + ${toX}, cy);
    fire('pointerup', cx + ${toX}, cy);
    return true;
  })()`);

  await setup([[null, null, null, 2], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  await drag(0, -20);                       // 只移动 20px，低于 30px 阈值
  await sleep(120);
  s = await snap();
  check('拖拽不足 30px 不触发移动', s.grid[0][3] === 2 && s.grid[0][0] === null, row0(s.grid));

  await freezeRandom();
  await drag(0, -60);                       // 跨越阈值
  await sleep(430);
  await unfreezeRandom();
  s = await snap();
  check('拖拽超过 30px 触发左移', s.grid[0][0] === 2, row0(s.grid));

  /* ---------- 14. 重置按钮 / F2 ---------- */
  await setup([[2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]]);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  s = await snap();
  check('全 2 盘面左移后确实得分', s.score > 0, 'score=' + s.score);

  await js(`document.getElementById('resetBtn').click()`);
  await sleep(80);
  s = await snap();
  check('「重置」按钮重开：得分归零 / 2 个初始块 / 计时器待命 / 面板关闭',
    s.score === 0 && s.tileCount === 2 && s.timerStarted === false && s.overlay === false,
    JSON.stringify({ score: s.score, tiles: s.tileCount }));

  await setup([[2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]]);
  await freezeRandom();
  await moveAndSettle('left');
  await unfreezeRandom();
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))`);
  await sleep(80);
  s = await snap();
  check('F2 重开：得分归零 / 2 个初始块 / 计时器待命',
    s.score === 0 && s.tileCount === 2 && s.timerStarted === false,
    JSON.stringify({ score: s.score, tiles: s.tileCount }));

  /* ---------- 15. 截图：初始局 + 中局 ---------- */
  await js(`window.__h2048.newGame()`);
  await sleep(250);
  await shot('01-initial');

  await setup([
    [4, 3, 2, 1],
    [3, 2, 1, 0],
    [2, 1, 0, null],
    [1, 0, null, null]
  ]);
  await sleep(250);
  await shot('02-playing');

  /* ---------- 16. 无控制台错误 ---------- */
  check('渲染进程无错误日志', errors.length === 0, errors.join(' | '));

  console.log('');
  console.log(failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌');
  app.exit(failures === 0 ? 0 : 1);
}).catch((err) => {
  console.error('SMOKE CRASH', err);
  app.exit(2);
});
