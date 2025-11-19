/* ---------- Config & State ---------- */
let timerInterval = null;
const GAME_DURATION = 90; // seconds

const CONFIG = {
  lanes: 5,
  totalBugs: 75,
  bugTravelSeconds: 15,
  prodMax: 100,
  wrongPauseMs: 500,
  scoring: {
    correctMax: 250,
    correctMin: 50,
    wrongGate: -100,
    hitProd: -500,
    comboBonus: 1000,
    comboSize: 3
  }
};

/* ---------- Firebase base URL (Realtime DB REST) ---------- */
const FIREBASE_DB_URL = 'https://roadshowgame-default-rtdb.firebaseio.com';

/* ---------- Local Storage for scores ---------- */
const LOCAL_SCORES_KEY = 'defenseArcade_scores_v1';

function loadLocalScores() {
  try {
    const raw = localStorage.getItem(LOCAL_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error reading local scores', e);
    return [];
  }
}

/**
 * firebaseId is optional; when present it lets us highlight the same row
 * in the global leaderboard.
 */
function addLocalScore(name, score, timestamp, firebaseId = null) {
  if (!name) return;
  const all = loadLocalScores();
  all.push({ name, score, timestamp, firebaseId });

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp;
  });

  const trimmed = all.slice(0, 50);
  try {
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Error saving local scores', e);
  }
}

/* Save a score to Firebase (POST to /scores) */
async function saveScoreToFirebase(name, score, timestamp) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/scores.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, timestamp })
    });
    const data = await res.json();  // { name: "-Nabcd..." }
    console.log('Score saved to Firebase:', data);
    return data && data.name; // firebase-generated key
  } catch (err) {
    console.error('Error saving score to Firebase:', err);
    return null;
  }
}

/* Read leaderboard scores from Firebase */
async function fetchLeaderboardFromFirebase() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/scores.json`);
    const data = await res.json();
    if (!data) return [];

    // data = { key1: {name,score,timestamp}, key2: {...}, ...}
    const rows = Object.entries(data).map(([id, entry]) => ({
      id,
      name: entry.name || 'Anon',
      score: typeof entry.score === 'number'
        ? entry.score
        : parseInt(entry.score, 10) || 0,
      timestamp: entry.timestamp || 0
    }));

    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, 20);
  } catch (err) {
    console.error('Error loading leaderboard from Firebase:', err);
    return [];
  }
}

/* Render small leaderboard panel on main screen */
async function renderLB() {
  const a = await fetchLeaderboardFromFirebase();
  const lbBox = document.getElementById('lb');
  if (!lbBox) return;
  lbBox.innerHTML = a.length
    ? a.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div>${r.name}</div>
          <div style="opacity:.85">${r.score}</div>
        </div>`).join('')
    : '<div style="opacity:.75;padding:8px">No scores yet</div>';
}

document.addEventListener('DOMContentLoaded', () => {
  renderLB();
  initGame();
});

let state = {
  player: null,
  score: 0,
  combo: 0,
  health: CONFIG.prodMax,
  currentBug: null,
  remaining: CONFIG.totalBugs,
  spawnedCount: 0,
  running: false
};

/* ---------- DOM refs & init ---------- */
let lanesEl, gameArea, banner, healthInner, scoreEl, comboEl, remainingEl,
    upcomingEl, speedLbl, lbBox, playerNameEl,
    spawnBtn, resetBtn, clearLbBtn, btnStart, btnLB, btnTutorial, btnAbort,
    prodCol,
    endOverlay, endTitleEl, endScoreEl, endRankEl, endBtnPlay, endBtnLB, endBtnNew,
    startOverlay, startOverlayBtn, startOverlayLBBtn, playerNameInput;

