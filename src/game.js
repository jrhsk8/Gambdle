
// ─── APP SHELL ───────────────────────────────────────────────────────────

let _noAnim=false;

// ─── SCREEN RENDERING ────────────────────────────────────────────────────

function screenIntro(){
  return `${hdr('New Game')}
  <div class="panel">
    <div style="text-align:center;padding:14px 4px 6px">
      <div class="logo"><span class="logo-spade">♠</span>GAMBDLE</div>
      <div class="logo-sub">Daily Game #${S.day}</div>
    </div>
    <div class="divider"></div>
    <div style="text-align:center;padding:4px 4px">
      <div style="font-size:1.8rem;color:var(--cream)">You start with <b style="color:var(--gold-hi)">${fmt(START)} chips</b>.</div>
      <div style="font-size:1.4rem;color:var(--cream);opacity:0.7;margin-top:4px">Your final stack is your leaderboard score.</div>
    </div>
    <button class="btn-gold btn-lg" style="margin: 10px 0" onclick="startGame()">► Start new game</button>
    <div class="divider"></div>
    <div style="font-size:1.4rem;color:var(--cream);opacity:0.7;letter-spacing:0.16em;text-transform:uppercase;margin:2px 2px 4px">Today's program:</div>
    ${renderIntroGameRows()}
  </div>`;
}

function renderIntroGameRows() {
  const g1 = GAME_META[GAME1], g2 = GAME_META[GAME2];
  const games = [
    [g1.icon, g1.name, g1.desc],
    [g2.icon, g2.name, g2.desc],
    ['🎡', 'Roulette', 'One spin · Anything is possible'],
  ];
  const rows = games.map((g, i) => `
    <div class="gm-row">
      <span class="rnd-ic">${g[0]}</span>
      <div>
        <div class="rnd-nm">${i+1}. ${g[1]}</div>
        <div class="rnd-dc">${g[2]}</div>
      </div>
    </div>`).join('<div class="gm-sep"></div>');
  return `<div class="game-manifest">${rows}</div>`;
}

