// The screens around the games: intro, borrow, Player's Choice picker, and the
// results screen with its leaderboard submission/fetch and score charts. The
// game screens themselves live in bj.js / uth.js / roulette.js; navigation and
// render() live in flow.js.

// ─── META SCREENS ───────────────────────────────────────────────────────────

// ─── SCREEN RENDERING ────────────────────────────────────────────────────

function screenIntro(){
  // Three groups (title · call-to-action · program). The panel distributes them with
  // space-between, so on slack layouts (desktop, tall phones) they spread across the
  // felt with breathing room, while within each group the spacing stays tight.
  return `${hdr('New Game')}
  <div class="panel intro-panel">
    <div class="intro-body">
      <div class="intro-grp intro-title">
        <div class="logo"><span class="logo-spade">♠</span>GAMBDLE</div>
        <div class="logo-sub">Daily Game #${S.day}</div>
      </div>
      <div class="intro-grp intro-cta">
        <div class="intro-lead">You start with <b>${cfmt(S.chips)} chips</b>.</div>
        <div class="intro-sub">${chipScale()>1?`Your final stack × ${chipScale()} is your leaderboard score.`:'Your final stack is your leaderboard score.'}</div>
        <button class="btn-gold btn-lg intro-start" onclick="startGame()">► Start new game</button>
      </div>
      <div class="intro-grp">
        <div class="intro-prog-label">Today's program:</div>
        ${renderIntroGameRows()}
      </div>
    </div>
  </div>`;
}

// One line in a "game manifest" list: an icon + label, and (when `net` is passed) a delta-colored
// chip value flush right. Intro's upcoming-games list uses the icon-only form; the results screen's
// per-game breakdown passes `net` for the colored value. The two forms render structurally
// different rows (icon+name vs label+net); layout tests measure both screens at 8 sizes, so the
// markup for each form must stay exact.
function gameManifestRow(iconHtml, label, net) {
  if (net === undefined) {
    return `
    <div class="gm-row">
      <span class="rnd-ic">${iconHtml}</span>
      <div class="rnd-nm">${label}</div>
    </div>`;
  }
  return `
      <div class="res-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span style="font-size:1rem">${label}</span>
        <span class="res-net" style="font-family:var(--btn-f);font-size:1.35rem;color:${col(net)}">${sign(net)}</span>
      </div>`;
}

function renderIntroGameRows() {
  const g1 = GAME_META[GAME1], g2 = GAME_META[GAME2];
  const games = [
    [g1.icon, g1.name, g1.desc],
    [g2.icon, g2.name, g2.desc],
    [icon('target'), 'Roulette', 'One spin · Anything is possible'],
  ];
  // One line per game: "1. Blackjack · 3 hands" (desc trimmed to the hand/spin count).
  const rows = games.map((g, i) => gameManifestRow(g[0], `${i+1}. ${g[1]} <span class="rnd-dc">${g[2].split(' · ')[0]}</span>`))
    .join('<div class="gm-sep"></div>');
  return `<div class="game-manifest">${rows}</div>`;
}

// ─── BORROW SCREEN ───────────────────────────────────────────────────────────

function screenBorrow(){
  const ret=S.borrowReturnScreen||GAME1;
  const retLabel=ret==='roulette'?'Final Round: Roulette →'
    :(GAME_META[ret]?`${GAME_META[ret].icon} ${GAME_META[ret].name} →`:ret+' →');
  const amt=_effectiveBorrowAmount();
  const amtTxt=cfmt(amt), chipW=amtTxt==='1'?'chip':'chips';
  const minC=getMod('min_chips')||0;
  const minNote=minC>BORROW_AMOUNT
    ?`<span style="font-size:.95rem;opacity:0.55"> (min bet: ${cfmt(minC)})</span>`:'';
  return`${hdr('Busted!')}
  <div class="panel" style="text-align:center">
    <div style="font-size:2.5rem;margin:10px 0 4px;color:var(--gold-hi)">${icon('coins',{fill:true})}</div>
    <div class="result-hl" style="color:var(--lose)">You're broke!</div>
    <div class="result-sub borrow-rem" style="color:var(--lose)">0 chips remaining</div>
    <div class="divider" style="margin:10px 0"></div>
    <div style="font-size:1.2rem;color:var(--cream);padding:0 8px 12px;line-height:1.55">
      Borrow <b style="color:var(--gold-hi)">${amtTxt} ${chipW}</b>${minNote} to keep playing.<br>
      <span style="font-size:1rem;opacity:0.7">Deducted from tomorrow's starting stack.</span>
    </div>
    <button class="btn-gold btn-lg" onclick="borrowChips()">${icon('coins',{fill:true})} Borrow ${fmt(amt)} chips</button>
    <button class="ch-clear" style="margin-top:12px;" onclick="declineBorrow()">✕ Accept defeat → Results</button>
  </div>`;
}