function initDomRefs() {
  lanesEl           = document.getElementById('lanes');
  gameArea          = document.getElementById('gameArea');
  banner            = document.getElementById('banner');
  healthInner       = document.getElementById('healthInner');
  scoreEl           = document.getElementById('score');
  comboEl           = document.getElementById('combo');
  remainingEl       = document.getElementById('remaining');
  upcomingEl        = document.getElementById('upcoming');
  speedLbl          = document.getElementById('speedLbl');
  lbBox             = document.getElementById('lb');
  playerNameEl      = document.getElementById('playerName');

  spawnBtn          = document.getElementById('spawnBtn');
  resetBtn          = document.getElementById('resetBtn');
  clearLbBtn        = document.getElementById('clearLb');
  btnStart          = document.getElementById('btnStart');
  btnLB             = document.getElementById('btnLB');
  btnTutorial       = document.getElementById('btnTutorial');
  btnAbort          = document.getElementById('btnAbort');
  prodCol           = document.getElementById('prodCol');

  endOverlay        = document.getElementById('endOverlay');
  endTitleEl        = document.getElementById('endTitle');
  endScoreEl        = document.getElementById('endScore');
  endRankEl         = document.getElementById('endRank');
  endBtnPlay        = document.getElementById('endBtnPlay');
  endBtnLB          = document.getElementById('endBtnLB');
  endBtnNew         = document.getElementById('endBtnNew');

  startOverlay      = document.getElementById('startOverlay');
  startOverlayBtn   = document.getElementById('startOverlayBtn');
  startOverlayLBBtn = document.getElementById('startOverlayLBBtn');
  playerNameInput   = document.getElementById('playerNameInput');
}

function initGame() {
  initDomRefs();
  buildLanes();
  wiring();
  updateHealth();
  updateProdDamageVisual();
  updateHUD();
}

/* ---------- Build lanes ---------- */
function buildLanes(){
  if (!lanesEl) return;
  lanesEl.innerHTML = '';
  for(let i=0;i<CONFIG.lanes;i++){
    const lane = document.createElement('div');
    lane.className='lane';
    lane.dataset.index = i;

    const label = document.createElement('div');
    label.className='lane-label';
    label.textContent = `Build ${i+1}`;
    lane.appendChild(label);

    const lineLeft = document.createElement('div');
    lineLeft.className = 'line-left';
    lane.appendChild(lineLeft);

    lanesEl.appendChild(lane);
  }
}

/* ---------- Bug pool ---------- */
const BUG_POOL = (function(){
  const seeds = [
    // unit-ish
    'Off-by-one error','Wrong variable type','Null pointer in util','GST calc wrong','Rounding mismatch',
    'Missing validation','Incorrect loop bound','Uninitialized var','Edge-case divide by zero','Wrong default value',
    'Wrong comparator','Floating precision bug','Wrong sign on calculation','Index out of range','Incorrect accumulator',
    'Wrong math formula','Missing unit test','Order of operations bug','Bad regex logic','Wrong constant used',
    'Locale number parse bug','Time-zone handling bug','Incorrect flag check','State mutation bug','Callback misuse',
    // contract-ish
    'API contract mismatch','Missing response field','Wrong HTTP status','Schema version mismatch','Field type mismatch',
    'Unexpected null in response','Header missing','Wrong content-type','Response shape changed','Deprecated field used',
    'Payload key typo','Missing required param','Extra field in response','Versioning mismatch','Incorrect enum value',
    'Invalid JSON format','Missing validation in schema','Query param name typo','Incorrect date format','Wrong pagination format',
    'Incorrect status code mapping','Auth header name mismatch','Field maxLength exceeded','Wrong field encoding','Trailing comma in response',
    // integration-ish
    'DB query fails intermittently','Config missing in CI','Container env mismatch','Service timeout in cluster','Race condition across services',
    'Circuit breaker not set','Retry logic missing','Downstream API latency','Wrong endpoint routing','Auth token refresh failure',
    'Network partition issue','Load balancer misroute','Session stickiness lost','Wrong service discovery','SSL cert mismatch',
    'Timeout too low','Ordering of messages wrong','Transaction not rolled back','Cache invalidation bug','Feature flag not propagated',
    'Message queue DLQ spike','Throttling misconfigured','Cross-origin blocked','DNS propagation issue','Legacy endpoint hit'
  ];
  return seeds.map((t,idx)=>({
    id:'b'+idx,
    label:t,
    right: idx<25? 'unit' : idx<50? 'contract' : 'integration',
    icon: '🐞'
  }));
})();

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
let bugQueue = shuffle([...BUG_POOL]);
function getNextBugDef(){
  if(bugQueue.length===0) bugQueue = shuffle([...BUG_POOL]);
  return bugQueue.shift();
}

/* ---------- Audio helper ---------- */
function beep(freq=440,dur=0.06){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value=freq;
    o.start();
    g.gain.setValueAtTime(0.0001,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
    o.stop(ctx.currentTime+dur+0.02);
  }catch(e){}
}