function screenResults(){
  const g1Net=gameNet(GAME1), g2Net=gameNet(GAME2);
  const g1Label=`${GAME_META[GAME1].icon} ${GAME_META[GAME1].name}`;
  const g2Label=`${GAME_META[GAME2].icon} ${GAME_META[GAME2].name}`;
  const rNet=S.rResult?.delta||0;
  const shareText=buildShareText();

  const chartHtml = `
    <div id="dist-title" class="sec" style="margin-top:6px;margin-bottom:4px">Score Distribution</div>
    <div id="dist-chart" class="dist-wrap"><div style="color:var(--shadow);font-size:0.9rem;padding:12px 0;text-align:center">Loading…</div></div>`;

  const high = parseInt(_ls.getItem('gambdle_highscore') || '0');
  const {emoji,label}=getTier(S.chips);const tier=`${emoji} ${label}`;

  return `${hdr('Daily Results')}
  <div class="panel" style="text-align:center">
    <div style="font-size:1.05rem;color:var(--cream);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:2px">${tier}</div>
    <div class="big-chips" style="font-family:var(--btn-f);font-size:5rem;line-height:1;letter-spacing:.04em;color:var(--gold-hi);text-shadow:2px 2px 0 rgba(0,0,0,0.45)">${fmt(S.chips)}</div>
    <div style="color:var(--cream);opacity:0.7;letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;font-weight:600;margin-top:2px;margin-bottom:6px">chips</div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${[[g1Label,g1Net],[g2Label,g2Net],['🎡 Roulette',rNet]].map(([lbl,net],i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}
      <div class="res-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span style="font-size:1rem">${lbl}</span>
        <span style="font-family:var(--btn-f);font-size:1.35rem;color:${col(net)}">${sign(net)}</span>
      </div>`).join('')}
      <div class="gm-sep" style="opacity:0.35"></div>
      <div class="res-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span class="ik">Your all-time high</span><span class="iv">${fmt(Math.max(S.chips, high))}</span>
      </div>
      <div id="lb-stat">
        <div class="gm-sep" style="opacity:0.35"></div>
        <div class="lb-row res-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
          <span class="ik">${_backlogSeed ? `Day #${S.day} Ranking` : "Today's ranking"}</span><span class="iv" style="color:var(--ink)">Loading…</span>
        </div>
      </div>
    </div>
    ${chartHtml}
    <div class="share-box">${shareText}</div>
    <button class="btn-gold" onclick="doShare()">📋 Copy &amp; Share</button>
  </div>`;
}

/**
 * ─── LEADERBOARD ─────────────────────────────────────────────────────────
 * Submits score to Supabase once per day per device, then fetches the
 * player's percentile rank among all submissions for that day's seed.
 */
async function submitAndFetchLeaderboard() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return;
  const seed = getActiveSeed();
  const subKey = `gambdle_submitted_${seed}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  if (!_backlogSeed && !_ls.getItem(subKey) && !DEV_OVERRIDE && !_testActive()) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-score`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ seed, chips: S.chips })
      });
      if (res.ok) _ls.setItem(subKey, '1');
    } catch(e) {
      if (DEV_OVERRIDE) console.error("Leaderboard submission failed:", e);
    }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_percentile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_seed: seed, p_chips: S.chips })
    });
    if (!res.ok) return;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    const el = document.getElementById('lb-stat');
    if (!el) return;
    if (!row) { el.style.display = 'none'; return; }
    if (row.total < 10) {
      const rank = Math.ceil(row.top_pct / 100 * row.total);
      const lbl = _backlogSeed ? `Day #${S.day} Ranking` : "Today's Ranking";
      const lr = el.querySelector('.lb-row');
      if (lr) lr.innerHTML = `<span class="ik">${lbl}</span><span class="iv" style="color:var(--ink)">Rank ${rank} of ${row.total}</span>`;
      return;
    }
    const iv = row.top_pct > 50
      ? `Bottom ${100 - row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`
      : `Top ${row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`;
    const lbl = _backlogSeed ? `Day #${S.day} Ranking` : "Today's Ranking";
    const lr = el.querySelector('.lb-row');
    if (lr) lr.innerHTML = `<span class="ik">${lbl}</span><span class="iv" style="color:var(--ink)">${iv}</span>`;
  } catch(e) {
    if (DEV_OVERRIDE) console.error("Leaderboard fetch failed:", e);
  }
}

