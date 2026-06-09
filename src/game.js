
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
      <div style="font-size:1.8rem;color:var(--cream)">You start with <b style="color:var(--gold-hi)">${fmt(S.chips)} chips</b>.</div>
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

// ─── BORROW SCREEN ───────────────────────────────────────────────────────────

function screenBorrow(){
  const ret=S.borrowReturnScreen||GAME1;
  const retLabel=ret==='roulette'?'Final Round: Roulette →'
    :(GAME_META[ret]?`${GAME_META[ret].icon} ${GAME_META[ret].name} →`:ret+' →');
  const amt=_effectiveBorrowAmount();
  const minC=getMod('min_chips')||0;
  const minNote=minC>BORROW_AMOUNT
    ?`<span style="font-size:.95rem;opacity:0.55"> (min bet: ${fmt(minC)})</span>`:'';
  return`${hdr('Busted!')}
  <div class="panel" style="text-align:center">
    <div style="font-size:2.5rem;margin:10px 0 4px">💸</div>
    <div class="result-hl" style="color:var(--lose)">You're broke!</div>
    <div class="result-sub" style="color:var(--shadow)">0 chips remaining</div>
    <div class="divider" style="margin:10px 0"></div>
    <div style="font-size:1.2rem;color:var(--cream);padding:0 8px 12px;line-height:1.55">
      Borrow <b style="color:var(--gold-hi)">${fmt(amt)} chips</b>${minNote} to keep playing.<br>
      <span style="font-size:1rem;opacity:0.7">Deducted from tomorrow's starting stack.</span>
    </div>
    <button class="btn-gold btn-lg" onclick="borrowChips()">💸 Borrow ${fmt(amt)} chips</button>
    <button class="ch-clear" style="margin-top:12px;" onclick="declineBorrow()">✕ Accept defeat → Results</button>
  </div>`;
}

function borrowChips(){
  sndChip(5);
  const amt=_effectiveBorrowAmount();
  S.chips=amt;
  S.borrowUsed=true;
  S.borrowAmount=amt;
  _ls.setItem('gambdle_borrow_debt',JSON.stringify({amount:amt,targetSeed:_nextDailySeed()}));
  _submitBorrow();
  const ret=S.borrowReturnScreen||GAME1;
  S.borrowReturnScreen=null;
  goTo(ret);
}