/* ---------- UI helpers ---------- */
function updateHUD(){
  if (!scoreEl) return;
  scoreEl.textContent = state.score;
  comboEl.textContent = state.combo;
  remainingEl.textContent = state.remaining;
  const speedFactor = 1 + (state.spawnedCount*0.12);
  speedLbl.textContent = speedFactor.toFixed(2)+'x';
  upcomingEl.textContent = state.currentBug ? state.currentBug.def.label : '—';
}

function updateHealth(){
  if (!healthInner) return;
  const pct = Math.max(0, Math.floor((state.health/CONFIG.prodMax)*100));
  healthInner.style.width = pct + '%';
  if(pct < 30)
    healthInner.style.background = 'linear-gradient(90deg,#ff6b6b,#ff8a3d)';
  else
    healthInner.style.background = 'linear-gradient(90deg,var(--neon-green),var(--neon-cyan))';
}

function updateProdDamageVisual(){
  if (!prodCol) return;
  prodCol.classList.remove('healthy','damaged','critical','broken');
  if(state.health <= 0){
    prodCol.classList.add('broken','critical','damaged');
  } else if(state.health <= 30){
    prodCol.classList.add('critical','damaged');
  } else if(state.health <= 70){
    prodCol.classList.add('damaged');
  } else {
    prodCol.classList.add('healthy');
  }
}

/* banner with optional revert */
function flashBanner(text, ms=900, revert=true){
  if (!banner) return;
  const old = banner.textContent;
  banner.textContent = text;
  banner.style.animation = 'pop 0.4s ease-out';

  if (revert) {
    setTimeout(()=>{
      banner.textContent = old;
      banner.style.animation = '';
    }, ms);
  } else {
    setTimeout(()=>{
      banner.style.animation = '';
    }, ms);
  }
}

/* Floating score text */
function showFloatingText(text, x, y, color){
  if (!gameArea) return;
  const node = document.createElement('div');
  node.textContent = text;
  node.style.position = 'absolute';
  node.style.left = x + 'px';
  node.style.top  = y + 'px';
  node.style.color = color || '#fff';
  node.style.fontWeight = '700';
  node.style.fontSize = '16px';
  node.style.textShadow = '0 0 8px rgba(0,0,0,0.7)';
  node.style.pointerEvents = 'none';
  node.style.zIndex = 80;
  gameArea.appendChild(node);

  node.animate(
    [
      { transform:'translateY(0)', opacity:1 },
      { transform:'translateY(-30px)', opacity:0 }
    ],
    { duration:800, easing:'ease-out' }
  );
  setTimeout(()=>{ try{node.remove();}catch(e){} }, 800);
}

/* ---------- Modal ---------- */
function showModal(html){
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;
  content.innerHTML = html;
  modal.style.display='flex';
}
function hideModal(){
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.style.display='none';
}

/* Simple tab switcher for leaderboard modal */
window._showLbTab = function (which) {
  const g   = document.getElementById('lbGlobalPanel');
  const m   = document.getElementById('lbMinePanel');
  const btnG = document.getElementById('lbTabGlobal');
  const btnM = document.getElementById('lbTabMine');
  if (!g || !m || !btnG || !btnM) return;

  if (which === 'mine') {
    g.style.display = 'none';
    m.style.display = 'block';
    btnG.classList.remove('lb-tab-active');
    btnM.classList.add('lb-tab-active');
  } else {
    g.style.display = 'block';
    m.style.display = 'none';
    btnG.classList.add('lb-tab-active');
    btnM.classList.remove('lb-tab-active');
  }
};