function borrowChips(){
  sndChip(5);
  const amt=_effectiveBorrowAmount();
  tx('sys','borrow',{amt});
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

// ─── PLAYER'S CHOICE PICKER ───────────────────────────────────────────────────
// Icon per modifier type, used on the picker buttons (presets carry a `type`, not an icon).
const _PC_ICON = { bj:icon('cards'), uth:icon('cowboy-hat'), roulette:icon('target'), cross:icon('shuffle'), choice:icon('dice-five') };

function screenChoice(){
  const choices = pendingPlayersChoice();
  // Defensive: only reachable when a pick is pending (startGame routes here). If not, fall back.
  if(!choices) return screenIntro();
  const cards = choices.map(c=>`
    <button class="pc-option" onclick="pickModifier('${c.key}')">
      <span class="pc-icon">${_PC_ICON[c.type]||icon('sparkle')}</span>
      <span class="pc-text">
        <span class="pc-title">${c.title}</span>
        <span class="pc-desc">${c.desc}</span>
      </span>
    </button>`).join('');
  return `${hdr("Player's Choice")}
  <div class="panel pc-panel" style="text-align:center">
    <div class="pc-head">PLAYER'S CHOICE</div>
    <div class="pc-sub">The casino is feeling generous. Today only, pick your own daily mod.</div>
    <div class="pc-grid">${cards}</div>
  </div>`;
}

// Commits the player's pick and starts the run. Instant-commit: one tap locks it for the day.
// Persists the pick and navigation state, then plays the "allin" sound and redraws.
function pickModifier(key){
  const choices = pendingPlayersChoice();
  if(!choices || !choices.some(c=>c.key===key)) return; // only a currently-offered choice is valid
  tx('sys','pick',{mod:key}); // changes the day's active modifier: replay needs it
  mutate(s => {
    s.pcPick=key;
    _enterFirstSlot();
  });
  sndChip('allin');
  render();
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
  // for the live day: a backlog/archive run shouldn't claim a current streak.
  const streak = _backlogSeed ? 0 : computeStreak(getDailySeed(), true).current;
  const streakHtml = streak >= 1 ? `<div class="results-streak">🔥 ${streak}-Day Streak</div>` : '';

  return `${hdr('Daily Results')}
  <div class="panel results-panel" style="text-align:center">
    <div class="results-hero">
      <div class="results-tier" style="color:var(--cream);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:2px">${tier}</div>
      <div class="big-chips" style="font-family:var(--btn-f);font-size:5rem;line-height:1;letter-spacing:.04em;color:var(--gold-hi);text-shadow:2px 2px 0 rgba(0,0,0,0.45)">${fmt(S.chips)}</div>
      ${chipScale()>1?`<div class="big-chips-note" style="font-size:.8rem;color:var(--cream);opacity:.7;text-transform:uppercase;letter-spacing:.14em;margin-top:2px">${(S.chips/chipScale()).toLocaleString(undefined,{maximumFractionDigits:2})} chips × ${chipScale()}</div>`:''}
      ${streakHtml}
    </div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${[[g1Label,g1Net],[g2Label,g2Net],[`${icon('target')} Roulette`,rNet],...(S.ladResult?[[`${icon('ladder')} The Ladder`,S.ladResult.delta]]:[])].map(([lbl,net],i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}${gameManifestRow(null,lbl,net)}`).join('')}
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
    <div class="share-cluster">
      <div class="share-box">${shareText}</div>
      <button class="btn-gold" onclick="doShare()">${icon('clipboard-text')}Copy &amp; Share</button>
    </div>
  </div>`;
}

// ─── RESULTS METRICS (fetch → cache → paint) ─────────────────────────────
// The results screen carries two async metrics (leaderboard ranking, score distribution): each
// resolves once per seed and re-paints on every results draw thereafter. resultsMetric() is the
// shared lifecycle: fetch(seed) does the I/O and returns the cache payload (or null/undefined on
// failure, leaving the cache empty so a later re-render retries); paint(cache) is pure DOM, called
// only when elId is present on screen (so navigating away mid-fetch can't paint into a stale node).
// ensure() is the render()-facing entry (fetch-if-stale-then-paint); repaint() is the cache-hit-only
// path, exposed for symmetry but currently unused outside ensure().
function resultsMetric({ fetch, paint, elId }) {
  let cache = null;
  function repaint() {
    if (!cache) return;
    if (elId && !document.getElementById(elId)) return;
    paint(cache);
  }
  async function ensure() {
    const seed = getActiveSeed();
    if (!cache || cache.seed !== seed) {
      cache = null;
      const data = await fetch(seed);
      if (data != null) cache = { seed, ...data };
    }
    repaint();
  }
  return { ensure, repaint };
}

// Submits the score to Supabase once per day per device (side-effecting; not itself a metric),
// then resolves the leaderboard metric for the day. render() calls submitAndFetchLeaderboard() on
// every results draw: the submit is guarded to run at most once, and the ranking fetch runs once
// per seed via _lbMetric: a re-render is a cache hit that just repaints (so a redraw keeps the
// rank instead of dropping back to "Loading…").
async function submitAndFetchLeaderboard() {
  if (!sbConfigured()) return;
  const seed = getActiveSeed();
  const subKey = `gambdle_submitted_${seed}`;

  if (!_backlogSeed && !_ls.getItem(subKey) && !DEV_OVERRIDE && !_testActive()) {
    // The transcript (S.tx) is stored server-side for auditing and, in integrity Phase 2, replayed
    // to recompute the score. unverifiedSpin marks a run whose spin fell back to a local draw.
    // 409 = this device already has a row for today (DB-level dedup): treat as submitted.
    const res = await sbFetch('/functions/v1/submit-score', {
      method: 'POST',
      body: {
        seed,
        chips: Math.max(0, S.chips),
        fingerprint: getDeviceId(),
        tx: Array.isArray(S.tx) ? S.tx : [],
        unverifiedSpin: S.rUnverified === true,
      },
    });
    if (res && (res.ok || res.status === 409)) _ls.setItem(subKey, '1');
  }

  await _lbMetric.ensure();
}

// { status:'row'|'norow', row }: only a resolved response is cached (null/undefined on fetch
// failure), so a failed fetch leaves "Loading…" and the next re-render retries.
const _lbMetric = resultsMetric({
  elId: 'lb-stat',
  async fetch(seed) {
    _lbTopPct = null;
    const data = await sbJson('/rest/v1/rpc/get_percentile', { method: 'POST', body: { p_seed: seed, p_chips: S.chips } });
    if (data == null) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return { status: row ? 'row' : 'norow', row };
  },
  paint(cache) {
    const el = document.getElementById('lb-stat');
    const row = cache.row;
    if (cache.status === 'norow' || !row) { el.style.display = 'none'; return; }
    const lbl = _backlogSeed ? `Day #${S.day} Ranking` : "Today's Ranking";
    const lr = el.querySelector('.lb-row');
    if (row.total < 10) {
      const rank = Math.ceil(row.top_pct / 100 * row.total);
      if (lr) lr.innerHTML = `<span class="ik">${lbl}</span><span class="iv" style="color:var(--ink)">Rank ${rank} of ${row.total}</span>`;
      return;
    }
    _lbTopPct = row.top_pct;
    _refreshShareBox(); // now that the percentile is known, fold "Finished Top X%" into the share text
    const iv = row.top_pct > 50
      ? `Bottom ${100 - row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`
      : `Top ${row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`;
    if (lr) lr.innerHTML = `<span class="ik">${lbl}</span><span class="iv" style="color:var(--ink)">${iv}</span>`;
  },
});

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

