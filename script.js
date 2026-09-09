const RANKS = [
  { name:'Unranked', min:0 },
  { name:'Bronze',   min:1 },
  { name:'Silver',   min:5 },
  { name:'Gold',     min:12 },
  { name:'Platinum', min:25 },
  { name:'Diamond',  min:45 },
];

const OPPONENT_NAMES = ['RootRunner','ZeroSum','PrimeShift','NullVector','FluxDelta','EchoDigit','ByteRadical','NovaFraction'];

const state = {
  user: null,
  pendingAuthProvider: null,
  selectedMode: null,
  practiceDifficulty: 'medium',
  lobbyCode: null,
  isHost: false,
  opponentName: null,
  match: null,
};

function $(id){ return document.getElementById(id); }
function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function showScreen(id){
  qsa('.screen').forEach(s => s.classList.remove('active'));
  const target = $(id);
  if (target) target.classList.add('active');
}
function openModal(id){
  const modal = $(id);
  if (modal) modal.classList.add('active');
}
function closeModal(id){
  const modal = $(id);
  if (modal) modal.classList.remove('active');
}

function randomFriendCode(){
  const n = () => Math.floor(1000 + Math.random()*9000);
  return `CB-${n()}-${n()}`;
}
function randomLobbyCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<7;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function randomGuestName(){
  const adjectives = ['Cyber', 'Nano', 'Byte', 'Mega', 'Hyper', 'Quantum', 'Void', 'Vector'];
  const nouns = ['Player', 'Hacker', 'Coder', 'Runner', 'Matrix', 'Digit', 'Scalar', 'Kernel'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}${noun}${num}`;
}
function rankForWins(wins){
  let r = RANKS[0];
  for(const rank of RANKS) if (wins >= rank.min) r = rank;
  return r.name;
}
function fmtNum(n){
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString();
}

function initBackground(){
  const canvas = $('bg-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  function resize(){ w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const glyphs = '+-×÷=∑√π%'.split('');
  const particles = Array.from({length: 34}, () => ({
    x: Math.random()*1, y: Math.random()*1,
    s: 14 + Math.random()*20,
    v: 0.00008 + Math.random()*0.00012,
    g: glyphs[Math.floor(Math.random()*glyphs.length)],
    o: 0.04 + Math.random()*0.08,
  }));

  function frame(){
    ctx.clearRect(0,0,w,h);
    ctx.font = '400 20px Space Mono, monospace';
    ctx.textAlign = 'center';
    for(const p of particles){
      p.y -= p.v;
      if (p.y < -0.05) p.y = 1.05;
      ctx.fillStyle = `rgba(140,160,255,${p.o})`;
      ctx.font = `400 ${p.s}px Space Mono, monospace`;
      ctx.fillText(p.g, p.x * w, p.y * h);
    }
    requestAnimationFrame(frame);
  }
  frame();
}

function loginAsGuest(){
  const name = randomGuestName();
  state.user = {
    name,
    avatar: name.charAt(0).toUpperCase(),
    wins: Math.floor(Math.random()*8),
    losses: Math.floor(Math.random()*8),
    friendCode: randomFriendCode(),
  };
  closeModal('modal-name');
  renderUserChrome();
  showScreen('screen-menu');
}

function renderUserChrome(){
  const u = state.user;
  if (!u) return;
  const rank = rankForWins(u.wins);
  [ ['menu-avatar','avatar'], ['lobby-avatar','avatar'], ['profile-avatar','avatar'] ].forEach(([id]) => {
    if ($(id)) $(id).textContent = u.avatar;
  });
  if($('menu-username')) $('menu-username').textContent = u.name;
  if($('menu-rank')) $('menu-rank').textContent = rank;
  if($('lobby-username')) $('lobby-username').textContent = u.name;
  if($('lobby-rank')) $('lobby-rank').textContent = rank;
  if($('profile-username')) $('profile-username').textContent = u.name;
  if($('profile-rank')) $('profile-rank').textContent = rank;
  if($('profile-friendcode')) $('profile-friendcode').textContent = u.friendCode;
  const total = u.wins + u.losses;
  if($('stat-wins')) $('stat-wins').textContent = u.wins;
  if($('stat-losses')) $('stat-losses').textContent = u.losses;
  if($('stat-wr')) $('stat-wr').textContent = total ? Math.round((u.wins/total)*100) + '%' : '0%';
}

function initLobby(){
  qsa('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const available = card.dataset.available === 'true';
      if (!available) return;
      qsa('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedMode = card.dataset.mode;
      const btn = $('btn-deploy');
      if (!btn) return;
      btn.disabled = false;
      if(state.selectedMode === 'practice'){
        btn.textContent = 'Deploy — Practice';
      } else if(state.selectedMode === 'casual'){
        btn.textContent = 'Deploy — Casual Queue';
      } else {
        btn.textContent = 'Deploy — Private Match';
      }
    });
  });

  const deployBtn = $('btn-deploy');
  if(deployBtn){
    deployBtn.addEventListener('click', () => {
      if (!state.selectedMode) return;
      if (state.selectedMode === 'practice'){
        openModal('modal-practice-diff');
      } else {
        openMatchmaking();
      }
    });
  }

  qsa('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.practiceDifficulty = btn.dataset.diff;
      closeModal('modal-practice-diff');
      launchPracticeBattle();
    });
  });
}

function resetMatchmakingPanels(){
  if($('mm-choice')) $('mm-choice').style.display = '';
  if($('mm-create')) $('mm-create').style.display = 'none';
  if($('mm-join')) $('mm-join').style.display = 'none';
  if($('mm-found')) $('mm-found').style.display = 'none';
}

function openMatchmaking(){
  resetMatchmakingPanels();
  if($('mm-title')) $('mm-title').textContent = state.selectedMode === 'ranked' ? 'Ranked queue' : 'Casual queue';
  openModal('modal-matchmaking');
}

function buildCodeInputs(){
  const row = $('code-input-row');
  if (!row) return;
  row.innerHTML = '';
  const inputs = [];
  for(let i=0;i<7;i++){
    const inp = document.createElement('input');
    inp.maxLength = 1;
    inp.autocomplete = 'off';
    inputs.push(inp);
    row.appendChild(inp);
    inp.addEventListener('input', () => {
      inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
      if (inp.value && i < 6) inputs[i+1].focus();
      checkCodeComplete(inputs);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i-1].focus();
    });
  }
  setTimeout(() => inputs[0].focus(), 50);
}
function checkCodeComplete(inputs){
  const full = inputs.every(i => i.value.length === 1);
  if($('btn-connect-code')) $('btn-connect-code').disabled = !full;
}

function initMatchmakingUI(){
  const createLobbyBtn = $('btn-create-lobby');
  if(createLobbyBtn){
    createLobbyBtn.addEventListener('click', () => {
      state.isHost = true;
      state.lobbyCode = randomLobbyCode();
      if($('lobby-code-display')) $('lobby-code-display').textContent = state.lobbyCode;
      if($('mm-choice')) $('mm-choice').style.display = 'none';
      if($('mm-create')) $('mm-create').style.display = '';
      const waitMs = 2200 + Math.random()*1800;
      state.mmTimeout = setTimeout(() => {
        state.opponentName = OPPONENT_NAMES[Math.floor(Math.random()*OPPONENT_NAMES.length)];
        if($('mm-create')) $('mm-create').style.display = 'none';
        if($('mm-found')) $('mm-found').style.display = '';
        if($('mm-found-name')) $('mm-found-name').textContent = `${state.opponentName} joined using your code`;
        setTimeout(() => { closeModal('modal-matchmaking'); launchBattle(); }, 1400);
      }, waitMs);
    });
  }

  const joinLobbyBtn = $('btn-join-lobby');
  if(joinLobbyBtn){
    joinLobbyBtn.addEventListener('click', () => {
      state.isHost = false;
      if($('mm-choice')) $('mm-choice').style.display = 'none';
      if($('mm-join')) $('mm-join').style.display = '';
      buildCodeInputs();
    });
  }

  const connectCodeBtn = $('btn-connect-code');
  if(connectCodeBtn){
    connectCodeBtn.addEventListener('click', () => {
      if($('mm-join')) $('mm-join').style.display = 'none';
      if($('mm-found')) $('mm-found').style.display = '';
      if($('mm-found-name')) $('mm-found-name').textContent = 'Connecting to host…';
      state.opponentName = OPPONENT_NAMES[Math.floor(Math.random()*OPPONENT_NAMES.length)];
      setTimeout(() => {
        if($('mm-found-name')) $('mm-found-name').textContent = `Matched with ${state.opponentName}`;
      }, 900);
      setTimeout(() => { closeModal('modal-matchmaking'); launchBattle(); }, 2000);
    });
  }

  if($('btn-cancel-create')) $('btn-cancel-create').addEventListener('click', () => { clearTimeout(state.mmTimeout); resetMatchmakingPanels(); });
  if($('btn-cancel-join')) $('btn-cancel-join').addEventListener('click', resetMatchmakingPanels);
}

const MATCH_SECONDS = 240;
const OVERFLOW_AT = 120;
const OVERFLOW_DURATION = 30;

function randomTarget(){
  const sign = Math.random() < 0.5 ? -1 : 1;
  let magnitude;
  if (state.selectedMode === 'practice') {
    if (state.practiceDifficulty === 'easy') magnitude = Math.floor(Math.random()*15) + 1;
    else if (state.practiceDifficulty === 'hard') magnitude = Math.random()*120;
    else magnitude = Math.floor(Math.random()*45) + 5;
  } else {
    magnitude = Math.random() < 0.6 ? Math.floor(Math.random()*30) : Math.random()*80;
  }
  let val = sign * magnitude;
  const decimals = (state.selectedMode === 'practice' && state.practiceDifficulty === 'easy') ? 0 : (Math.random() < 0.5 ? 0 : (Math.random() < 0.7 ? 1 : 2));
  val = Math.round(val * Math.pow(10,decimals)) / Math.pow(10,decimals);
  if (val === 0) val = sign * 1;
  return val;
}

function parseCalcExpr(raw){
  const s = (raw || '').replace(/\s+/g, '');
  if (!s) return null;
  let pos = 0;
  const peek = () => s[pos];

  function parseNumber(){
    const start = pos;
    if (s[pos] === '-') pos++;
    const digitsStart = pos;
    while (pos < s.length && /[0-9.]/.test(s[pos])) pos++;
    if (pos === digitsStart) throw 0;
    return { type:'num', value: parseFloat(s.slice(start, pos)) };
  }
  function parseFactor(){
    if (peek() === '-'){
      pos++;
      return { type:'bin', op:'*', unary:true, left:{type:'num',value:-1}, right:parseFactor() };
    }
    if (peek() === '('){
      pos++;
      const inner = parseAdd();
      if (peek() !== ')') throw 0;
      pos++;
      return inner;
    }
    return parseNumber();
  }
  function parseMul(){
    let node = parseFactor();
    while (peek() === '*' || peek() === '/'){
      const op = peek(); pos++;
      node = { type:'bin', op, left:node, right:parseFactor() };
    }
    return node;
  }
  function parseAdd(){
    let node = parseMul();
    while (peek() === '+' || peek() === '-'){
      const op = peek(); pos++;
      node = { type:'bin', op, left:node, right:parseMul() };
    }
    return node;
  }
  try{
    const tree = parseAdd();
    if (pos !== s.length) return null;
    return tree;
  }catch(e){ return null; }
}

function evalNode(node){
  if (node.type === 'num') return node.value;
  const l = evalNode(node.left), r = evalNode(node.right);
  if (node.op === '+') return l + r;
  if (node.op === '-') return l - r;
  if (node.op === '*') return l * r;
  if (node.op === '/') return l / r;
}

function hasRealOperation(node){
  if (node.type !== 'bin') return false;
  if (!node.unary) return true;
  return hasRealOperation(node.left) || hasRealOperation(node.right);
}
const isZero = n => n.type === 'num' && Math.abs(n.value) < 1e-9;
const isOne  = n => n.type === 'num' && Math.abs(n.value - 1) < 1e-9;

function findFreebie(node){
  if (node.type !== 'bin') return false;
  if (!node.unary){
    if (node.op === '+' && (isZero(node.left) || isZero(node.right))) return true;
    if (node.op === '-' && isZero(node.right)) return true;
    if (node.op === '*' && (isOne(node.left) || isOne(node.right))) return true;
    if (node.op === '/' && isOne(node.right)) return true;
  }
  return findFreebie(node.left) || findFreebie(node.right);
}

function evalExpr(expr){
  const tree = parseCalcExpr(expr);
  if (!tree) return null;
  const val = evalNode(tree);
  return isFinite(val) ? val : null;
}

function launchBattle(){
  const u = state.user;
  if($('battle-my-avatar')) $('battle-my-avatar').textContent = u.avatar;
  if($('battle-my-name')) $('battle-my-name').textContent = u.name;
  if($('battle-opp-avatar')) $('battle-opp-avatar').textContent = (state.opponentName||'O').charAt(0);
  if($('battle-opp-name')) $('battle-opp-name').textContent = state.opponentName || 'Opponent';
  if($('battle-my-score')) $('battle-my-score').textContent = '0';
  if($('battle-opp-score')) $('battle-opp-score').textContent = '0';
  if($('clash-bar-fill')) $('clash-bar-fill').style.width = '50%';
  if($('overflow-banner')) $('overflow-banner').classList.remove('active');
  if($('battle-feed')) $('battle-feed').innerHTML = '';

  state.match = {
    myScore: 0,
    oppScore: 0,
    timeLeft: MATCH_SECONDS,
    target: 0,
    roundSolved: false,
    overflowActive: false,
    overflowUsed: false,
    overflowSecondsLeft: 0,
    expr: '',
    tickId: null,
    oppTimeoutId: null,
  };

  resetCalc();
  showScreen('screen-battle');
  nextRound();
  state.match.tickId = setInterval(tick, 1000);
  updateTimerDisplay();
}

function launchPracticeBattle(){
  state.opponentName = 'Training Bot';
  launchBattle();
}

function nextRound(){
  const m = state.match;
  if (!m) return;
  m.roundSolved = false;
  m.target = randomTarget();
  resetCalc();
  const el = $('target-number');
  if(!el) return;
  el.textContent = fmtNum(m.target);
  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');
  scheduleOpponent();
}

function scheduleOpponent(){
  const m = state.match;
  if(!m) return;
  clearTimeout(m.oppTimeoutId);
  const attempt = () => {
    if (!m || m.roundSolved || m.timeLeft <= 0) return;
    const botChance = state.selectedMode === 'practice' 
      ? (state.practiceDifficulty === 'easy' ? 0.55 : state.practiceDifficulty === 'hard' ? 0.90 : 0.75) 
      : 0.82;
    const succeeds = Math.random() < botChance;
    if (succeeds){
      opponentScores();
    } else {
      pushFeed(`${state.opponentName} misfired`, 'wrong');
      const delay = state.selectedMode === 'practice' && state.practiceDifficulty === 'easy' ? 2500 : 1400;
      m.oppTimeoutId = setTimeout(attempt, delay + Math.random()*2200);
    }
  };
  const baseDelay = state.selectedMode === 'practice' && state.practiceDifficulty === 'easy' ? 3500 : 2200;
  m.oppTimeoutId = setTimeout(attempt, baseDelay + Math.random()*4200);
}

function opponentScores(){
  const m = state.match;
  if (!m || m.roundSolved) return;
  m.roundSolved = true;
  const mult = m.overflowActive ? 2 : 1;
  const points = (100 + 50) * mult;
  m.oppScore += points;
  if($('battle-opp-score')) $('battle-opp-score').textContent = m.oppScore;
  bump('battle-opp-score');
  pushFeed(`${state.opponentName} +${points}`, 'theirs');
  updateClashBar();
  setTimeout(nextRound, 900);
}

function playerScores(){
  const m = state.match;
  if(!m) return;
  m.roundSolved = true;
  clearTimeout(m.oppTimeoutId);
  const mult = m.overflowActive ? 2 : 1;
  const points = (100 + 50) * mult;
  m.myScore += points;
  if($('battle-my-score')) $('battle-my-score').textContent = m.myScore;
  bump('battle-my-score');
  pushFeed(`You +${points}`, 'mine');
  updateClashBar();
  const subBtn = $('btn-submit');
  if(subBtn){
    subBtn.classList.remove('correct-flash');
    void subBtn.offsetWidth;
    subBtn.classList.add('correct-flash');
  }
  setTimeout(nextRound, 900);
}

function bump(id){
  const el = $(id);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function updateClashBar(){
  const m = state.match;
  if(!m) return;
  const total = m.myScore + m.oppScore;
  const pct = total === 0 ? 50 : (m.myScore/total)*100;
  if($('clash-bar-fill')) $('clash-bar-fill').style.width = pct + '%';
}

function pushFeed(text, cls){
  const feed = $('battle-feed');
  if(!feed) return;
  const item = document.createElement('div');
  item.className = 'feed-item ' + cls;
  item.textContent = text;
  feed.appendChild(item);
  setTimeout(() => item.remove(), 1600);
}

function tick(){
  const m = state.match;
  if (!m) return;
  m.timeLeft--;

  if (!m.overflowUsed && m.timeLeft === OVERFLOW_AT){
    triggerOverflow();
  }
  if (m.overflowActive){
    m.overflowSecondsLeft--;
    if($('overflow-time')) $('overflow-time').textContent = m.overflowSecondsLeft;
    if (m.overflowSecondsLeft <= 0){
      m.overflowActive = false;
      if($('overflow-banner')) $('overflow-banner').classList.remove('active');
    }
  }

  updateTimerDisplay();
  if (m.timeLeft <= 0){
    endMatch();
  }
}

function triggerOverflow(){
  const m = state.match;
  if(!m) return;
  m.overflowUsed = true;
  m.overflowActive = true;
  m.overflowSecondsLeft = OVERFLOW_DURATION;
  if($('overflow-time')) $('overflow-time').textContent = m.overflowSecondsLeft;
  if($('overflow-banner')) $('overflow-banner').classList.add('active');
  const flash = $('overflow-flash');
  if(flash){
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
  }
}

function updateTimerDisplay(){
  const m = state.match;
  if(!m) return;
  const t = Math.max(0, m.timeLeft);
  const mm = Math.floor(t/60);
  const ss = (t%60).toString().padStart(2,'0');
  if($('match-timer')) $('match-timer').textContent = `${mm}:${ss}`;
}

function endMatch(){
  const m = state.match;
  if(!m) return;
  clearInterval(m.tickId);
  clearTimeout(m.oppTimeoutId);
  if($('overflow-banner')) $('overflow-banner').classList.remove('active');

  const won = m.myScore > m.oppScore;
  const tied = m.myScore === m.oppScore;
  if (!tied && state.selectedMode !== 'practice'){
    if (won) state.user.wins++; else state.user.losses++;
  }
  renderUserChrome();

  if($('results-eyebrow')) $('results-eyebrow').textContent = 'MATCH COMPLETE';
  const headline = $('results-headline');
  if(headline){
    headline.textContent = tied ? 'Draw' : (won ? 'Victory' : 'Defeat');
    headline.className = 'results-headline ' + (tied ? '' : (won ? 'win' : 'lose'));
  }
  if($('results-my-score')) $('results-my-score').textContent = m.myScore;
  if($('results-opp-score')) $('results-opp-score').textContent = m.oppScore;
  if($('results-opp-name-label')) $('results-opp-name-label').textContent = state.opponentName || 'Opponent';

  showScreen('screen-results');
}

function resetCalc(){
  if (state.match) state.match.expr = '';
  if($('calc-expr')) $('calc-expr').innerHTML = '&nbsp;';
  if($('calc-preview')) $('calc-preview').textContent = '= 0';
}

function renderCalc(){
  const m = state.match;
  if(!m) return;
  if($('calc-expr')) $('calc-expr').textContent = m.expr || '\u00A0';
  const val = evalExpr(m.expr);
  if($('calc-preview')) $('calc-preview').textContent = val === null ? '= —' : '= ' + fmtNum(val);
}

function calcPress(key){
  const m = state.match;
  if (!m) return;
  if (key === 'clear'){ m.expr = ''; }
  else if (key === 'back'){ m.expr = m.expr.slice(0,-1); }
  else if (key === 'neg'){
    const match = m.expr.match(/(-?\d*\.?\d+)$/);
    if (match){
      const token = match[1];
      const start = m.expr.length - token.length;
      const negated = token.startsWith('-') ? token.slice(1) : '-' + token;
      m.expr = m.expr.slice(0,start) + negated;
    } else {
      m.expr += '-';
    }
  }
  else { m.expr += key; }
  renderCalc();
}

function initCalc(){
  qsa('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => calcPress(btn.dataset.key));
  });
  if($('btn-submit')) $('btn-submit').addEventListener('click', submitAnswer);
}

function submitAnswer(){
  const m = state.match;
  if (!m || m.roundSolved) return;

  const tree = parseCalcExpr(m.expr);
  if (!tree){ shakeExpr(); return; }

  if (!hasRealOperation(tree)){
    shakeExpr();
    pushFeed('That\u2019s just the number — do some math', 'wrong');
    return;
  }
  if (findFreebie(tree)){
    shakeExpr();
    pushFeed('+0 and \u00D71 don\u2019t count', 'wrong');
    return;
  }

  const val = evalNode(tree);
  if (!isFinite(val)){ shakeExpr(); return; }

  if (Math.abs(val - m.target) < 0.005){
    playerScores();
  } else {
    shakeExpr();
    pushFeed('Not quite', 'wrong');
  }
}
function shakeExpr(){
  const el = $('calc-expr');
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function init(){
  initBackground();

  const handleGuestEntry = (e) => {
    if(e) e.preventDefault();
    loginAsGuest();
  };

  if($('btn-google')) $('btn-google').addEventListener('click', handleGuestEntry);
  if($('btn-discord-login')) $('btn-discord-login').addEventListener('click', handleGuestEntry);
  if($('btn-confirm-name')) $('btn-confirm-name').addEventListener('click', handleGuestEntry);
  
  const usernameInput = $('input-username');
  if(usernameInput) {
    usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGuestEntry(e); });
  }

  qsa('.auth-btn, .guest-btn, #btn-google, #btn-discord-login, #btn-confirm-name').forEach(btn => {
    if(!btn.dataset.bound) {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', handleGuestEntry);
    }
  });

  if($('btn-play')) $('btn-play').addEventListener('click', () => showScreen('screen-lobby'));
  if($('btn-back-menu')) $('btn-back-menu').addEventListener('click', () => showScreen('screen-menu'));
  if($('btn-updates')) $('btn-updates').addEventListener('click', () => openModal('modal-updates'));
  if($('btn-discord-menu')) $('btn-discord-menu').addEventListener('click', () => window.open('https://discord.gg/', '_blank'));

  if($('btn-profile')) $('btn-profile').addEventListener('click', () => openModal('modal-profile'));
  if($('btn-copy-fc')) $('btn-copy-fc').addEventListener('click', () => {
    if(state.user) {
      navigator.clipboard?.writeText(state.user.friendCode).catch(()=>{});
      flashCopy('btn-copy-fc');
    }
  });
  if($('btn-copy-code')) $('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(state.lobbyCode).catch(()=>{});
    flashCopy('btn-copy-code');
  });

  qsa('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
  });

  if($('btn-play-again')) $('btn-play-again').addEventListener('click', () => { openMatchmaking(); showScreen('screen-lobby'); });
  if($('btn-to-lobby')) $('btn-to-lobby').addEventListener('click', () => showScreen('screen-lobby'));

  initLobby();
  initMatchmakingUI();
  initCalc();
}

function flashCopy(id){
  const btn = $(id);
  if(!btn) return;
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = original, 1200);
}

document.addEventListener('DOMContentLoaded', init);