function declineBorrow(){
  S.borrowUsed=true;
  S.borrowReturnScreen=null;
  advanceTo('results');
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
  // Daily streak (today counts even though saveState hasn't persisted it yet). Only shown
  // for the live day — a backlog/archive run shouldn't claim a current streak.
  const streak = _backlogSeed ? 0 : computeStreak(getDailySeed(), true).current;
  const streakHtml = streak >= 1 ? `<div class="results-streak">🔥 ${streak}-Day Streak</div>` : '';

  return `${hdr('Daily Results')}
  <div class="panel results-panel" style="text-align:center">
    <div class="results-tier" style="font-size:1.05rem;color:var(--cream);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:2px">${tier}</div>
    <div class="big-chips" style="font-family:var(--btn-f);font-size:5rem;line-height:1;letter-spacing:.04em;color:var(--gold-hi);text-shadow:2px 2px 0 rgba(0,0,0,0.45)">${fmt(S.chips)}</div>
    ${streakHtml}
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${[[g1Label,g1Net],[g2Label,g2Net],['🎡 Roulette',rNet]].map(([lbl,net],i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}
      <div class="res-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span style="font-size:1rem">${lbl}</span>
        <span class="res-net" style="font-family:var(--btn-f);font-size:1.35rem;color:${col(net)}">${sign(net)}</span>
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
        body: JSON.stringify({ seed, chips: S.chips, fingerprint: getDeviceId() })
      });
      if (res.ok) _ls.setItem(subKey, '1');
    } catch(e) {
      if (DEV_OVERRIDE) console.error("Leaderboard submission failed:", e);
    }
  }

  _lbTopPct = null;
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
    _lbTopPct = row.top_pct;
    _refreshShareBox(); // now that the percentile is known, fold "Finished Top X%" into the share text
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
    _renderScoreDist(el, counts);
  } catch(e) {
    clearTimeout(timer);
    const el = document.getElementById('dist-chart');
    if (!el) return;
    _showHistoryChart(el);
    if (DEV_OVERRIDE) console.error('Distribution fetch failed:', e);
  }
}

// Builds the 7-bucket score-distribution chart (bars + counts + bucket labels + the You line/label)
// into `el` for the given per-bucket `counts`. Split out from fetchScoreDistribution so it can be
// rendered synchronously in tests (the fetch can't run offline). Uses S.chips for the You marker.
function _renderScoreDist(el, counts) {
  const sorted = [...counts].sort((a, b) => b - a);
  // Sqrt scaling when the tallest bucket is 3× the second-tallest, so one outlier doesn't flatten all other bars.
  const useLog = sorted[0] > 0 && sorted[1] > 0 && sorted[0] / sorted[1] > 3;
  const scaled = counts.map(c => useLog ? Math.sqrt(c) : c);
  const maxScaled = Math.max(...scaled, 1);
  const playerBucket = S.chips <= 249 ? 0 : S.chips <= 499 ? 1 : S.chips <= 999 ? 2 : S.chips <= 1999 ? 3 : S.chips <= 2999 ? 4 : S.chips <= 3999 ? 5 : 6;
  const labels = ['0', '250', '500', '1k', '2k', '3k', '4k'];
  const bucketBounds = [[0,249],[250,499],[500,999],[1000,1999],[2000,2999],[3000,3999],[4000,10000]];
  const [bLo, bHi] = bucketBounds[playerBucket];
  const posWithin = Math.min(Math.max((S.chips - bLo) / (bHi - bLo), 0), 1);
  const youPct = (playerBucket + posWithin) / 7 * 100;
  // Label side: by default keep it inside the chart (left half → right of line, right half → left).
  // For any interior bucket (not the 0 or 5k+ ends) put the label over the SHORTER of the two
  // neighbouring bars instead, so it never crowds the count atop the taller bar — no longer gated
  // on the You line being near a bucket border. (left:4px = label right of line; right:4px = left of line.)
  let youLblStyle = youPct > 50 ? 'right:4px' : 'left:4px';
  if (playerBucket >= 1 && playerBucket <= 5) {
    const leftCnt = counts[playerBucket - 1], rightCnt = counts[playerBucket + 1];
    if (leftCnt !== rightCnt) youLblStyle = leftCnt > rightCnt ? 'left:4px' : 'right:4px';
  }
  const tallestBucket = counts.indexOf(Math.max(...counts));
  const inTallest = playerBucket === tallestBucket;

  const cols = counts.map((cnt, i) => {
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
}

// ─── DEV TOOLS ───────────────────────────────────────────────────────────

// Thin wrapper so tests can override it without touching location directly.
function _doReload() { location.reload(); }

function devReset() {
  _ls.removeItem(getStateKey());
  _doReload();
}

function devSetGame(slot, value) {
  _ls.setItem('gambdle_dev_game' + slot, value);
  _ls.removeItem(getStateKey());
  _doReload();
}

function devApplyMod(k) {
  S.forcedMod = k;
  render();
}
function devSpin(){
  S.screen='roulette';S.rPhase='bet';
  // Place a fresh, varied 5-bet set so the multi-bet spin + result flow gets exercised across
  // bet types: a straight number, a color, a 2:1 row (column), a dozen, and an even-money bet.
  if(S.rBets.length===0){
    for(const pick of [17,45,37,40,44]){ if(S.chips>=10){debit(10,'dev-spin');S.rBets.push({pick,bet:10});} }
  }
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
  borrow:   'Broke — borrow chips to continue.',
  results:  '<span class="sb-prefix">Game complete · </span>New game at midnight<span class="sb-suffix"> Arizona time</span>',
  devstats: 'Dev mode — player statistics.',
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
    <span>${DEV_OVERRIDE ? `${GAME_VERSION} · ` : ''}${hint}</span>
    <span><span id="sb-mute-icon" onclick="togglePref('mute');event.stopPropagation()" style="cursor:pointer;font-size:0.85em" title="${getPref('mute')?'Unmute':'Mute'}">${getPref('mute')?'🔇':'🔊'}</span>${_modeLabel} #${S.day}  ·  ${tm}</span>
  </div>`;
}