// Resolves the score-distribution chart data once per seed via the shared resultsMetric lifecycle
// (cached so a re-render repaints without re-fetching). Outcomes preserved exactly: a network error
// / timeout falls back to the local history chart; a server error or empty set hides the chart; a
// thin field (< 10 plays) also shows history; a full field renders the live distribution. Every
// outcome caches a mode (never null), so this metric's fetch always resolves on the first try.
// Function declaration on purpose: a top-level const never becomes a window global, and the
// boot-surface check (game-shell test) + flow.js reach this by its global name.
function fetchScoreDistribution(){ return _distMetric.ensure(); } // { mode:'dist'|'history'|'hide', counts? }
const _distMetric = resultsMetric({
  elId: 'dist-chart',
  async fetch(seed) {
    const res = await sbFetch('/rest/v1/rpc/get_score_distribution', { method: 'POST', body: { p_seed: seed }, timeout: 5000 });
    if (res === null) return { mode: 'history' };      // network error / timeout
    if (!res.ok) return { mode: 'hide' };               // server error
    // undefined = a 2xx body that failed to parse → history (matches the original outer-catch);
    // a body that legitimately parses to null/[]/non-array → hide.
    let data; try { data = await res.json(); } catch(e) { data = undefined; }
    if (data === undefined) return { mode: 'history' };
    if (!Array.isArray(data) || data.length === 0) return { mode: 'hide' };
    const counts = data.map(b => parseInt(b.count));
    const total = counts.reduce((a, c) => a + c, 0);
    return total < 10 ? { mode: 'history' } : { mode: 'dist', counts };
  },
  paint(cache) {
    const el = document.getElementById('dist-chart');
    if (cache.mode === 'dist') { _renderScoreDist(el, cache.counts); return; }
    if (cache.mode === 'history') { _showHistoryChart(el); return; }
    el.style.display = 'none';
    document.getElementById('dist-title')?.style.setProperty('display', 'none');
  },
});

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
  // neighbouring bars instead, so it never crowds the count atop the taller bar. (left:4px = label
  // right of line; right:4px = left of line.)
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
