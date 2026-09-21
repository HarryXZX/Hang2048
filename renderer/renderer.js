'use strict';

/* ==========================================================================
   夯048 · Hang2048 —— 游戏逻辑与渲染
   ========================================================================== */

/* ---------------- 配置 ---------------- */
const SIZE = 4;        // 4×4 网格
const CELL = 110;      // 格子边长 px
const GAP = 12;        // 格子间距 px
const MAX_LEVEL = 4;   // 最高等级「夯」

// 合成链：等级 -> 名称
const NAMES = ['拉完了', 'NPC', '人上人', '顶级', '夯'];

// 每个等级的外观
const STYLES = [
  { bg: '#eee4da', color: '#776e65', fs: '28px' },  // 拉完了
  { bg: '#ede0c8', color: '#776e65', fs: '32px' },  // NPC
  { bg: '#f2b179', color: '#f9f6f2', fs: '28px' },  // 人上人
  { bg: '#f59563', color: '#f9f6f2', fs: '30px' },  // 顶级
  { bg: '#edc22e', color: '#f9f6f2', fs: '36px' }   // 夯
];

const SPAWN_LEVEL0_RATE = 0.9;  // 新块 90% 是「拉完了」，10% 是「NPC」
const MERGE_SCORE = 10;         // 每次合并得分
const GOAL_SCORE = 100;         // 合成「夯」额外得分
const DRAG_THRESHOLD = 30;      // 拖拽触发移动的位移阈值 px

const DELAY_MERGE = 130;        // 滑动结束 -> 播放合并动画
const DELAY_SPAWN = 260;        // 滑动结束 -> 生成新块 / 判定胜负

/* ---------------- DOM ---------------- */
const appEl = document.getElementById('app');
const boardEl = document.getElementById('board');
const gridEl = document.getElementById('grid');
const tilesEl = document.getElementById('tiles');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const overlayEl = document.getElementById('overlay');
const toastEl = document.getElementById('toast');
const overMsgEl = document.getElementById('overMsg');
const overSubEl = document.getElementById('overSub');
const overTimeEl = document.getElementById('overTime');
const againBtnEl = document.getElementById('againBtn');
const resetBtnEl = document.getElementById('resetBtn');
const closeBtnEl = document.getElementById('closeBtn');

/* ---------------- 状态 ---------------- */
let board = [];          // board[r][c] = { level, id, row, col } | null
let score = 0;           // 本局得分
let tileId = 0;          // 递增的棋子 id
let gameOver = false;    // 本局是否已结束
let won = false;         // 是否已合成「夯」
let toastTimer = null;
let startTime = 0;       // 第一次有效操作的时间戳；0 = 计时器待命
let timerInterval = null;
let dragStart = null;

const pos = (n) => GAP + n * (CELL + GAP);

/* ==========================================================================
   计时器
   ========================================================================== */

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

/** 开局/重置：进入「待命」状态（显示 00:00，但不计时） */
function armTimer() {
  stopTimer();
  startTime = 0;
  timerEl.textContent = '00:00';
}

/** 第一次有效操作才真正开始计时；重复调用不会重置起点 */
function startTimer() {
  if (timerInterval) return;
  startTime = Date.now();
  timerInterval = setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - startTime);
  }, 200);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function getElapsed() {
  return startTime ? Date.now() - startTime : 0;
}

/* ==========================================================================
   渲染
   ========================================================================== */

/** 静态网格背景，只需建一次 */
function buildGrid() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = pos(c) + 'px';
      cell.style.top = pos(r) + 'px';
      gridEl.appendChild(cell);
    }
  }
}

function tileElement(t) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = t.id;
  el.style.width = CELL + 'px';
  el.style.height = CELL + 'px';
  el.style.left = pos(t.col) + 'px';
  el.style.top = pos(t.row) + 'px';
  applyStyle(el, t.level);
  return el;
}

function applyStyle(el, level) {
  const s = STYLES[level];
  el.style.background = s.bg;
  el.style.color = s.color;
  el.style.fontSize = s.fs;
  el.textContent = NAMES[level];
}

/** 无动画全量重建 */
function render() {
  tilesEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c]) tilesEl.appendChild(tileElement(board[r][c]));
    }
  }
}

/**
 * 带滑动动画的渲染：先按旧坐标画，强制回流后再切到新坐标，
 * 由 CSS transition(left/top 120ms) 产生滑动效果。
 */