// ─── DEV STATS SCREEN ────────────────────────────────────────────────────

function screenDevStats() {
  const seed = getActiveSeed();
  return `${hdr('Dev Stats · Day #' + S.day)}
  <div class="panel" style="text-align:center">
    <div style="font-family:var(--btn-f);font-size:1.6rem;color:var(--gold-hi);margin-bottom:2px">Day #${S.day} Stats</div>
    <div style="font-size:0.72rem;color:var(--shadow);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Seed ${seed}</div>
    <div class="divider"></div>
    <div id="devstats-body">
      <div style="color:var(--shadow);padding:18px 0">Fetching…</div>
    </div>
    <div class="divider"></div>
    <button class="btn-gold" onclick="goTo('intro')">← Close</button>
  </div>`;
}

async function fetchDevStats() {
  const el = document.getElementById('devstats-body');
  if (!el) return;
  const seed = getActiveSeed();
  const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };
  // Renders a grouped 2-col grid with section labels spanning both columns.
  const renderGroups = (groups) =>
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;text-align:left">` +
    groups.map(([title, rows]) =>
      `<div class="dvs-grp-lbl">${title}</div>` +
      rows.map(([k, v]) => `<div class="irow"><span class="ik">${k}</span><span class="iv">${v}</span></div>`).join('')
    ).join('') + `</div>`;
  const warn = (txt) => `<span style="color:var(--shadow);font-size:.75rem">${txt}</span>`;
  const pct  = (n, d) => d > 0 ? ` <span style="color:var(--shadow);font-size:.75rem">(${Math.round(n/d*100)}%)</span>` : '';

  try {
    // Fetch scores, starts count, and borrows count in parallel.
    const [res, startsRes, borrowsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/scores?seed=eq.${seed}&select=chips,created_at,fingerprint&order=chips.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/starts?seed=eq.${seed}&select=id`, {
        headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0', 'Range-Unit': 'items' },
      }).catch(() => null),
      fetch(`${SUPABASE_URL}/rest/v1/borrows?seed=eq.${seed}&select=id`, {
        headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0', 'Range-Unit': 'items' },
      }).catch(() => null),
    ]);
    // Parse an exact count from a response's Content-Range header ("0-0/47" or "*/0"); null if absent.
    const countOf = (r) => {
      const n = parseInt(r?.headers?.get('Content-Range')?.split('/')[1]);
      return Number.isFinite(n) ? n : null;
    };
    const startsCount = countOf(startsRes);
    const borrowsCount = countOf(borrowsRes);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const total = rows.length;

    // Engagement values — computable even with zero completions.
    const startedVal = startsCount !== null ? fmt(startsCount) : warn('needs table');
    const dnfCount = startsCount !== null ? Math.max(startsCount - total, 0) : null;
    const dnfVal = dnfCount !== null
      ? `${fmt(dnfCount)}${pct(dnfCount, startsCount)}`
      : warn('—');
    const completionVal = startsCount !== null && startsCount > 0
      ? `${Math.round(total / startsCount * 100)}%`
      : startsCount === 0 ? warn('no starts yet') : warn('—');
    // Borrowed = devices that actually took the loan today (% of starts — the base for any
    // in-run behaviour; shown in Outcomes below). Computed here so it's ready for that group.
    const borrowedVal = borrowsCount !== null
      ? `${fmt(borrowsCount)}${pct(borrowsCount, startsCount)}`
      : warn('needs table');

    const engagementGroup = ['Engagement', [
      ['Started today',    startedVal],
      ['Completed',        fmt(total)],
      ['DNF',              dnfVal],
      ['Completion rate',  completionVal],
    ]];

    // No completions yet → render engagement-only and bail.
    if (total === 0) {
      el.innerHTML = renderGroups([engagementGroup]) +
        `<div style="color:var(--shadow);padding:14px 0;text-align:center">No completed runs yet for seed ${seed}.</div>`;
      return;
    }

    const scores = rows.map(r => r.chips);
    const fingerprintedCount = rows.filter(r => r.fingerprint).length;
    const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / total);
    const sorted = [...scores].sort((a, b) => a - b);
    const med    = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2)
      : sorted[Math.floor(sorted.length/2)];
    const max    = scores[0];
    const bozos  = scores.filter(s => s === 0).length;
    const inProfit = scores.filter(s => s > START_CHIPS).length;

    // Hourly submission breakdown from created_at
    const hourBuckets = Array(24).fill(0);
    for (const r of rows) {
      const h = new Date(r.created_at);
      hourBuckets[(h.getUTCHours() + 17) % 24]++; // shift to Phoenix time (UTC-7)
    }
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakAMPM = peakHour === 0 ? '12am' : peakHour < 12 ? peakHour + 'am' : peakHour === 12 ? '12pm' : (peakHour - 12) + 'pm';

    // New players today — first-time fingerprints
    let newPlayers = null;
    try {
      const npr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_new_player_count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ p_seed: seed })
      });
      if (npr.ok) newPlayers = await npr.json();
    } catch(e) {}
    const newPlayersVal = newPlayers !== null ? fmt(newPlayers) : warn('needs RPC');
    const returningPlayers = newPlayers !== null ? fingerprintedCount - newPlayers : null;
    const returningVal = returningPlayers !== null
      ? `${fmt(returningPlayers)}${pct(returningPlayers, fingerprintedCount)}`
      : warn('needs RPC');

    // Score distribution — same RPC as results screen, no "you" line
    let distHTML = '';
    try {
      const dr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_score_distribution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ p_seed: seed })
      });
      if (dr.ok) {
        const dist = await dr.json();
        if (Array.isArray(dist) && dist.length) {
          const counts = dist.map(b => parseInt(b.count));
          const sorted2 = [...counts].sort((a, b) => b - a);
          const useLog = sorted2[0] > 0 && sorted2[1] > 0 && sorted2[0] / sorted2[1] > 3;
          const scaled = counts.map(c => useLog ? Math.sqrt(c) : c);
          const maxScaled = Math.max(...scaled, 1);
          const labels = ['0','250','500','1k','2k','3k','4k'];
          const cols = dist.map((b, i) => {
            const cnt = parseInt(b.count);
            const h = cnt > 0 ? Math.max((scaled[i] / maxScaled) * 100, 5) : 0;
            const lblOffsets = [-3,-12,-9,-9,-9,-9,-9];
            const endLbl = i === 6 ? '<span class="dist-lbl" style="right:-6px;left:auto;transform:none">5k+</span>' : '';
            return `<div class="dist-bar" style="height:${h}%">
              <span class="dist-count">${cnt}</span>
              <span class="dist-lbl" style="left:${lblOffsets[i]}px;transform:none">${labels[i]}</span>
              ${endLbl}
            </div>`;
          }).join('');
          distHTML = `<div class="dvs-grp-lbl" style="margin-top:8px">Score Distribution</div><div class="dist-wrap"><div class="dist-bars">${cols}</div></div>`;
        }
      }
    } catch(e) {}

    el.innerHTML = renderGroups([
      engagementGroup,
      ['Audience', [
        ['New today',        newPlayersVal],
        ['Returning',        returningVal],
      ]],
      ['Scores', [
        ['Average',          fmt(avg)],
        ['Median',           fmt(med)],
        ['High score',       fmt(max)],
      ]],
      ['Outcomes', [
        ['In profit',        `${fmt(inProfit)}${pct(inProfit, total)}`],
        ['Went bust',        `<span style="color:${bozos>0?'var(--lose)':'inherit'}">${fmt(bozos)}</span>${pct(bozos, total)}`],
        ['Peak hour',        peakAMPM],
        ['Borrowed',         borrowedVal],
      ]],
    ]) + distHTML;
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:var(--lose);padding:10px 0">Error: ${err.message}</div>`;
  }
}