function _showHistoryChart(el) {
  const titleEl = document.getElementById('dist-title');
  const histData = JSON.parse(_ls.getItem('gambdle_history') || '{}');
  const allSorted = Object.entries(histData).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  const currentSeedStr = getActiveSeed().toString();
  let idx = allSorted.findIndex(([s]) => s === currentSeedStr);

  // If the viewed day isn't in history yet, find where it would be chronologically
  if (idx === -1) {
    idx = allSorted.findIndex(([s]) => parseInt(s) > getActiveSeed());
    if (idx === -1) idx = allSorted.length;
  }

  // Aim for a window of 7, centering the current day if possible
  let start = Math.max(0, idx - 3);
  let end = Math.min(allSorted.length, start + 7);
  const historySorted = allSorted.slice(Math.max(0, end - 7), end);

  if (!historySorted.length) { el.style.display = 'none'; if (titleEl) titleEl.style.display = 'none'; return; }
  if (titleEl) titleEl.textContent = 'Past Performance';
  const maxScore = Math.max(...historySorted.map(h => parseInt(h[1])), 1);
  const bars = historySorted.map(([seed, score]) => {
    const s = parseInt(seed);
    const y = Math.floor(s/10000), m = Math.floor((s%10000)/100), d = s%100;
    const dayNum = Math.floor((Date.UTC(y, m-1, d) - START_DATE_UTC) / 86400000) + 1;
    const h = Math.max((parseInt(score) / maxScore) * 100, 5);
    const isCurrent = s === getActiveSeed();
    return `<div class="dist-bar${isCurrent ? ' you' : ''}" style="height:${h}%">
      <span class="dist-count">${fmt(parseInt(score))}</span>
      <span class="dist-lbl">#${dayNum}</span>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="dist-bars">${bars}</div>`;
}

async function fetchScoreDistribution() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_score_distribution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_seed: getActiveSeed() }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const el = document.getElementById('dist-chart');
    if (!el) return;
    if (!res.ok) { el.style.display = 'none'; document.getElementById('dist-title')?.style.setProperty('display','none'); return; }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { el.style.display = 'none'; document.getElementById('dist-title')?.style.setProperty('display','none'); return; }

    const counts = data.map(b => parseInt(b.count));
    const total = counts.reduce((a, c) => a + c, 0);

    if (total < 10) {
      _showHistoryChart(el);
      return;
    }

    const sorted = [...counts].sort((a, b) => b - a);
    const useLog = sorted[0] > 0 && sorted[1] > 0 && sorted[0] / sorted[1] > 3;
    const scaled = counts.map(c => useLog ? Math.sqrt(c) : c);
    const maxScaled = Math.max(...scaled, 1);
    const playerBucket = S.chips <= 249 ? 0 : S.chips <= 499 ? 1 : S.chips <= 999 ? 2 : S.chips <= 1999 ? 3 : S.chips <= 2999 ? 4 : S.chips <= 3999 ? 5 : 6;
    const labels = ['0', '250', '500', '1k', '2k', '3k', '4k'];
    const bucketBounds = [[0,249],[250,499],[500,999],[1000,1999],[2000,2999],[3000,3999],[4000,10000]];
    const [bLo, bHi] = bucketBounds[playerBucket];
    const posWithin = Math.min(Math.max((S.chips - bLo) / (bHi - bLo), 0), 1);
    const youPct = (playerBucket + posWithin) / 7 * 100;
    const youLblStyle = youPct > 50 ? 'right:4px' : 'left:4px';
    const tallestBucket = counts.indexOf(Math.max(...counts));
    const inTallest = playerBucket === tallestBucket;

    const cols = data.map((b, i) => {
      const cnt = parseInt(b.count);
      const h = cnt > 0 ? Math.max((scaled[i] / maxScaled) * 100, 5) : 0;
      const nearCenter = i === playerBucket && posWithin > 0.25 && posWithin < 0.75;
      const nudge = nearCenter
        ? (posWithin < 0.5 ? posWithin * 100 + 20 : posWithin * 100 - 20)
        : 50;
      const cntStyle = i === playerBucket ? `left:${Math.min(Math.max(nudge, 10), 90)}%;transform:translateX(-50%)` : '';
      const lblOffsets = [-3, -12, -9, -9, -9, -9, -9];
      const lblStyle = ` style="left:${lblOffsets[i]}px;transform:none"`;
      const endLbl = i === 6 ? '<span class="dist-lbl" style="right:-6px;left:auto;transform:none">5k+</span>' : '';
      return `<div class="dist-bar${i === playerBucket ? ' you' : ''}" style="height:${h}%">
        <span class="dist-count"${cntStyle ? ` style="${cntStyle}"` : ''}>${cnt}</span>
        <span class="dist-lbl"${lblStyle}>${labels[i]}</span>
        ${endLbl}
      </div>`;
    }).join('');

    el.innerHTML = `<div class="dist-bars">
      ${cols}
      <div class="dist-you-line" style="left:${youPct.toFixed(1)}%;${inTallest ? 'top:-28px' : ''}">
        <span class="dist-you-lbl" style="${youLblStyle}${inTallest ? ';top:0' : ''}">You (${fmt(S.chips)})</span>
      </div>
    </div>`;
  } catch(e) {
    clearTimeout(timer);
    const el = document.getElementById('dist-chart');
    if (!el) return;
    _showHistoryChart(el);
    if (DEV_OVERRIDE) console.error('Distribution fetch failed:', e);
  }
}

