// ===== GAME STATE =====
const TOTAL_TO_WIN = 120;
const BONUS_EVERY = 5;
const BONUS_SECONDS = 20;
const INITIAL_TIME = 60;
const TILES_ON_BOARD = 8; // pairs count visible at once
const circumference = 2 * Math.PI * 26; // timer ring

let state = {
  score: 0,
  timeLeft: INITIAL_TIME,
  selectedTile: null,
  pairs: [],       // { id, calc, answer, calcEl, answerEl, status }
  timerInterval: null,
  running: false,
  lastBonusAt: 0,
};

// ===== DOM =====
const screens = {
  start: document.getElementById('startScreen'),
  game: document.getElementById('gameScreen'),
  win: document.getElementById('winScreen'),
  over: document.getElementById('overScreen'),
};
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const timerRing = document.getElementById('timerRing');
const boardEl = document.getElementById('board');
const selectedInfoEl = document.getElementById('selectedInfo');

// ===== PARTICLES =====
function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.setProperty('--x', Math.random() * 100 + 'vw');
    p.style.setProperty('--dur', (3 + Math.random() * 5) + 's');
    p.style.setProperty('--delay', (Math.random() * 6) + 's');
    container.appendChild(p);
  }
}

// ===== MATH GENERATION =====
function generateCalc() {
  const type = Math.random() < 0.5 ? 'mult' : 'div';
  let a, b, answer, label;
  if (type === 'mult') {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = a * b;
    label = `${a} × ${b}`;
  } else {
    b = Math.floor(Math.random() * 49) + 1;
    answer = Math.floor(Math.random() * 50) + 1;
    a = b * answer;
    label = `${a} ÷ ${b}`;
  }
  return { label, answer };
}

let pairIdCounter = 0;
function generatePairs(count) {
  const pairs = [];
  const usedAnswers = new Set();
  for (let i = 0; i < count; i++) {
    let calc;
    let attempts = 0;
    do {
      calc = generateCalc();
      attempts++;
    } while (usedAnswers.has(calc.answer) && attempts < 20);
    usedAnswers.add(calc.answer);
    pairs.push({ id: pairIdCounter++, label: calc.label, answer: calc.answer });
  }
  return pairs;
}

// ===== GRID SLOT SYSTEM =====
let gridEl = null;
let slots = [];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildGrid() {
  gridEl = document.createElement('div');
  gridEl.className = 'grid';
  slots = [];
  for (let i = 0; i < 16; i++) {
    const slot = document.createElement('div');
    slot.style.minHeight = '58px';
    gridEl.appendChild(slot);
    slots.push(slot);
  }
  boardEl.appendChild(gridEl);
}

function createTile(text, type, pairId, role) {
  const el = document.createElement('div');
  el.className = `tile type-${type} entering`;
  el.textContent = text;
  el.dataset.pairId = pairId;
  el.dataset.role = role;
  el.style.animationDelay = (Math.random() * 0.25) + 's';
  el.addEventListener('click', () => onTileClick(el));
  return el;
}

function addPairToBoard(pair) {
  const calcEl = createTile(pair.label, 'calc', pair.id, 'calc');
  const answerEl = createTile(String(pair.answer), 'answer', pair.id, 'answer');
  pair.calcEl = calcEl;
  pair.answerEl = answerEl;
  pair.status = 'active';
  const empty = shuffle(slots.filter(s => !s.firstChild));
  empty[0].appendChild(calcEl);
  empty[1].appendChild(answerEl);
  state.pairs.push(pair);
}

function initBoard() {
  boardEl.innerHTML = '';
  state.pairs = [];
  buildGrid();
  const initial = generatePairs(TILES_ON_BOARD);
  // build all tile elements and shuffle their slot assignments
  const allItems = [];
  initial.forEach(p => {
    allItems.push({ pair: p, role: 'calc' });
    allItems.push({ pair: p, role: 'answer' });
  });
  shuffle(allItems);
  allItems.forEach((item, i) => {
    const { pair, role } = item;
    const el = createTile(
      role === 'calc' ? pair.label : String(pair.answer),
      role === 'calc' ? 'calc' : 'answer',
      pair.id, role
    );
    if (role === 'calc') pair.calcEl = el;
    else pair.answerEl = el;
    slots[i].appendChild(el);
  });
  initial.forEach(p => { p.status = 'active'; state.pairs.push(p); });
}