/* ---------- Wiring (buttons, drag/drop) ---------- */
function wiring() {
  if (btnTutorial) {
    btnTutorial.addEventListener('click', ()=>{
      showModal(`
        <h2>How to Play</h2>
        <p>🐞 One bug at a time spawns on a random build lane. Drag a gate (UNIT / CONTRACT / INTEGRATION) and drop it onto a lane. The gate will snap and block the approaching bug.</p>
        <ul>
          <li><b>Correct gate</b> (matches bug type): +${CONFIG.scoring.correctMin} to +${CONFIG.scoring.correctMax} (earlier is better)</li>
          <li><b>Wrong gate</b>: ${CONFIG.scoring.wrongGate}, bug pauses ${CONFIG.wrongPauseMs}ms</li>
          <li><b>Bug hits PROD</b>: ${CONFIG.scoring.hitProd} and production health drops by 20% (5 hits = meltdown)</li>
          <li>Every ${CONFIG.scoring.comboSize} correct in a row gives a combo bonus of +${CONFIG.scoring.comboBonus}</li>
        </ul>
        <div style="text-align:right;margin-top:10px">
          <button onclick="hideModal()">Got it!</button>
        </div>
      `);
    });
  }

  if (btnLB) {
    btnLB.addEventListener('click', onLeaderboardClick);
  }

  if (clearLbBtn) {
    clearLbBtn.addEventListener('click', async ()=>{
      try{
        await fetch(`${FIREBASE_DB_URL}/scores.json`, { method:'DELETE' });
      }catch(e){
        console.error('Error clearing Firebase leaderboard', e);
      }
      renderLB();
    });
  }

  if (resetBtn) resetBtn.addEventListener('click', resetSession);
  if (spawnBtn) spawnBtn.addEventListener('click', ()=>spawnNextBug(true));

  /* Name input behaviour */
  if (playerNameInput && startOverlayBtn) {
    playerNameInput.addEventListener('input', ()=>{
      const val = playerNameInput.value.trim();
      startOverlayBtn.disabled = !val;
    });
  }

  /* Start overlay buttons */
  if (startOverlayBtn) {
    startOverlayBtn.addEventListener('click', ()=>{
      const name = playerNameInput.value.trim();
      if(!name) return;
      state.player = name;
      if (playerNameEl) playerNameEl.textContent = state.player;
      if (startOverlay) startOverlay.style.display = 'none';
      beginGame();
    });
  }

  if (startOverlayLBBtn) {
    startOverlayLBBtn.addEventListener('click', ()=>{
      if (btnLB) btnLB.click();
    });
  }

  /* header Start button */
  if (btnStart) {
    btnStart.addEventListener('click', ()=>{
      if(!state.player){
        if (startOverlay) startOverlay.style.display = 'flex';
        if (playerNameInput) playerNameInput.focus();
      } else if(!state.running){
        beginGame();
      }
    });
  }

  /* Abort button */
  if (btnAbort) {
    btnAbort.addEventListener('click', abortGame);
  }

  /* End overlay buttons */
  if (endBtnPlay) {
    endBtnPlay.addEventListener('click', ()=>{
      if(state.player){
        beginGame();
      } else if (startOverlay){
        startOverlay.style.display = 'flex';
      }
    });
  }

  if (endBtnLB) {
    endBtnLB.addEventListener('click', ()=>{
      if (endOverlay) endOverlay.style.display = 'none';
      if (btnLB) btnLB.click();
    });
  }

  if (endBtnNew) {
    endBtnNew.addEventListener('click', ()=>{
      if (endOverlay) endOverlay.style.display = 'none';
      resetSession();

      state.player = null;
      if (playerNameEl) playerNameEl.textContent = '—';

      if (playerNameInput) {
        playerNameInput.value = '';
        startOverlayBtn.disabled = true;
      }

      if (startOverlay) {
        startOverlay.style.display = 'flex';
        playerNameInput && playerNameInput.focus();
      }
    });
  }

  /* Drag & Drop (lanes) */
  let drag = null;
  document.querySelectorAll('.gate-btn').forEach(g=>{
    g.addEventListener('dragstart', (e)=>{
      drag = {type: g.dataset.type};
      g.classList.add('dragging');
      e.dataTransfer.setData('text','gate');
    });
    g.addEventListener('dragend', ()=>{
      drag = null;
      document.querySelectorAll('.gate-btn').forEach(x=>x.classList.remove('dragging'));
    });
  });

  if (gameArea) {
    gameArea.addEventListener('dragover', (e)=>{
      e.preventDefault();
      if (!lanesEl) return;
      const lanesRect = lanesEl.getBoundingClientRect();
      const y = e.clientY - lanesRect.top + lanesEl.scrollTop;
      const laneHeight = lanesRect.height / CONFIG.lanes;
      const idx = Math.max(0, Math.min(CONFIG.lanes-1, Math.floor(y / laneHeight)));
      document.querySelectorAll('.lane').forEach((el,i)=> el.classList.toggle('lane-hover', i===idx));
    });

    gameArea.addEventListener('drop', (e)=>{
      e.preventDefault();
      document.querySelectorAll('.lane').forEach(el=>el.classList.remove('lane-hover'));
      if(!drag || !state.running || !state.currentBug){
        drag=null;
        return;
      }
      if (!lanesEl) return;
      const lanesRect = lanesEl.getBoundingClientRect();
      const y = e.clientY - lanesRect.top + lanesEl.scrollTop;
      const laneHeight = lanesRect.height / CONFIG.lanes;
      const chosen = Math.max(0, Math.min(CONFIG.lanes-1, Math.floor(y / laneHeight)));
      placeGate(drag.type, chosen, e.clientX);
      drag = null;
    });
  }
}