// ─── RENDER ──────────────────────────────────────────────────────────────

// Full re-render — replaces all of #app. Use surgical DOM updates mid-hand to avoid flash.
function render(){
  const scr={intro:screenIntro,bj:screenBJ,uth:screenUTH,poker:screenPoker,roulette:screenRoulette,borrow:screenBorrow,results:screenResults,devstats:screenDevStats};
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
    } else {
      // Desktop: if the description would wrap, shrink the title to free horizontal room.
      // Falls back to shrinking the description if title can't go smaller. Keeps the banner
      // at single-line height so every screen has a predictable vertical budget.
      const r = _panel.querySelector('.mod-banner-r');
      const t = _panel.querySelector('.mod-banner-title');
      if (r && t) {
        r.style.whiteSpace = 'nowrap';
        let tfs = parseFloat(getComputedStyle(t).fontSize);
        while (r.scrollWidth > r.clientWidth && tfs > 22) {
          tfs -= 1; t.style.fontSize = tfs + 'px';
        }
        let rfs = parseFloat(getComputedStyle(r).fontSize);
        while (r.scrollWidth > r.clientWidth && rfs > 15) {
          rfs -= 0.5; r.style.fontSize = rfs + 'px';
        }
      }
    }
  }
  _reapplyDragPos();
  _updateBalloonPosition();
  if(_noAnim){
    _noAnim=false;
    document.querySelectorAll('.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
  }
  saveState();
  if (S.screen === 'results') { submitAndFetchLeaderboard(); fetchScoreDistribution(); }
  if (S.screen === 'devstats') fetchDevStats();
  _runTutorial();
  _drawLayoutDebug();
}