// ─── DEV TOOLS ───────────────────────────────────────────────────────────

function devReset() {
  _ls.removeItem(getStateKey());
  location.reload();
}

function devSetGame(slot, value) {
  _ls.setItem('gambdle_dev_game' + slot, value);
  _ls.removeItem(getStateKey());
  location.reload();
}

function devApplyMod(k) {
  S.forcedMod = k;
  render();
}
function devSpin(){
  S.screen='roulette';S.rPhase='bet';
  if(S.rBets.length===0&&S.chips>=10){S.chips-=10;S.rBets=[{pick:45,bet:10}];}
  closeDropdowns();
  saveState();
  if(S.rBets.length>0)rSpin();else render();
}
function devToggleUnlocks(){
  const on=!getPref('golden_back_unlocked');
  setPref('golden_back_unlocked', on);
  setPref('whale_back_unlocked', on);
  setPref('orange_back_unlocked', on);
  setPref('maroon_felt_unlocked', on);
  setPref('deck_emoji_unlocked', on);
  setPref('green_theme_unlocked', on);
  if(!on && ['gold','whale','orange'].includes(getPref('cardback'))) setPref('cardback','default');
  if(!on && getPref('felt')==='maroon') setPref('felt','default');
  if(!on && getPref('deck')==='emoji') setPref('deck','default');
  if(!on && getPref('theme')==='green') setPref('theme','default');
  applyPrefs();
  const cb=document.getElementById('dev-unlocks-cb');
  if(cb) cb.checked=on;
}

function toggleTestSeed() {
  if (_testActive()) {
    _ls.removeItem('gambdle_use_test_seed');
    _ls.removeItem('gambdle_test_state');
  } else {
    _ls.setItem('gambdle_use_test_seed', '1');
    _ls.removeItem('gambdle_test_state');
  }
  const cb = document.getElementById('dev-test-seed-cb');
  if (cb) cb.checked = _testActive();
}

// ─── STATUS BAR ──────────────────────────────────────────────────────────

const STATUS_HINT = {
  intro:    'Idle — start a new game.',
  bj:       'Blackjack — choose action.',
  uth:      "Hold'em — choose action.",
  poker:    'Poker — choose action.',
  roulette: 'Roulette — place a bet.',
  results:  '<span class="sb-prefix">Game complete · </span>New game at midnight<span class="sb-suffix"> · Arizona time</span>',
};

function statusBar(){
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h>=12 ? 'PM' : 'AM';
  const hh = (h%12) || 12;
  const tm = `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  const _isFuture = _backlogSeed && _backlogSeed > getDailySeed();
  const _modeLabel = _backlogSeed ? (_isFuture ? 'Preview' : 'Archive') : 'Gambdle';
  let hint = STATUS_HINT[S.screen] || 'Ready.';
  if (_backlogSeed && S.screen === 'results') hint = `<span class="sb-prefix">${_modeLabel} · </span>Day #${S.day} complete`;
  return `<div class="status-bar">
    <span>${hint}</span>
    <span><span id="sb-mute-icon" onclick="togglePref('mute');event.stopPropagation()" style="cursor:pointer;font-size:0.85em" title="${getPref('mute')?'Unmute':'Mute'}">${getPref('mute')?'🔇':'🔊'}</span>${_modeLabel} #${S.day}  ·  ${tm}</span>
  </div>`;
}

// ─── RENDER ──────────────────────────────────────────────────────────────