/* ---------- Leaderboard click handler ---------- */
async function onLeaderboardClick() {
  const globalRows = await fetchLeaderboardFromFirebase();
  const localRows  = loadLocalScores();

  // Set of Firebase ids we have stored locally
  const localIds = new Set(
    localRows
      .map(r => r.firebaseId)
      .filter(id => !!id)
  );

  /* ---------- Global scores ---------- */
  let globalBody = '';
  if (!globalRows.length) {
    globalBody =
      '<p style="padding:8px 0">No global scores yet. Play a round to become the first champion! 🏆</p>';
  } else {
    globalBody = `
      <table class="lb-table">
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th>Player</th>
            <th style="text-align:right">Score</th>
          </tr>
        </thead>
        <tbody>
          ${
            globalRows.map((r, idx) => {
              let medal = '';
              if (idx === 0) medal = '🥇';
              else if (idx === 1) medal = '🥈';
              else if (idx === 2) medal = '🥉';

              const d = new Date(r.timestamp || 0);
              const when = isNaN(d.getTime())
                ? ''
                : d.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

              const isMe    = state.player && r.name === state.player;
              const isLocal = localIds.has(r.id);

              const meClass  = isMe ? ' me' : '';
              const topClass =
                idx === 0 ? ' top1' :
                idx === 1 ? ' top2' :
                idx === 2 ? ' top3' : '';
              const myGlobalClass = isLocal ? ' my-global' : '';

              return `
                <tr class="lb-row${meClass}${topClass}${myGlobalClass}">
                  <td class="lb-medal">${medal || (idx + 1)}</td>
                  <td>${r.name}</td>
                  <td style="text-align:right">
                    <div class="lb-score-main">${r.score}</div>
                    <div class="lb-score-when">${when}</div>
                  </td>
                </tr>
              `;
            }).join('')
          }
        </tbody>
      </table>
    `;
  }

  /* ---------- My Scores (local) ---------- */
  let myBody = '';
  if (!localRows.length) {
    myBody =
      '<p style="padding:8px 0">No scores stored yet on this device. Finish a game to record your first score.</p>';
  } else {
    myBody = `
      <table class="lb-table">
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th>Player</th>
            <th style="text-align:right">Score</th>
          </tr>
        </thead>
        <tbody>
          ${
            localRows.map((r, idx) => {
              const d = new Date(r.timestamp || 0);
              const when = isNaN(d.getTime())
                ? ''
                : d.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

              const meClass =
                state.player && r.name === state.player ? ' me' : '';

              return `
                <tr class="lb-row${meClass}">
                  <td class="lb-medal">${idx + 1}</td>
                  <td>${r.name || 'Anon'}</td>
                  <td style="text-align:right">
                    <div class="lb-score-main">${r.score}</div>
                    <div class="lb-score-when">${when}</div>
                  </td>
                </tr>
              `;
            }).join('')
          }
        </tbody>
      </table>
    `;
  }

  const playerLine = state.player
    ? `<p style="margin-top:10px;font-size:13px;opacity:0.85">
         You are playing as <b>${state.player}</b>. “My Scores” shows all scores stored on this device.
       </p>`
    : `<p style="margin-top:10px;font-size:13px;opacity:0.85">
         “My Scores” shows all scores stored on this device.
       </p>`;

  showModal(`
    <h2>🏆 Scores</h2>
    <div class="lb-tabs">
      <button id="lbTabGlobal"
              class="lb-tab lb-tab-active"
              onclick="_showLbTab('global')">
        Global
      </button>
      <button id="lbTabMine"
              class="lb-tab"
              onclick="_showLbTab('mine')">
        My Scores
      </button>
    </div>

    <div id="lbGlobalPanel" class="lb-panel">
      ${globalBody}
    </div>
    <div id="lbMinePanel" class="lb-panel" style="display:none">
      ${myBody}
    </div>

    ${playerLine}
    <div style="text-align:right;margin-top:12px">
      <button onclick="hideModal()">Close</button>
    </div>
  `);
}