function renderWithMove(oldBoard) {
  tilesEl.innerHTML = '';

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = board[r][c];
      if (!t) continue;
      const el = tileElement(t);
      const from = oldBoard[r][c];
      el.style.left = pos(from ? from.col : t.col) + 'px';
      el.style.top = pos(from ? from.row : t.row) + 'px';
      tilesEl.appendChild(el);
    }
  }

  void tilesEl.offsetHeight; // 强制回流：确保旧坐标已生效

  for (let i = 0; i < tilesEl.children.length; i++) {
    const el = tilesEl.children[i];
    const t = findTileById(parseInt(el.dataset.id, 10));
    if (!t) continue;
    el.style.left = pos(t.col) + 'px';
    el.style.top = pos(t.row) + 'px';
  }
}

function findTileById(id) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = board[r][c];
      if (t && t.id === id) return t;
    }
  }
  return null;
}

/* ==========================================================================
   移动与合并
   ========================================================================== */

/**
 * 方向移动。dir ∈ 'up' | 'down' | 'left' | 'right'
 * 返回是否有效操作（用于测试；动画与生成走 setTimeout）
 */
function move(dir) {
  if (gameOver) return false;

  // 旧状态快照：滑动动画起点 + 「是否有效操作」判定
  const oldBoard = board.map((row) =>
    row.map((t) => (t ? { level: t.level, id: t.id, row: t.row, col: t.col } : null))
  );
  const mergedNow = []; // 本次合并后保留的棋子 id
  let moved = false;

  for (let i = 0; i < SIZE; i++) {
    // 取出一条线（自移动方向起算）上的非空棋子
    const line = [];
    for (let j = 0; j < SIZE; j++) {
      const t = dir === 'up' ? board[j][i]
        : dir === 'down' ? board[SIZE - 1 - j][i]
          : dir === 'left' ? board[i][j]
            : board[i][SIZE - 1 - j];
      if (t) line.push(t);
    }

    // 相邻且同等级才合并；每块每回合只参与一次；「夯」不再合并
    const merged = [];
    for (let k = 0; k < line.length; k++) {
      const cur = line[k];
      const nxt = line[k + 1];
      if (nxt && cur.level === nxt.level && cur.level < MAX_LEVEL) {
        const newLevel = cur.level + 1;
        score += MERGE_SCORE;
        if (newLevel === MAX_LEVEL) {
          score += GOAL_SCORE;
          won = true;
          showToast('🏆 合成【夯】！+100');
        }
        nxt.level = newLevel; // 保留靠移动方向的那块，当前块被吃掉
        merged.push(nxt);
        mergedNow.push(nxt.id);
        k++;                  // 跳过被吃掉的块，避免连锁合并
      } else {
        merged.push(cur);
      }
    }
    if (merged.length !== line.length) moved = true;

    // 写回棋盘
    for (let m = 0; m < SIZE; m++) {
      const r = dir === 'up' ? m : dir === 'down' ? SIZE - 1 - m : i;
      const c = dir === 'left' ? m : dir === 'right' ? SIZE - 1 - m : i;
      const t = merged[m] || null;
      if (t) {
        if (t.row !== r || t.col !== c) moved = true;
        t.row = r;
        t.col = c;
      }
      board[r][c] = t;
    }
  }

  if (!moved) return false; // 无效操作：不生成新块、不计分、也不启动计时

  startTimer();             // 第一次有效操作才开始计时
  renderWithMove(oldBoard);

  // ① 滑动结束 → 合并动画
  setTimeout(() => {
    for (let i = 0; i < tilesEl.children.length; i++) {
      const el = tilesEl.children[i];
      const id = parseInt(el.dataset.id, 10);
      if (mergedNow.indexOf(id) === -1) continue;
      const t = findTileById(id);
      if (!t) continue;
      el.classList.add('merged');
      applyStyle(el, t.level);
    }
  }, DELAY_MERGE);

  // ② 动画播完 → 生成新块 / 判定胜负
  setTimeout(() => {
    if (won) {
      gameOver = true;
      updateScore();
      showOverlay('🏆 合成【夯】！', '恭喜通关，达成最高等级', '再来一局');
      return; // 获胜后不再生成新块
    }
    spawnTile();
    updateScore();
    if (isBoardFull()) {
      gameOver = true;
      showOverlay('游戏失败', '棋盘已填满', '再来一局');
    }
  }, DELAY_SPAWN);

  return true;
}

/** 在随机空位生成新块 */
function spawnTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return null;

  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const level = Math.random() < SPAWN_LEVEL0_RATE ? 0 : 1;
  const t = { id: ++tileId, level, row: r, col: c };
  board[r][c] = t;

  const el = tileElement(t);
  el.classList.add('appear');
  tilesEl.appendChild(el);
  return t;
}