// Full re-render — replaces all of #app. Use surgical DOM updates mid-hand to avoid flash.
function render(){
  const scr={intro:screenIntro,bj:screenBJ,uth:screenUTH,poker:screenPoker,roulette:screenRoulette,results:screenResults};
  const inner = (scr[S.screen]||screenIntro)();
  document.getElementById('app').innerHTML=`<div class="app">
    <div class="window">
      ${inner}
      ${statusBar()}
    </div>
  </div>`;
  const _panel = document.querySelector('.panel');
  const _mod = modBannerHTML(S.screen === 'results');
  // Inject the modifier banner at the top of the panel after the screen HTML is in place.
  if (_panel && _mod) {
    _panel.insertAdjacentHTML('afterbegin', _mod);
    if (window.innerWidth <= 480) {
      const r = _panel.querySelector('.mod-banner-r');
      if (r) {
        r.style.whiteSpace = 'nowrap';
        let fs = parseFloat(getComputedStyle(r).fontSize);
        while (r.scrollWidth > r.clientWidth && fs > 11) { fs -= 0.5; r.style.fontSize = fs + 'px'; }
      }
    }
  }
  _reapplyDragPos();
  if(_noAnim){
    _noAnim=false;
    document.querySelectorAll('.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
  }
  saveState();
  if (S.screen === 'results') { submitAndFetchLeaderboard(); fetchScoreDistribution(); }
}

function updateChipDisplay() {
  const el = document.getElementById('chip-badge');
  if (el) {
    el.innerHTML = `💵 ${fmt(S.chips)}`;
  }
}

// ─── NAVIGATION & ACTIONS ────────────────────────────────────────────────

function goTo(s){S.screen=s;render();}
// Plays a transition sound scaled to how well the player is doing.
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('assets/sounds/mediumbet.mp3');else playMp3('assets/sounds/smallbet.mp3');}
// Navigates between games; redirects to results early if the player is busted (<10 chips).
function advanceTo(s){
  if(s!=='results'&&isChipBusted())s='results';
  if(s==='results')S.chips=START+gameNet(GAME1)+gameNet(GAME2)+(S.rResult?.delta||0);
  sndAdvance();goTo(s);
}
function startGame(){sndChip('allin');S.screen=GAME1;S.bjPhase='bet';render();}

// ─── DRAGGABLE WINDOW (desktop only) ─────────────────────────────────────

let _winOffset = { x: 0, y: 0 };
let _winDragStart = null;

function _reapplyDragPos() {
  if (_winOffset.x === 0 && _winOffset.y === 0) return;
  const app = document.querySelector('.app');
  if (app) app.style.transform = `translate(${_winOffset.x}px,${_winOffset.y}px)`;
}

function snapWindowToOrigin() {
  if (_winOffset.x === 0 && _winOffset.y === 0) return;
  _winOffset = { x: 0, y: 0 };
  const app = document.querySelector('.app');
  if (!app) return;
  app.style.transition = 'transform 0.22s ease';
  app.style.transform = 'translate(0,0)';
  setTimeout(() => { app.style.transition = ''; }, 220);
}

function _winMousemove(e) {
  if (!_winDragStart) return;
  _winOffset.x = _winDragStart.ox + e.clientX - _winDragStart.mx;
  _winOffset.y = _winDragStart.oy + e.clientY - _winDragStart.my;
  const app = document.querySelector('.app');
  if (app) app.style.transform = `translate(${_winOffset.x}px,${_winOffset.y}px)`;
}

function _winMouseup() {
  _winDragStart = null;
  document.removeEventListener('mousemove', _winMousemove);
}

function initWindowDrag() {
  if (window.innerWidth <= 480 || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('mousedown', e => {
    const tb = e.target.closest('.title-bar');
    if (!tb || e.target.closest('.tb-btn')) return;
    e.preventDefault();
    _winDragStart = { mx: e.clientX, my: e.clientY, ox: _winOffset.x, oy: _winOffset.y };
    document.addEventListener('mousemove', _winMousemove);
    document.addEventListener('mouseup', _winMouseup, { once: true });
  });
}

// ─── BOOT ────────────────────────────────────────────────────────────────
loadState();
applyPrefs();
render();
initWindowDrag();
_bjResumeAfterRefresh();
_uthResumeAfterRefresh();
_pkResumeAfterRefresh();
_rResumeAfterRefresh();