/* ---------- Gate placement ---------- */
function placeGate(type, laneIndex, clientX){
  if(!state.currentBug || !gameArea || !lanesEl) return;

  const areaRect = gameArea.getBoundingClientRect();
  const laneEl = lanesEl.children[laneIndex];
  const laneRect = laneEl.getBoundingClientRect();
  const top = laneRect.top - areaRect.top + (laneRect.height/2) - 28;

  let gateCenter = clientX - areaRect.left;
  const halfWidth = 60;
  gateCenter = Math.max(halfWidth, Math.min(gateCenter, areaRect.width - halfWidth));
  const containerLeft = gateCenter - halfWidth;

  const node = document.createElement('div');
  node.className = 'lane-gate lane-gate-' + type;
  node.style.left = containerLeft + 'px';
  node.style.top  = top + 'px';
  node.style.zIndex = 60;

  const line = document.createElement('div');
  line.className = 'lane-gate-line';

  const label = document.createElement('div');
  label.className = 'lane-gate-label';
  label.textContent = type.toUpperCase();

  node.appendChild(line);
  node.appendChild(label);

  gameArea.appendChild(node);

  if(!window._placedGates) window._placedGates = [];
  window._placedGates.push({
    el: node,
    type,
    lane: laneIndex,
    center: gateCenter,
    consumed: false
  });

  node.animate(
    [{transform:'scale(.86)'},{transform:'scale(1.02)'},{transform:'scale(1)'}],
    {duration:220}
  );
  beep(520,0.06);
}

/* ---------- Bug spawn / movement ---------- */
function spawnNextBug(manual=false){
  if(!state.running || !gameArea || !lanesEl || !prodCol) return;
  if(state.currentBug) return;
  if(state.remaining <= 0){
    if(manual) flashBanner('No bugs remaining');
    return;
  }

  const def = getNextBugDef();
  const row = Math.floor(Math.random()*CONFIG.lanes);
  const laneEl = lanesEl.children[row];
  const areaRect = gameArea.getBoundingClientRect();
  const laneRect = laneEl.getBoundingClientRect();

  const y = laneRect.top - areaRect.top + laneRect.height/2 - 16;

  const lineOffset = 10;
  const startX = (laneRect.left - areaRect.left) + lineOffset;

  const el = document.createElement('div');
  el.className = 'bug';
  el.innerHTML = `<span class="icon">${def.icon}</span><span>${def.label}</span>`;
  el.style.left = startX + 'px';
  el.style.top  = y + 'px';
  el.style.zIndex = 40;
  gameArea.appendChild(el);

  const prodRect = prodCol.getBoundingClientRect();
  const prodThreshold = prodRect.left - areaRect.left - el.offsetWidth;
  const distance = prodThreshold - startX;
  const speed = distance / CONFIG.bugTravelSeconds;

  const bug = {
    def,
    row,
    el,
    x: startX,
    vx: speed,
    pausedUntil: 0,
    active: true
  };
  state.currentBug = bug;
  state.spawnedCount++;
  state.remaining--;

  upcomingEl.textContent = def.label;
  updateHUD();

  const gateName =
    def.right === 'unit'        ? 'UNIT TEST' :
    def.right === 'contract'    ? 'CONTRACT TEST' :
    def.right === 'integration' ? 'INTEGRATION' :
    def.right.toUpperCase();

  banner.textContent = `Incoming: ${def.label} (${gateName})`;
}

/* Dynamic score based on gate position */
function computeDynamicScore(gateCenter, bug){
  if (!gameArea || !prodCol) return CONFIG.scoring.correctMin;
  const areaRect = gameArea.getBoundingClientRect();
  const prodRect = prodCol.getBoundingClientRect();

  const prodThreshold = prodRect.left - areaRect.left - bug.el.offsetWidth;

  const maxScore = CONFIG.scoring.correctMax;
  const minScore = CONFIG.scoring.correctMin;

  let t = gateCenter / Math.max(prodThreshold, 1);
  t = Math.min(Math.max(t, 0), 1);

  const score = Math.round(maxScore - t * (maxScore - minScore));
  return score;
}