// ─── DEV: Layout Debug Overlay ──────────────────────────────────────────
// Toggleable visualizer that overlays red/cyan/yellow lines on the panel
// showing the top of every direct child + the slack region at the bottom.
// Activated from the dev dropdown ("📐 Layout Debug"). Persisted in _ls so
// it survives renders, route changes, and reloads.
function devToggleLayoutDebug() {
  const on = !document.body.classList.contains('layout-debug');
  document.body.classList.toggle('layout-debug', on);
  try { _ls.setItem('gambdle_dev_layout_debug', on ? '1' : ''); } catch(e) {}
  _drawLayoutDebug();
}

function _drawLayoutDebug() {
  const existing = document.getElementById('layout-debug-overlay');
  if (existing) existing.remove();
  if (!document.body.classList.contains('layout-debug')) return;

  const panel = document.querySelector('.panel');
  if (!panel) return;
  const pr = panel.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.id = 'layout-debug-overlay';
  // overflow:visible so labels at y=0 / y=pr.height aren't clipped at the panel edges.
  overlay.style.cssText = `position:fixed;left:${pr.left}px;top:${pr.top}px;width:${pr.width}px;height:${pr.height}px;pointer-events:none;z-index:9999;font:bold 14px 'Courier New',monospace;overflow:visible`;

  // labelSide: 'below' (default) puts the label just below the line; 'above' puts it just above.
  const addLine = (yRel, label, color, opts={}) => {
    const { anchor='left', labelSide='below' } = opts;
    const line = document.createElement('div');
    line.style.cssText = `position:absolute;left:0;right:0;top:${yRel-1}px;height:2px;background:${color};box-shadow:0 0 6px ${color}`;
    overlay.appendChild(line);
    const lbl = document.createElement('div');
    const side = anchor === 'right' ? 'right:4px' : 'left:4px';
    const vert = labelSide === 'above' ? `bottom:${pr.height - yRel + 3}px` : `top:${yRel + 3}px`;
    lbl.style.cssText = `position:absolute;${side};${vert};background:rgba(0,0,0,0.9);color:${color};padding:2px 7px;border-radius:3px;white-space:nowrap;letter-spacing:0.04em`;
    lbl.textContent = label;
    overlay.appendChild(lbl);
  };

  addLine(0, `▲ PANEL TOP  (h=${Math.round(pr.height)}, w=${Math.round(pr.width)})`, '#ff5555');
  // Panel bottom label goes ABOVE its line so it stays inside the panel (and doesn't
  // collide with the slack measurement, which also sits in that region).
  addLine(pr.height, `▼ PANEL BOTTOM`, '#ff5555', { labelSide: 'above', anchor: 'right' });

  const kids = [...panel.children].filter(c => c.getBoundingClientRect().height > 0);
  let anchor = 'left';
  kids.forEach((child) => {
    const r = child.getBoundingClientRect();
    const yTop = r.top - pr.top;
    const tag = child.id ? '#' + child.id : '.' + ((child.className || '').toString().split(' ')[0] || child.tagName.toLowerCase());
    addLine(yTop, `${tag}  y=${Math.round(yTop)}  h=${Math.round(r.height)}px`, '#22d3ee', { anchor });
    anchor = anchor === 'left' ? 'right' : 'left';
  });

  const lastKid = kids[kids.length - 1];
  if (lastKid) {
    const lastBot = lastKid.getBoundingClientRect().bottom - pr.top;
    const slack = Math.round(pr.height - lastBot);

    // Translucent fill in the slack region so the measurement is unambiguous.
    if (slack > 0) {
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;right:0;top:${lastBot}px;height:${slack}px;background:rgba(250,204,21,0.18);border-top:1px dashed rgba(250,204,21,0.5);border-bottom:1px dashed rgba(250,204,21,0.5)`;
      overlay.appendChild(fill);

      // Big "SLACK = Npx" label centered vertically inside the slack zone.
      const mid = document.createElement('div');
      const midY = lastBot + slack / 2;
      mid.style.cssText = `position:absolute;left:50%;top:${midY}px;transform:translate(-50%,-50%);background:#facc15;color:#000;padding:4px 12px;border-radius:4px;font-size:18px;border:2px solid #000;box-shadow:0 0 8px rgba(0,0,0,0.6)`;
      mid.textContent = `↕ SLACK = ${slack}px`;
      overlay.appendChild(mid);
    }

    addLine(lastBot, `◆ LAST CHILD BOTTOM  y=${Math.round(lastBot)}`, '#facc15');
  }

  document.body.appendChild(overlay);
}