// ===== TILE INTERACTION =====
function onTileClick(el) {
  if (!state.running) return;
  const pairId = parseInt(el.dataset.pairId);
  const role = el.dataset.role;
  const pair = state.pairs.find(p => p.id === pairId);
  if (!pair || pair.status !== 'active') return;

  if (!state.selectedTile) {
    // Select this tile
    state.selectedTile = { el, pairId, role };
    el.classList.add('selected');
    selectedInfoEl.textContent = role === 'calc'
      ? `"${el.textContent}" selecionado — agora clique na resposta!`
      : `"${el.textContent}" selecionado — agora clique na conta!`;
  } else {
    const prev = state.selectedTile;

    if (prev.el === el) {
      // Deselect same
      el.classList.remove('selected');
      state.selectedTile = null;
      selectedInfoEl.textContent = '';
      return;
    }

    // Check: must be one calc + one answer from SAME pair
    const bothSamePair = prev.pairId === pairId;
    const differentRoles = prev.role !== role;

    if (bothSamePair && differentRoles) {
      // CORRECT MATCH
      pair.status = 'matched';
      prev.el.classList.remove('selected');
      prev.el.classList.add('matched');
      el.classList.add('matched');
      state.selectedTile = null;
      selectedInfoEl.textContent = '';

      state.score += 2; // +1 per parte = +2 total
      updateScore();
      checkBonus();

      // Disappear after delay
      setTimeout(() => {
        removePairFromBoard(pair);
        // Add a new pair
        const [newPair] = generatePairs(1);
        addPairToBoard(newPair);
      }, 600);

    } else if (!bothSamePair) {
      // WRONG
      // Mark BOTH as wrong briefly
      prev.el.classList.remove('selected');
      prev.el.classList.add('wrong');
      el.classList.add('wrong');
      state.selectedTile = null;
      selectedInfoEl.textContent = '❌ Errado! Tente de novo.';

      setTimeout(() => {
        prev.el.classList.remove('wrong');
        el.classList.remove('wrong');
        selectedInfoEl.textContent = '';
      }, 700);

    } else {
      // Same pair but same role (e.g. clicked two answers) — swap selection
      prev.el.classList.remove('selected');
      state.selectedTile = { el, pairId, role };
      el.classList.add('selected');
      selectedInfoEl.textContent = role === 'calc'
        ? `"${el.textContent}" selecionado — agora clique na resposta!`
        : `"${el.textContent}" selecionado — agora clique na conta!`;
    }
  }
}

function removePairFromBoard(pair) {
  pair.calcEl.classList.add('disappearing');
  pair.answerEl.classList.add('disappearing');
  setTimeout(() => {
    pair.calcEl.remove();
    pair.answerEl.remove();
  }, 480);
  state.pairs = state.pairs.filter(p => p.id !== pair.id);
}

// ===== SCORE =====
function updateScore() {
  scoreEl.textContent = state.score;
  scoreEl.classList.remove('score-pulse');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pulse');

  if (state.score >= TOTAL_TO_WIN) {
    endGame('win');
  }
}

function checkBonus() {
  const bonusThreshold = Math.floor(state.score / (BONUS_EVERY * 2)) * (BONUS_EVERY * 2);
  // Every 5 score PAIRS = 10 points, but user gains 2 pts per match
  // Let's check: every 5 correct matches (10 pts) => bonus
  const matchCount = state.score / 2;
  const bonusAt = Math.floor(matchCount / BONUS_EVERY);
  if (bonusAt > state.lastBonusAt) {
    state.lastBonusAt = bonusAt;
    state.timeLeft += BONUS_SECONDS;
    timerEl.textContent = state.timeLeft;
    showBonus('+20s ⏱️');
  }
}

// ===== BONUS POPUP =====
function showBonus(text) {
  const el = document.createElement('div');
  el.className = 'bonus-popup';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ===== TIMER =====
function startTimer() {
  state.timeLeft = INITIAL_TIME;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      endGame('over');
    }
  }, 1000);
}

function updateTimerDisplay() {
  timerEl.textContent = state.timeLeft;
  const progress = state.timeLeft / INITIAL_TIME;
  const clamped = Math.min(1, Math.max(0, progress));
  timerRing.style.strokeDashoffset = circumference * (1 - clamped);

  if (state.timeLeft <= 10) {
    timerEl.classList.add('timer-low');
    timerRing.style.stroke = '#ef5350';
  } else if (state.timeLeft <= 20) {
    timerRing.style.stroke = '#ff9800';
    timerEl.classList.remove('timer-low');
  } else {
    timerRing.style.stroke = '#7ecf50';
    timerEl.classList.remove('timer-low');
  }
}

// ===== GAME FLOW =====
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (key === name) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
}

function startGame() {
  state.score = 0;
  state.selectedTile = null;
  state.lastBonusAt = 0;
  state.running = true;
  scoreEl.textContent = '0';
  selectedInfoEl.textContent = '';
  clearInterval(state.timerInterval);
  timerRing.style.strokeDasharray = circumference;
  timerRing.style.strokeDashoffset = 0;
  showScreen('game');
  initBoard();
  startTimer();
}

function endGame(result) {
  state.running = false;
  clearInterval(state.timerInterval);
  if (state.selectedTile) {
    state.selectedTile.el.classList.remove('selected');
    state.selectedTile = null;
  }
  if (result === 'win') {
    document.getElementById('finalScore').textContent = state.score;
    showScreen('win');
    spawnConfetti();
  } else {
    document.getElementById('overScore').textContent = state.score;
    showScreen('over');
  }
}

// ===== CONFETTI =====
function spawnConfetti() {
  const container = document.getElementById('confetti');
  container.innerHTML = '';
  const colors = ['#f5c518','#4caf50','#2196f3','#e91e63','#ff9800','#7ecf50'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.setProperty('--x', Math.random() * 100 + '%');
    p.style.setProperty('--dur', (1.5 + Math.random() * 2) + 's');
    p.style.setProperty('--delay', (Math.random() * 1.5) + 's');
    p.style.setProperty('--col', colors[Math.floor(Math.random() * colors.length)]);
    p.style.setProperty('--rot', (Math.random() * 360) + 'deg');
    p.style.setProperty('--drift', (Math.random() * 100 - 50) + 'px');
    container.appendChild(p);
  }
}

// ===== EVENT LISTENERS =====
document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnRestart').addEventListener('click', startGame);
document.getElementById('btnRestart2').addEventListener('click', startGame);

// ===== INIT =====
createParticles();
timerRing.style.strokeDasharray = circumference;
timerRing.style.strokeDashoffset = 0;