function handleGateHit(bug, gate){
  gate.consumed = true;

  const gx = gate.el.offsetLeft + 40;
  const gy = gate.el.offsetTop - 24;

  if(gate.type === bug.def.right){
    const dynamicScore = computeDynamicScore(gate.center, bug);

    state.score += dynamicScore;
    state.combo++;
    beep(800,0.08);

    showFloatingText(`+${dynamicScore}`, gx, gy, '#6effa0');

    if(state.combo>0 && state.combo % CONFIG.scoring.comboSize === 0){
      state.score += CONFIG.scoring.comboBonus;
      showFloatingText(`+${CONFIG.scoring.comboBonus}`, gx + 10, gy - 26, '#ffd36b');
      // don't revert to old text or we show previous bug name
      flashBanner(`Combo! +${CONFIG.scoring.comboBonus}`, 900, false);
    }

    bug.active = false;
    try{ bug.el.remove(); }catch(e){}
    try{ gate.el.remove(); }catch(e){}

    window._placedGates = (window._placedGates || []).filter(g=>g!==gate);
    state.currentBug = null;
    updateHUD();

    spawnNextBug();
  } else {
    state.score += CONFIG.scoring.wrongGate;
    state.combo = 0;
    beep(180,0.08);

    showFloatingText(`${CONFIG.scoring.wrongGate}`, gx, gy, '#ff6b6b');

    bug.pausedUntil = performance.now() + CONFIG.wrongPauseMs;

    gate.el.style.opacity = '0.25';
    setTimeout(()=>{
      try{ gate.el.remove(); }catch(e){}
      window._placedGates = (window._placedGates || []).filter(g=>g!==gate);
    }, 400);

    updateHUD();
  }
}

function createSpark(x,y,color){
  if (!gameArea) return;
  const s = document.createElement('div');
  s.className = 'spark';
  s.style.left = x+'px';
  s.style.top = y+'px';
  s.style.color = color || '#ffb36b';
  gameArea.appendChild(s);
  s.animate(
    [
      { transform:'scale(1)', opacity:1 },
      { transform:'scale(2)', opacity:0 }
    ],
    { duration:700, easing:'ease-out' }
  );
  setTimeout(()=>{ try{s.remove();}catch(e){} }, 700);
}

function hitProd(bug){
  state.score += CONFIG.scoring.hitProd;
  state.combo = 0;

  state.health -= 20;
  if(state.health < 0) state.health = 0;

  updateHealth();
  updateProdDamageVisual();
  beep(120,0.12);

  if (!gameArea || !prodCol) return;
  const areaRect = gameArea.getBoundingClientRect();
  const prodRect = prodCol.getBoundingClientRect();
  const sx = prodRect.left - areaRect.left;
  const sy = (prodRect.top - areaRect.top)+20;

  createSpark(sx, sy, '#ffb36b');
  showFloatingText(`${CONFIG.scoring.hitProd}`, sx + 10, sy - 18, '#ff6b6b');

  prodCol.classList.add('hit');
  setTimeout(()=>prodCol.classList.remove('hit'), 350);

  if(state.health <= 0){
    for(let i=0;i<4;i++){
      setTimeout(()=>{
        createSpark(
          sx + 10 + (Math.random()*40 - 20),
          sy + (Math.random()*30 - 15),
          '#ff6666'
        );
      }, i*120);
    }
  }

  bug.active = false;
  try{ bug.el.remove(); }catch(e){}
  state.currentBug = null;
  updateHUD();

  if(state.health <= 0){
    endGame('Production meltdown!');
  } else if(state.remaining <= 0){
    endGame('All bugs processed.');
  } else {
    spawnNextBug();
  }
}