if (_ls.getItem('gambdle_dev_layout_debug') === '1') {
  document.body.classList.add('layout-debug');
}
window.addEventListener('resize', () => _drawLayoutDebug());

function updateChipDisplay() {
  const el = document.getElementById('chip-badge');
  if (el) {
    el.innerHTML = `💵 ${fmt(S.chips)}`;
  }
}

// ─── NAVIGATION & ACTIONS ────────────────────────────────────────────────

function goTo(s){S.screen=s;render();}
// Shared skip logic for all_in_or_skip: push a skip entry, increment the hand counter,
// advance to the next screen if done, otherwise reset and re-render.
function _skipHand(arr, entry, counterKey, nextScreen, resetFn) {
  arr.push(entry);
  S[counterKey]++;
  if (S[counterKey] >= 3) { advanceTo(nextScreen); return; }
  resetFn();
  render();
}

// Shared "next hand" flow: sound → reset → re-render (or go to results/borrow if busted).
function _nextHand(resetFn) {
  sndAdvance();
  resetFn();
  if (isChipBusted()) {
    if (_canShowBorrow()) {
      S.borrowReturnScreen = _borrowReturnScreen();
      S.screen = 'borrow';
    } else {
      S.screen = 'results';
    }
  }
  render();
}

// Produces the standard result panel used by BJ, UTH-fold, etc.
// detailHTML is injected between the delta line and the running total.
function _resultPanel(dotsHTML, delta, headlineHTML, detailHTML, btnAction, btnText, panelCls='') {
  return `<div class="panel ${panelCls}" style="text-align:center">
    ${dotsHTML}
    <div class="divider"></div>
    <div class="result-hl" style="color:${col(delta)}">${headlineHTML}</div>
    <div class="result-sub" style="color:${col(delta)}">${sign(delta)} chips</div>
    ${detailHTML}
    ${runningTotalRow()}
    ${nextBtn(btnAction, btnText)}
  </div>`;
}

// The advance button (label + onclick) shown on a card game's result screen — shared by Blackjack,
// Hold'em and Poker, which all phrase it identically. Busted → go to results; the last hand of 3 →
// the next game (worded "Final Round: Roulette" when roulette is the finale, else "Round 2: <name>");
// any earlier hand → the next hand. `nextScreen` is NEXT_SCREEN[game]; `nextHandCall` runs the
// game's own next-hand function (e.g. 'bjNext()').
function resultAdvanceBtn(isLast, nextScreen, nextHandCall) {
  if (isChipBusted()) return { text: 'Game Over 💀', action: "advanceTo('results')" };
  if (!isLast)        return { text: 'Next Hand →',  action: nextHandCall };
  const text = nextScreen === 'roulette' ? 'Final Round: Roulette →' : `Round 2: ${GAME_META[nextScreen].name} →`;
  return { text, action: `advanceTo('${nextScreen}')` };
}

