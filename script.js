/* ===================================================================
   CALC BATTLES — client logic
   Self-contained demo: "sign-in" and matchmaking are simulated locally
   (no backend), but the calculator, scoring, timer and overflow event
   are fully functional game logic.
=================================================================== */

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
  user: null,          // { name, avatar, wins, losses, friendCode }
  pendingAuthProvider: null,
  selectedMode: null,
  lobbyCode: null,
  isHost: false,
  opponentName: null,
  match: null,         // set up in startMatch()
};

/* ---------------------------------------------------------------
   Utility
--------------------------------------------------------------- */
function $(id){ return document.getElementById(id); }
function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function showScreen(id){
  qsa('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function openModal(id){ $(id).classList.add('active'); }
function closeModal(id){ $(id).classList.remove('active'); }

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
function rankForWins(wins){
  let r = RANKS[0];
  for(const rank of RANKS) if (wins >= rank.min) r = rank;
  return r.name;
}
function fmtNum(n){
  // trim trailing zeros but keep it readable
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString();
}

/* ---------------------------------------------------------------
   Background: drifting math glyphs
--------------------------------------------------------------- */
function initBackground(){
  const canvas = $('bg-canvas');
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

/* ---------------------------------------------------------------
   Auth flow
--------------------------------------------------------------- */
function beginAuth(provider){
  state.pendingAuthProvider = provider;
  openModal('modal-name');
  $('input-username').value = '';
  setTimeout(() => $('input-username').focus(), 50);
}

function completeAuth(){
  const name = $('input-username').value.trim() || 'Player';
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
  const rank = rankForWins(u.wins);
  [ ['menu-avatar','avatar'], ['lobby-avatar','avatar'], ['profile-avatar','avatar'] ].forEach(([id]) => {
    if ($(id)) $(id).textContent = u.avatar;
  });
  $('menu-username').textContent = u.name;
  $('menu-rank').textContent = rank;
  $('lobby-username').textContent = u.name;
  $('lobby-rank').textContent = rank;
  $('profile-username').textContent = u.name;
  $('profile-rank').textContent = rank;
  $('profile-friendcode').textContent = u.friendCode;
  const total = u.wins + u.losses;
  $('stat-wins').textContent = u.wins;
  $('stat-losses').textContent = u.losses;
  $('stat-wr').textContent = total ? Math.round((u.wins/total)*100) + '%' : '0%';
}

/* ---------------------------------------------------------------
   Lobby / mode select
--------------------------------------------------------------- */
function initLobby(){
  qsa('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const available = card.dataset.available === 'true';
      if (!available) return; // locked cards just shake via CSS :hover
      qsa('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedMode = card.dataset.mode;
      const btn = $('btn-deploy');
      btn.disabled = false;
      btn.textContent = 'Deploy — Casual';
    });
  });

  $('btn-deploy').addEventListener('click', () => {
    if (!state.selectedMode) return;
    openMatchmaking();
  });
}

/* ---------------------------------------------------------------
   Matchmaking
--------------------------------------------------------------- */
function resetMatchmakingPanels(){
  $('mm-choice').style.display = '';
  $('mm-create').style.display = 'none';
  $('mm-join').style.display = 'none';
  $('mm-found').style.display = 'none';
}

function openMatchmaking(){
  resetMatchmakingPanels();
  $('mm-title').textContent = 'Casual queue';
  openModal('modal-matchmaking');
}

function buildCodeInputs(){
  const row = $('code-input-row');
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
  $('btn-connect-code').disabled = !full;
}

function initMatchmakingUI(){
  $('btn-create-lobby').addEventListener('click', () => {
    state.isHost = true;
    state.lobbyCode = randomLobbyCode();
    $('lobby-code-display').textContent = state.lobbyCode;
    $('mm-choice').style.display = 'none';
    $('mm-create').style.display = '';
    const waitMs = 2200 + Math.random()*1800;
    state.mmTimeout = setTimeout(() => {
      state.opponentName = OPPONENT_NAMES[Math.floor(Math.random()*OPPONENT_NAMES.length)];
      $('mm-create').style.display = 'none';
      $('mm-found').style.display = '';
      $('mm-found-name').textContent = `${state.opponentName} joined using your code`;
      setTimeout(() => { closeModal('modal-matchmaking'); launchBattle(); }, 1400);
    }, waitMs);
  });

  $('btn-join-lobby').addEventListener('click', () => {
    state.isHost = false;
    $('mm-choice').style.display = 'none';
    $('mm-join').style.display = '';
    buildCodeInputs();
  });

  $('btn-connect-code').addEventListener('click', () => {
    $('mm-join').style.display = 'none';
    $('mm-found').style.display = '';
    $('mm-found-name').textContent = 'Connecting to host…';
    state.opponentName = OPPONENT_NAMES[Math.floor(Math.random()*OPPONENT_NAMES.length)];
    setTimeout(() => {
      $('mm-found-name').textContent = `Matched with ${state.opponentName}`;
    }, 900);
    setTimeout(() => { closeModal('modal-matchmaking'); launchBattle(); }, 2000);
  });

  $('btn-cancel-create').addEventListener('click', () => { clearTimeout(state.mmTimeout); resetMatchmakingPanels(); });
  $('btn-cancel-join').addEventListener('click', resetMatchmakingPanels);
}

/* ---------------------------------------------------------------
   Battle: target generation, calculator, scoring, timer, overflow
--------------------------------------------------------------- */
const MATCH_SECONDS = 240;
const OVERFLOW_AT = 120;     // seconds remaining when overflow triggers
const OVERFLOW_DURATION = 30;

function randomTarget(){
  const sign = Math.random() < 0.5 ? -1 : 1;
  const magnitude = Math.random() < 0.6
    ? Math.floor(Math.random()*30)                 // small integer-ish
    : Math.random()*80;                             // wider decimal range
  let val = sign * magnitude;
  const decimals = Math.random() < 0.5 ? 0 : (Math.random() < 0.7 ? 1 : 2);
  val = Math.round(val * Math.pow(10,decimals)) / Math.pow(10,decimals);
  if (val === 0) val = sign * 1; // avoid a plain 0 target
  return val;
}

function safeEval(expr){
  if (!expr || !/^[0-9+\-*/(). ]+$/.test(expr)) return null;
  if (/[+\-*/.]{3,}/.test(expr)) return null;
  try{
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${expr});`)();
    return (typeof val === 'number' && isFinite(val)) ? val : null;
  }catch(e){ return null; }
}

function launchBattle(){
  const u = state.user;
  $('battle-my-avatar').textContent = u.avatar;
  $('battle-my-name').textContent = u.name;
  $('battle-opp-avatar').textContent = (state.opponentName||'O').charAt(0);
  $('battle-opp-name').textContent = state.opponentName || 'Opponent';
  $('battle-my-score').textContent = '0';
  $('battle-opp-score').textContent = '0';
  $('clash-bar-fill').style.width = '50%';
  $('overflow-banner').classList.remove('active');
  $('battle-feed').innerHTML = '';

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

function nextRound(){
  const m = state.match;
  if (!m) return;
  m.roundSolved = false;
  m.target = randomTarget();
  resetCalc();
  const el = $('target-number');
  el.textContent = fmtNum(m.target);
  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');
  scheduleOpponent();
}

function scheduleOpponent(){
  const m = state.match;
  clearTimeout(m.oppTimeoutId);
  const attempt = () => {
    if (!m || m.roundSolved || m.timeLeft <= 0) return;
    const succeeds = Math.random() < 0.82;
    if (succeeds){
      opponentScores();
    } else {
      pushFeed(`${state.opponentName} misfired`, 'wrong');
      m.oppTimeoutId = setTimeout(attempt, 1400 + Math.random()*2200);
    }
  };
  m.oppTimeoutId = setTimeout(attempt, 2200 + Math.random()*4200);
}

function opponentScores(){
  const m = state.match;
  if (m.roundSolved) return;
  m.roundSolved = true;
  const mult = m.overflowActive ? 2 : 1;
  const points = (100 + 50) * mult; // base + first-solve bonus
  m.oppScore += points;
  $('battle-opp-score').textContent = m.oppScore;
  bump('battle-opp-score');
  pushFeed(`${state.opponentName} +${points}`, 'theirs');
  updateClashBar();
  setTimeout(nextRound, 900);
}

function playerScores(){
  const m = state.match;
  m.roundSolved = true;
  clearTimeout(m.oppTimeoutId);
  const mult = m.overflowActive ? 2 : 1;
  const points = (100 + 50) * mult;
  m.myScore += points;
  $('battle-my-score').textContent = m.myScore;
  bump('battle-my-score');
  pushFeed(`You +${points}`, 'mine');
  updateClashBar();
  $('btn-submit').classList.remove('correct-flash');
  void $('btn-submit').offsetWidth;
  $('btn-submit').classList.add('correct-flash');
  setTimeout(nextRound, 900);
}

function bump(id){
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function updateClashBar(){
  const m = state.match;
  const total = m.myScore + m.oppScore;
  const pct = total === 0 ? 50 : (m.myScore/total)*100;
  $('clash-bar-fill').style.width = pct + '%';
}

function pushFeed(text, cls){
  const feed = $('battle-feed');
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
    $('overflow-time').textContent = m.overflowSecondsLeft;
    if (m.overflowSecondsLeft <= 0){
      m.overflowActive = false;
      $('overflow-banner').classList.remove('active');
    }
  }

  updateTimerDisplay();
  if (m.timeLeft <= 0){
    endMatch();
  }
}

function triggerOverflow(){
  const m = state.match;
  m.overflowUsed = true;
  m.overflowActive = true;
  m.overflowSecondsLeft = OVERFLOW_DURATION;
  $('overflow-time').textContent = m.overflowSecondsLeft;
  $('overflow-banner').classList.add('active');
  const flash = $('overflow-flash');
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
}

function updateTimerDisplay(){
  const m = state.match;
  const t = Math.max(0, m.timeLeft);
  const mm = Math.floor(t/60);
  const ss = (t%60).toString().padStart(2,'0');
  $('match-timer').textContent = `${mm}:${ss}`;
}

function endMatch(){
  const m = state.match;
  clearInterval(m.tickId);
  clearTimeout(m.oppTimeoutId);
  $('overflow-banner').classList.remove('active');

  const won = m.myScore > m.oppScore;
  const tied = m.myScore === m.oppScore;
  if (!tied){
    if (won) state.user.wins++; else state.user.losses++;
  }
  renderUserChrome();

  $('results-eyebrow').textContent = 'MATCH COMPLETE';
  const headline = $('results-headline');
  headline.textContent = tied ? 'Draw' : (won ? 'Victory' : 'Defeat');
  headline.className = 'results-headline ' + (tied ? '' : (won ? 'win' : 'lose'));
  $('results-my-score').textContent = m.myScore;
  $('results-opp-score').textContent = m.oppScore;
  $('results-opp-name-label').textContent = state.opponentName || 'Opponent';

  showScreen('screen-results');
}

/* ---------------------------------------------------------------
   Calculator
--------------------------------------------------------------- */
function resetCalc(){
  if (state.match) state.match.expr = '';
  $('calc-expr').innerHTML = '&nbsp;';
  $('calc-preview').textContent = '= 0';
}

function renderCalc(){
  const m = state.match;
  $('calc-expr').textContent = m.expr || '\u00A0';
  const val = safeEval(m.expr);
  $('calc-preview').textContent = val === null ? '= —' : '= ' + fmtNum(val);
}

function calcPress(key){
  const m = state.match;
  if (!m) return;
  if (key === 'clear'){ m.expr = ''; }
  else if (key === 'back'){ m.expr = m.expr.slice(0,-1); }
  else if (key === 'neg'){
    // toggle sign of the trailing number token
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
  $('btn-submit').addEventListener('click', submitAnswer);
}

function submitAnswer(){
  const m = state.match;
  if (!m || m.roundSolved) return;
  const val = safeEval(m.expr);
  if (val === null){ shakeExpr(); return; }
  if (Math.abs(val - m.target) < 0.005){
    playerScores();
  } else {
    shakeExpr();
    pushFeed('Not quite', 'wrong');
  }
}
function shakeExpr(){
  const el = $('calc-expr');
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

/* ---------------------------------------------------------------
   Wire everything up
--------------------------------------------------------------- */
function init(){
  initBackground();

  $('btn-google').addEventListener('click', () => beginAuth('google'));
  $('btn-discord-login').addEventListener('click', () => beginAuth('discord'));
  $('btn-confirm-name').addEventListener('click', completeAuth);
  $('input-username').addEventListener('keydown', e => { if (e.key === 'Enter') completeAuth(); });

  $('btn-play').addEventListener('click', () => showScreen('screen-lobby'));
  $('btn-back-menu').addEventListener('click', () => showScreen('screen-menu'));
  $('btn-updates').addEventListener('click', () => openModal('modal-updates'));
  $('btn-discord-menu').addEventListener('click', () => window.open('https://discord.gg/', '_blank'));

  $('btn-profile').addEventListener('click', () => openModal('modal-profile'));
  $('btn-copy-fc').addEventListener('click', () => {
    navigator.clipboard?.writeText(state.user.friendCode).catch(()=>{});
    flashCopy('btn-copy-fc');
  });
  $('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(state.lobbyCode).catch(()=>{});
    flashCopy('btn-copy-code');
  });

  qsa('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
  });

  $('btn-play-again').addEventListener('click', () => { openMatchmaking(); showScreen('screen-lobby'); });
  $('btn-to-lobby').addEventListener('click', () => showScreen('screen-lobby'));

  initLobby();
  initMatchmakingUI();
  initCalc();
}

function flashCopy(id){
  const btn = $(id);
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = original, 1200);
}

document.addEventListener('DOMContentLoaded', init);