/* movement loop */
let lastTime = null;
function gameLoop(ts){
  if(!lastTime) lastTime = ts;
  const dt = ts - lastTime;
  lastTime = ts;

  if(state.running && state.currentBug && state.currentBug.active){
    const bug = state.currentBug;
    const now = performance.now();

    if(now >= bug.pausedUntil){
      const dtSec = dt / 1000;
      bug.x += bug.vx * dtSec;
      if (bug.el) bug.el.style.left = bug.x + 'px';

      let gates = window._placedGates || [];
      for(const gate of gates){
        if(gate.consumed) continue;
        if(gate.lane !== bug.row) continue;
        const bugRight = bug.x + bug.el.offsetWidth;
        const gateHalf = 12;
        const gateLeft = gate.center - gateHalf;
        const gateRight = gate.center + gateHalf;
        if(bugRight >= gateLeft && bug.x <= gateRight){
          handleGateHit(bug, gate);
          break;
        }
      }

      if(bug.active && gameArea && prodCol){
        const areaRect = gameArea.getBoundingClientRect();
        const prodRect = prodCol.getBoundingClientRect();
        const prodThreshold = prodRect.left - areaRect.left - bug.el.offsetWidth;
        if(bug.x >= prodThreshold){
          hitProd(bug);
        }
      }
    }
  }

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

/* ---------- Game control ---------- */
function resetSession(){
  state.running = false;
  clearInterval(timerInterval);
  timerInterval = null;

  if (endOverlay) endOverlay.style.display = 'none';

  if(state.currentBug && state.currentBug.el){
    try{ state.currentBug.el.remove(); }catch(e){}
  }
  state.currentBug = null;

  (window._placedGates || []).forEach(g=>{
    try{ g.el.remove(); }catch(e){}
  });
  window._placedGates = [];

  state.score = 0;
  state.combo = 0;
  state.health = CONFIG.prodMax;
  state.remaining = CONFIG.totalBugs;
  state.spawnedCount = 0;

  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = GAME_DURATION;
  if (banner) banner.textContent = 'Ready';
  updateHealth();
  updateProdDamageVisual();
  updateHUD();
}

function showEndOverlay(reason, rank){
  if (!endOverlay || !endTitleEl || !endScoreEl || !endRankEl) return;
  let title = 'Game Over';
  let className = '';

  if(reason && reason.toLowerCase().includes('time')){
    title = '⏰ Time Up!';
    className = 'timeup';
  } else if(reason && reason.toLowerCase().includes('meltdown')){
    title = '🔥 Production Meltdown!';
    className = 'meltdown';
  } else if (reason && reason.toLowerCase().includes('aborted')) {
    title = '⛔ Game Aborted';
    className = 'aborted';
  } else {
    title = reason || 'Game Over';
  }

  endTitleEl.textContent = title;
  endTitleEl.classList.remove('timeup','meltdown','aborted');
  if(className) endTitleEl.classList.add(className);

  endScoreEl.textContent = `Score: ${state.score}`;

  if(rank){
    if(rank === 1){
      endRankEl.textContent = `🏆 New High Score! You’re #1`;
    } else {
      endRankEl.textContent = `New leaderboard rank: #${rank}`;
    }
  } else {
    endRankEl.textContent = '';
  }

  endTitleEl.style.animation = 'none';
  void endTitleEl.offsetWidth;
  endTitleEl.style.animation = '';

  endOverlay.style.display = 'flex';
}

/* endGame: saves to Firebase + localStorage */
async function endGame(reason){
  state.running = false;
  clearInterval(timerInterval);
  timerInterval = null;
  if (banner) banner.textContent = reason || 'Game over';

  const name  = state.player;
  const stamp = Date.now();

  let firebaseId = null;
  let rank = null;

  // Try Firebase first (if we have a name)
  if (name) {
    try {
      firebaseId = await saveScoreToFirebase(name, state.score, stamp);
      const rows = await fetchLeaderboardFromFirebase();

      // find rank by id if possible, else fall back to name+score+time
      if (firebaseId) {
        const idxById = rows.findIndex(r => r.id === firebaseId);
        if (idxById >= 0) rank = idxById + 1;
      }
      if (rank == null) {
        const idx = rows.findIndex(
          r => r.name === name &&
               r.score === state.score &&
               r.timestamp === stamp
        );
        rank = idx >= 0 ? idx + 1 : null;
      }
    } catch (e) {
      console.error('Error updating Firebase leaderboard', e);
    }
  }

  // Always store locally (with firebaseId if we got one)
  if (name) {
    addLocalScore(name, state.score, stamp, firebaseId);
  }

  showEndOverlay(reason, rank);
  renderLB();
}

function beginGame(){
  resetSession();
  state.running = true;
  lastTime = null;

  let timeLeft = GAME_DURATION;
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = timeLeft;
  timerInterval = setInterval(()=>{
    timeLeft--;
    if(timeLeft < 0) timeLeft = 0;
    if (timerEl) timerEl.textContent = timeLeft;
    if(timeLeft <= 0){
      clearInterval(timerInterval);
      timerInterval = null;
      if(state.running){
        endGame('Time up!');
      }
    }
  }, 1000);

  spawnNextBug();
  if (btnAbort) btnAbort.disabled = false;
}

/* Abort button behaviour: no save to leaderboard */
function abortGame() {
  if (!state.running) return;

  state.running = false;
  clearInterval(timerInterval);
  timerInterval = null;

  if (btnAbort) btnAbort.disabled = true;

  // Do not save scores; just show overlay
  showEndOverlay('Game Aborted', null);
}
