
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
    <button class="btn-gold btn-lg" style="margin: 10px 0" onclick="startGame()">► Start new game<span class="btn-detail"> — $${fmt(START)}</span></button>
    <div class="divider"></div>
    <div style="font-size:1.4rem;color:var(--cream);opacity:0.7;letter-spacing:0.16em;text-transform:uppercase;margin:2px 2px 4px">Today's program:</div>
    ${renderIntroGameRows()}
  </div>`;
}

function renderIntroGameRows() {
  const games = [
    ['🃏', 'Blackjack',                '3 hands · Hit, Stand, Double, Split'],
    GAME2 === 'uth'
      ? ['♠', "Ultimate Hold'em",      '3 hands · Ante, Blind & Play']
      : ['♠', '5 Card Poker',          '3 hands · Jacks or Better'],
    ['🎡', 'Roulette',                 'One spin · Anything is possible'],
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
  const bjNet=S.bjHistory.reduce((a,h)=>a+h.delta,0);
  const g2Hist=GAME2==='uth'?S.uthHistory:S.pkHistory;
  const g2Net=g2Hist.reduce((a,h)=>a+h.delta,0);
  const rNet=S.rResult?.delta||0;
  const g2Label=GAME2==='uth'?"♠ Ultimate Texas Hold'em":'♠ 5 Card Poker';
  const shareText=buildShareText();

  const histData = JSON.parse(localStorage.getItem('gambdle_history') || '{}');
  const historySorted = Object.entries(histData).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).slice(-7);
  const maxScore = Math.max(...historySorted.map(h => h[1]), 1000);
  const chartHtml = historySorted.length > 0 ? `
    <div class="sec" style="margin-top:6px;margin-bottom:0">Past Performance</div>
    <div class="chart-wrap">
      ${historySorted.map(([seed, score]) => {
        const s = parseInt(seed);
        const y = Math.floor(s / 10000), m = Math.floor((s % 10000) / 100), d = s % 100;
        const dayNum = Math.floor((Date.UTC(y, m - 1, d) - START_DATE_UTC) / 86400000) + 1;
        return `<div class="chart-bar" style="height:${Math.max((score/maxScore)*100, 5)}%" data-v="${fmt(score)}">
          <span class="chart-day">#${dayNum}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const high = parseInt(localStorage.getItem('gambdle_highscore') || '0');
  const {emoji,label}=getTier(S.chips);const tier=`${emoji} ${label}`;
  const msg = S.chips >= 1000 ? '📈 Excellent run!' : S.chips > 0 ? '📉 Tough session' : 'Better luck tomorrow';

  return `${hdr('Daily Results')}
  <div class="panel" style="text-align:center">
    <div style="font-size:1.05rem;color:var(--cream);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:2px">${tier}</div>
    <div class="big-chips" style="font-family:var(--btn-f);font-size:5rem;line-height:1;letter-spacing:.04em;color:var(--gold-hi);text-shadow:2px 2px 0 rgba(0,0,0,0.45)">${fmt(S.chips)}</div>
    <div style="color:var(--cream);opacity:0.7;letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;font-weight:600;margin-top:2px;margin-bottom:4px">chips</div>
    <div style="font-size:1.05rem;margin-bottom:8px;color:var(--cream)">${msg}</div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${[['🃏 Blackjack',bjNet],[g2Label,g2Net],['🎡 Roulette',rNet]].map(([lbl,net],i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span style="font-size:1rem">${lbl}</span>
        <span style="font-family:var(--btn-f);font-size:1.35rem;color:${col(net)}">${sign(net)}</span>
      </div>`).join('')}
      <div class="gm-sep" style="opacity:0.35"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span class="ik">All-time high</span><span class="iv">${fmt(Math.max(S.chips, high))}</span>
      </div>
      <div id="lb-stat">
        <div class="gm-sep" style="opacity:0.35"></div>
        <div class="lb-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
          <span class="ik">Today's ranking</span><span class="iv" style="color:var(--ink)">Loading…</span>
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
  const seed = getDailySeed();
  const subKey = `gambdle_submitted_${seed}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  if (!localStorage.getItem(subKey) && !DEV_OVERRIDE && !_testActive()) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ seed, chips: S.chips })
      });
      if (res.ok || res.status === 201) localStorage.setItem(subKey, '1');
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
    if (!row || row.total < 1) { el.style.display = 'none'; return; }
    const iv = row.total < 5
      ? `Rank ${row.rank} of ${row.total} ${row.total === 1 ? 'player' : 'players'}`
      : row.top_pct > 50
        ? `Bottom ${100 - row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`
        : `Top ${row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`;
    const lr = el.querySelector('.lb-row');
    if (lr) lr.innerHTML = `<span class="ik">Today's Ranking</span><span class="iv" style="color:var(--ink)">${iv}</span>`;
  } catch(e) {
    if (DEV_OVERRIDE) console.error("Leaderboard fetch failed:", e);
  }
}