// Plays a transition sound scaled to how well the player is doing.
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('assets/sounds/mediumbet.mp3');else playMp3('assets/sounds/smallbet.mp3');}
// Navigates between games; redirects to results early if the player is busted (<10 chips).
// If the borrow option is still available when a bust is detected, shows the borrow screen first.
function advanceTo(s){
  if(isChipBusted()&&_canShowBorrow()){
    if(s!=='results'){
      // Mid-game transition bust (e.g., would have gone to UTH/Roulette but broke).
      S.borrowReturnScreen=s;
    }else{
      // Explicit "Game Over" bust from a result phase — determine where to return if they borrow.
      const ret=_borrowReturnScreen();
      // Reset the current game to bet phase so returning lands on a fresh hand.
      if(ret==='bj') resetBJHand();
      else if(ret==='uth') resetUTHHand();
      else if(ret==='poker'){S.pkBet=0;S.pkPhase='bet';}
      S.borrowReturnScreen=ret;
    }
    sndAdvance();goTo('borrow');return;
  }
  if(s!=='results'&&isChipBusted())s='results';
  if(s==='results'&&!DEV_OVERRIDE){
    const _calc=START_CHIPS+(S.borrowUsed?(S.borrowAmount||BORROW_AMOUNT):0)+gameNet(GAME1)+gameNet(GAME2)+(S.rResult?.delta||0);
    // Fall back to the current saved value if the recalculation is non-finite (corrupted history).
    // Skipped in dev mode so dev-menu chip bonuses aren't recomputed away on the results screen.
    S.chips=Number.isFinite(_calc)?_calc:S.chips;
  }
  sndAdvance();goTo(s);
}

// Returns the screen to navigate to after a borrow, based on where the player is mid-run.
function _borrowReturnScreen(){
  if(S.screen==='bj')    return S.bjHand<3  ?'bj'    :NEXT_SCREEN['bj'];
  if(S.screen==='uth')   return S.uthHand<3 ?'uth'   :NEXT_SCREEN['uth'];
  if(S.screen==='poker') return S.pkHand<3  ?'poker' :NEXT_SCREEN['poker'];
  return S.screen;
}
function startGame(){sndChip('allin');S.screen=GAME1;S.bjPhase='bet';render();_submitStart();}

// Fire-and-forget: records that this device started today's game.
// Skipped in dev/test/backlog modes; deduplicated per device per day via localStorage.
// Requires a `starts` table in Supabase — see .claude/VERSIONS.md for setup SQL.
async function _submitStart() {
  const seed = getActiveSeed();
  const key = `gambdle_started_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/starts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ seed, fingerprint: getDeviceId() }),
    });
    if (res.ok) _ls.setItem(key, '1');
  } catch(e) {}
}

// Fire-and-forget: records that this device took the borrow loan today (only when the chips are
// actually accepted via borrowChips — declining doesn't fire this). Skipped in dev/test/backlog
// modes; deduplicated per device per day via localStorage (borrow is once-per-day anyway).
// Requires a `borrows` table in Supabase — see .claude/VERSIONS.md for setup SQL.
async function _submitBorrow() {
  const seed = getActiveSeed();
  const key = `gambdle_borrowed_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/borrows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ seed, fingerprint: getDeviceId() }),
    });
    if (res.ok) _ls.setItem(key, '1');
  } catch(e) {}
}

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
  setTimeout(() => { app.style.transition = ''; _updateBalloonPosition(); }, 220);
}

function _winMousemove(e) {
  if (!_winDragStart) return;
  _winOffset.x = _winDragStart.ox + e.clientX - _winDragStart.mx;
  _winOffset.y = _winDragStart.oy + e.clientY - _winDragStart.my;
  const app = document.querySelector('.app');
  if (app) app.style.transform = `translate(${_winOffset.x}px,${_winOffset.y}px)`;
  _updateBalloonPosition();
}

function _winMouseup() {
  _winDragStart = null;
  document.removeEventListener('mousemove', _winMousemove);
}