function isBoardFull() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) return false;
    }
  }
  return true;
}

/* ==========================================================================
   界面
   ========================================================================== */

function updateScore() {
  scoreEl.textContent = score;
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

function showOverlay(msg, sub, btn) {
  stopTimer();
  overMsgEl.textContent = msg;
  overSubEl.textContent = sub;
  againBtnEl.textContent = btn;
  overTimeEl.textContent = '⏱ 用时 ' + fmtTime(getElapsed());
  overlayEl.classList.add('show');
}

function hideOverlay() {
  overlayEl.classList.remove('show');
}

/* ==========================================================================
   开局 / 重置
   ========================================================================== */

function reset() {
  board = [];
  for (let r = 0; r < SIZE; r++) {
    board.push(new Array(SIZE).fill(null));
  }
  score = 0;
  gameOver = false;
  won = false;
  dragStart = null;
  hideOverlay();
  updateScore();
  render();
  armTimer();   // 待命：等第一次有效操作才计时
  spawnTile();
  spawnTile();
}

/* ==========================================================================
   输入
   ========================================================================== */

const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

document.addEventListener('keydown', (e) => {
  const dir = KEY_MAP[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
    return;
  }
  if (e.key === 'F2') {
    e.preventDefault();
    reset();
  }
});

boardEl.addEventListener('pointerdown', (e) => {
  dragStart = { x: e.clientX, y: e.clientY };
});

boardEl.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? 'right' : 'left');
  } else {
    move(dy > 0 ? 'down' : 'up');
  }
  dragStart = { x: e.clientX, y: e.clientY }; // 支持不抬起手指的连续拖拽
});

boardEl.addEventListener('pointerup', () => { dragStart = null; });
boardEl.addEventListener('pointerleave', () => { dragStart = null; });

document.addEventListener('contextmenu', (e) => e.preventDefault());

resetBtnEl.addEventListener('click', reset);
againBtnEl.addEventListener('click', reset);

closeBtnEl.addEventListener('click', () => {
  if (window.desktop && typeof window.desktop.closeWindow === 'function') {
    window.desktop.closeWindow();
  } else {
    window.close();
  }
});

/* ==========================================================================
   窗口尺寸自适应（与扫雷项目同一套做法）
   ========================================================================== */

function syncWindowSize() {
  if (!window.desktop || typeof window.desktop.resize !== 'function') return;
  // 同步读取会强制完成布局，比 requestAnimationFrame 可靠
  const r = appEl.getBoundingClientRect();
  window.desktop.resize(Math.ceil(r.width), Math.ceil(r.height));
}

/* ==========================================================================
   启动
   ========================================================================== */

function init() {
  buildGrid();
  reset();
  syncWindowSize();
}

init();

/* ==========================================================================
   自动化测试钩子
   ========================================================================== */

window.__h2048 = {
  size: SIZE,
  maxLevel: MAX_LEVEL,
  names: NAMES.slice(),
  styles: STYLES.map((s) => ({ bg: s.bg, color: s.color, fs: s.fs })),

  newGame: reset,
  move,
  spawnTile,

  /** 直接摆一个盘面（null 表示空位），用于确定性测试 */
  loadGrid(grid) {
    board = [];
    for (let r = 0; r < SIZE; r++) {
      board.push([]);
      for (let c = 0; c < SIZE; c++) {
        const lv = grid && grid[r] ? grid[r][c] : null;
        board[r].push(lv === null || lv === undefined
          ? null
          : { id: ++tileId, level: lv, row: r, col: c });
      }
    }
    score = 0;
    gameOver = false;
    won = false;
    dragStart = null;
    hideOverlay();
    updateScore();
    render();
    armTimer();
  },

  snapshot() {
    const grid = [];
    const ids = [];
    for (let r = 0; r < SIZE; r++) {
      grid.push([]);
      ids.push([]);
      for (let c = 0; c < SIZE; c++) {
        const t = board[r][c];
        grid[r].push(t ? t.level : null);
        ids[r].push(t ? t.id : null);
      }
    }
    return {
      grid,
      ids,
      score,
      scoreText: scoreEl.textContent,
      gameOver,
      won,
      timerStarted: !!startTime,
      timerText: timerEl.textContent,
      elapsed: getElapsed(),
      overlay: overlayEl.classList.contains('show'),
      overlayMsg: overMsgEl.textContent,
      overlaySub: overSubEl.textContent,
      overlayTime: overTimeEl.textContent,
      tileCount: tilesEl.children.length,
      dragging: !!dragStart
    };
  }
};