// ─── DEV TOOLS ───────────────────────────────────────────────────────────

function devReset() {
  localStorage.removeItem(getStateKey());
  location.reload();
}

function devApplyMod(k) {
  S.forcedMod = k;
  saveState();
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
  if(!on && ['gold','whale','orange'].includes(getPref('cardback'))) setPref('cardback','default');
  if(!on && getPref('felt')==='maroon') setPref('felt','default');
  if(!on && getPref('deck')==='emoji') setPref('deck','default');
  applyPrefs();
  const cb=document.getElementById('dev-unlocks-cb');
  if(cb) cb.checked=on;
}

function toggleTestSeed() {
  if (_testActive()) {
    localStorage.removeItem('gambdle_use_test_seed');
    localStorage.removeItem('gambdle_test_state');
  } else {
    localStorage.setItem('gambdle_use_test_seed', '1');
    localStorage.removeItem('gambdle_test_state');
  }
  const cb = document.getElementById('dev-test-seed-cb');
  if (cb) cb.checked = _testActive();
}

// ─── STATUS BAR ──────────────────────────────────────────────────────────

const STATUS_HINT = {
  intro:    'Idle — start a new game.',
  bj:       'Blackjack — choose action.',
  poker:    "Hold'em — choose action.",
  roulette: 'Roulette — place a bet.',
  results:  '<span class="sb-prefix">Game complete · </span>New game at midnight PST daily.',
};

function statusBar(){
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h>=12 ? 'PM' : 'AM';
  const hh = (h%12) || 12;
  const tm = `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  const hint = STATUS_HINT[S.screen] || 'Ready.';
  return `<div class="status-bar">
    <span>${hint}</span>
    <span>Gambdle #${S.day}  ·  ${tm}</span>
  </div>`;
}

// ─── RENDER ──────────────────────────────────────────────────────────────

function render(){
  const scr={intro:screenIntro,bj:screenBJ,poker:GAME2==='uth'?screenUTH:screenPoker,roulette:screenRoulette,results:screenResults};
  const inner = (scr[S.screen]||screenIntro)();
  document.getElementById('app').innerHTML=`<div class="app">
    <div class="window">
      ${inner}
      ${statusBar()}
    </div>
  </div>`;
  const _panel = document.querySelector('.panel');
  const _mod = modBannerHTML();
  if (_panel && _mod) _panel.insertAdjacentHTML('afterbegin', _mod);
  if(_noAnim){
    _noAnim=false;
    document.querySelectorAll('.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
  }
  saveState();
  if (S.screen === 'results') submitAndFetchLeaderboard();
}

function updateChipDisplay() {
  const el = document.getElementById('chip-badge');
  if (el) {
    el.innerHTML = `💵 ${fmt(S.chips)}`;
  }
}

// ─── NAVIGATION & ACTIONS ────────────────────────────────────────────────

function goTo(s){S.screen=s;render();}
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('sounds/mediumbet.mp3');else playMp3('sounds/smallbet.mp3');}
function advanceTo(s){sndAdvance();if(s!=='results'&&S.chips<10)s='results';goTo(s);}
function startGame(){sndChip('allin');S.screen='bj';S.bjPhase='bet';render();}

// ─── BOOT ────────────────────────────────────────────────────────────────
loadState();
applyPrefs();
render();