// ─── Draggable dialog boxes (Help / About / modifier popups / Send Feedback) ───────────────
// These dialogs reuse the WinXP `.title-bar`, so grabbing one drags the DIALOG itself (a transform
// on its `.info-box`), not the main window behind it. Each window remembers its own drag offset on
// the element (`box._winOffset`), so several desktop floats track independently. The main window is
// locked only while a *blocking* (mobile) modal is open — desktop floats are non-blocking, so the
// game stays draggable underneath. The ✕/□ buttons (`.tb-btn`) never start a drag.
let _dlgDrag = null;

function _dlgMousemove(e) {
  if (!_dlgDrag) return;
  const o = _dlgDrag.box._winOffset;
  o.x = _dlgDrag.ox + e.clientX - _dlgDrag.mx;
  o.y = _dlgDrag.oy + e.clientY - _dlgDrag.my;
  _dlgDrag.box.style.transform = `translate(${o.x}px,${o.y}px)`;
}

function _dlgMouseup() {
  _dlgDrag = null;
  document.removeEventListener('mousemove', _dlgMousemove);
}

function _dragMousedown(e) {
  // Desktop window focus: a mousedown inside a floating window raises + activates it; a mousedown
  // anywhere else (including the game) greys every float. Runs before the drag routing below.
  const fw = e.target.closest('.info-modal.float-win');
  if (fw) focusWindow(fw.querySelector('.info-box')); else blurAllWindows();

  const tb = e.target.closest('.title-bar');
  if (!tb || e.target.closest('.tb-btn')) return;
  const modal = tb.closest('.info-modal');
  if (modal) {
    const box = modal.querySelector('.info-box');
    if (!box) return;
    e.preventDefault();
    const o = box._winOffset || (box._winOffset = { x: 0, y: 0 });
    _dlgDrag = { box, ox: o.x, oy: o.y, mx: e.clientX, my: e.clientY };
    document.addEventListener('mousemove', _dlgMousemove);
    document.addEventListener('mouseup', _dlgMouseup, { once: true });
    return;
  }
  if (document.querySelector('.info-modal:not(.float-win)')) return; // a blocking (mobile) modal — keep the window put
  e.preventDefault();
  _winDragStart = { mx: e.clientX, my: e.clientY, ox: _winOffset.x, oy: _winOffset.y };
  document.addEventListener('mousemove', _winMousemove);
  document.addEventListener('mouseup', _winMouseup, { once: true });
}

function initWindowDrag() {
  if (window.innerWidth <= 480 || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('mousedown', _dragMousedown);
}

// ─── BOOT ────────────────────────────────────────────────────────────────

// Handles mid-animation refreshes for UTH, Poker, and Roulette screens.
// _bjResumeAfterRefresh is kept separate due to its additional complexity.
function _resumeAfterRefresh() {
  if (S.screen === 'uth' && S.uthPhase === 'reveal') {
    setTimeout(() => {
      _noAnim = true; S.uthPhase = 'result'; render(); updateChipDisplay();
      const last = S.uthHistory[S.uthHistory.length - 1];
      if (last && last.delta > 0) setTimeout(sndBigWin, UTH_CARD_INTERVAL_MS);
    }, 300);
  } else if (S.screen === 'poker' && S.pkPhase === 'draw') {
    setTimeout(() => { S.pkHand++; S.pkPhase = 'result'; render(); }, 300);
  } else if (S.screen === 'roulette' && S.rPhase === 'spinning') {
    _rouletteAudio = getPref('mute') ? null : new Audio('assets/sounds/roulette ball.mp3');
    if (_rouletteAudio) { _rouletteAudio.volume = 0.5; _rouletteAudio.load(); }
    setTimeout(startWheelAnim, 60);
  }
}

// Shows the welcome popup on first ever visit (only when POPUP_ENABLED is true).
function _maybeShowWelcomePopup() {
  if (!POPUP_ENABLED) return;
  if (_ls.getItem('gambdle_popup_welcome_seen')) return;
  _ls.setItem('gambdle_popup_welcome_seen', '1');
  setTimeout(() => showPopup('welcome'), 1200);
}

loadState();
applyPrefs();
render();
initWindowDrag();
_bjResumeAfterRefresh();
_resumeAfterRefresh();
_maybeShowWelcomePopup();
