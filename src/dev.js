// ─── DEV TOOLING ────────────────────────────────────────────────────────────
// Everything reachable only from the dev menu (?dev=true): reset/jump helpers,
// the test-seed toggle, the Dev Stats screen + its Supabase queries, and the
// layout-debug overlay. None of this runs for players; the dev *menu* markup
// itself lives with the other dropdown menus in menus.js.

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
// Jump straight to the free-entry Ladder bonus round: forces the ladder_day mod so the
// bet screen shows the free entry (as on a real Ladder day) and lands on a fresh run.
function devLadder(){
  S.forcedMod = 'ladder_day';
  resetLadderRun();
  closeDropdowns();
  goTo('ladder');
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

// Builds the score-distribution bar chart from 7 bucket counts (<=249 … >=4000). Shared by the
// single-RPC fast path and the multi-query fallback so both draw the chart identically.
function _distChartHTML(counts) {
  if (!Array.isArray(counts) || counts.length !== 7) return '';
  const sorted = [...counts].sort((a, b) => b - a);
  const useLog = sorted[0] > 0 && sorted[1] > 0 && sorted[0] / sorted[1] > 3;
  const scaled = counts.map(c => useLog ? Math.sqrt(c) : c);
  const maxScaled = Math.max(...scaled, 1);
  const labels = ['0','250','500','1k','2k','3k','4k'];
  const lblOffsets = [-3,-12,-9,-9,-9,-9,-9];
  const cols = counts.map((cnt, i) => {
    const h = cnt > 0 ? Math.max((scaled[i] / maxScaled) * 100, 5) : 0;
    const endLbl = i === 6 ? '<span class="dist-lbl" style="right:-6px;left:auto;transform:none">5k+</span>' : '';
    return `<div class="dist-bar" style="height:${h}%">
      <span class="dist-count">${cnt}</span>
      <span class="dist-lbl" style="left:${lblOffsets[i]}px;transform:none">${labels[i]}</span>
      ${endLbl}
    </div>`;
  }).join('');
  return `<div class="dvs-grp-lbl" style="margin-top:8px">Score Distribution</div><div class="dist-wrap"><div class="dist-bars">${cols}</div></div>`;
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
  const net  = (n) => `<span style="color:${col(n)}">${sign(n)}</span>`;

  // ── Fast path: one RPC returns the entire payload (see supabase/dev_stats.sql). Falls through to
  // the multi-query path below if get_dev_stats isn't deployed yet. ─────────────────────────────
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_dev_stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ p_seed: seed }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.today && d.lifetime && d.last7) {
        const T = d.today, L = d.lifetime, W = d.last7;
        const ph = T.peak_hour;
        const peakAMPM = ph == null ? warn('n/a') : ph === 0 ? '12am' : ph < 12 ? ph + 'am' : ph === 12 ? '12pm' : (ph - 12) + 'pm';
        const dnf = Math.max((T.started || 0) - (T.completions || 0), 0);
        const returning = T.fingerprinted - T.new_players;
        const lifetimeGroup = ['Lifetime · All Days', [
          ['Unique players',   fmt(L.unique_players)],
          ['Completions',      fmt(L.completions)],
          ['Net chips',        net(L.net)],
          ['Avg plays/day',    fmt(Math.round(L.completions / Math.max(S.day, 1)))],
          ['Players/day (7d)', fmt(Math.round((W.plays || 0) / 7))],
          ['New players (7d)', fmt(W.new_players)],
        ]];
        const engagementGroup = ['Engagement', [
          ['Started today',   T.started > 0 || T.completions > 0 ? fmt(T.started) : warn('needs table')],
          ['Completed',       fmt(T.completions)],
          ['DNF',             T.started > 0 ? `${fmt(dnf)}${pct(dnf, T.started)}` : warn('n/a')],
          ['Completion rate', T.started > 0 ? `${Math.round(T.completions / T.started * 100)}%` : warn('no starts yet')],
        ]];
        if (T.completions === 0) {
          el.innerHTML = renderGroups([engagementGroup, lifetimeGroup]) +
            `<div style="color:var(--shadow);padding:14px 0;text-align:center">No completed runs yet for seed ${seed}.</div>`;
          return;
        }
        el.innerHTML = renderGroups([
          engagementGroup,
          ['Audience', [
            ['New today',  fmt(T.new_players)],
            ['Returning',  `${fmt(returning)}${pct(returning, T.fingerprinted)}`],
          ]],
          ['Scores', [
            ['Average',    fmt(T.avg)],
            ['Median',     fmt(T.median)],
            ['High score', fmt(T.high)],
            ['Net chips',  net(T.net)],
          ]],
          ['Outcomes', [
            ['In profit',  `${fmt(T.in_profit)}${pct(T.in_profit, T.completions)}`],
            ['Went bust',  `<span style="color:${T.bust > 0 ? 'var(--lose)' : 'inherit'}">${fmt(T.bust)}</span>${pct(T.bust, T.completions)}`],
            ['Peak hour',  peakAMPM],
            ['Borrowed',   `${fmt(T.borrowed)}${pct(T.borrowed, T.started)}`],
          ]],
          lifetimeGroup,
        ]) + _distChartHTML(d.distribution || []);
        return;
      }
    }
  } catch (e) {}

  try {
    // Everything fires in one parallel batch: today's scores, the per-day counts, the lifetime count,
    // the rolling 7-day metrics, the per-seed new-player counts, and the score distribution.
    const countHeaders = { ...headers, 'Prefer': 'count=exact', 'Range': '0-0', 'Range-Unit': 'items' };
    const jsonHeaders = { 'Content-Type': 'application/json', ...headers };
    // Last 7 daily seeds (today first, then prior 6), Phoenix time — for the rolling 7-day metrics.
    const last7Seeds = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - _PHOENIX_OFFSET_MS); d.setUTCDate(d.getUTCDate() - i);
      return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    });
    const [res, startsRes, borrowsRes, lifeScoresRes, plays7Res, newPlayerCounts, distRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/scores?seed=eq.${seed}&select=chips,created_at,fingerprint&order=chips.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/starts?seed=eq.${seed}&select=id`, { headers: countHeaders }).catch(() => null),
      fetch(`${SUPABASE_URL}/rest/v1/borrows?seed=eq.${seed}&select=id`, { headers: countHeaders }).catch(() => null),
      // Lifetime completion count (header only). Unique players + net chips need a server-side aggregate
      // (count-distinct / sum over the whole table); a REST row fetch is capped by Supabase's row limit,
      // so those two are accurate only via the get_dev_stats fast path (run supabase/dev_stats.sql).
      fetch(`${SUPABASE_URL}/rest/v1/scores?select=id`, { headers: countHeaders }).catch(() => null),
      // Plays across the last 7 days (one submission per device per day, so this is player-days).
      fetch(`${SUPABASE_URL}/rest/v1/scores?seed=in.(${last7Seeds.join(',')})&select=id`, { headers: countHeaders }).catch(() => null),
      // New-player count per seed (index 0 = today, reused for "New today"; finite entries sum to the
      // 7-day total). One call per seed; a null entry means the RPC errored/was absent.
      Promise.all(last7Seeds.map(s =>
        fetch(`${SUPABASE_URL}/rest/v1/rpc/get_new_player_count`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ p_seed: s }) })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      )),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_score_distribution`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ p_seed: seed }) }).catch(() => null),
    ]);
    // Parse an exact count from a response's Content-Range header ("0-0/47" or "*/0"); null if absent.
    const countOf = (r) => {
      const n = parseInt(r?.headers?.get('Content-Range')?.split('/')[1]);
      return Number.isFinite(n) ? n : null;
    };
    const startsCount = countOf(startsRes);
    const borrowsCount = countOf(borrowsRes);

    // New players: index 0 of the per-seed counts is today; finite entries sum to the 7-day total.
    const newPlayers = Number.isFinite(newPlayerCounts[0]) ? newPlayerCounts[0] : null;
    const newPlayers7 = newPlayerCounts.every(v => Number.isFinite(v)) ? newPlayerCounts.reduce((a, b) => a + b, 0) : null;

    // Lifetime (all seeds, all days). Completion count is a cheap count header. Unique players and net
    // chips need a server-side aggregate (count-distinct / sum over the whole table) — a REST row fetch
    // is capped by Supabase's row limit and would badly undercount (a fingerprint that played thousands
    // of times still counts once, but we'd only see the first page of rows), so we DON'T fake them here.
    // They show real values via the get_dev_stats fast path above (run supabase/dev_stats.sql).
    const lifeCompletions = countOf(lifeScoresRes);
    const plays7 = countOf(plays7Res);
    const lifetimeGroup = ['Lifetime · All Days', [
      ['Unique players',   warn('needs RPC')],
      ['Completions',      lifeCompletions !== null ? fmt(lifeCompletions) : warn('n/a')],
      ['Net chips',        warn('needs RPC')],
      ['Avg plays/day',    lifeCompletions !== null ? fmt(Math.round(lifeCompletions / Math.max(S.day, 1))) : warn('n/a')],
      ['Players/day (7d)', plays7 !== null ? fmt(Math.round(plays7 / 7)) : warn('n/a')],
      ['New players (7d)', newPlayers7 !== null ? fmt(newPlayers7) : warn('needs RPC')],
    ]];

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const total = rows.length;

    // Engagement values — computable even with zero completions.
    const startedVal = startsCount !== null ? fmt(startsCount) : warn('needs table');
    const dnfCount = startsCount !== null ? Math.max(startsCount - total, 0) : null;
    const dnfVal = dnfCount !== null
      ? `${fmt(dnfCount)}${pct(dnfCount, startsCount)}`
      : warn('n/a');
    const completionVal = startsCount !== null && startsCount > 0
      ? `${Math.round(total / startsCount * 100)}%`
      : startsCount === 0 ? warn('no starts yet') : warn('n/a');
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

    // No completions yet → render engagement + lifetime (which spans all days) and bail.
    if (total === 0) {
      el.innerHTML = renderGroups([engagementGroup, lifetimeGroup]) +
        `<div style="color:var(--shadow);padding:14px 0;text-align:center">No completed runs yet for seed ${seed}.</div>`;
      return;
    }

    const scores = rows.map(r => r.chips);
    const fingerprintedCount = rows.filter(r => r.fingerprint).length;
    const bozos  = scores.filter(s => s === 0).length;
    const inProfit = scores.filter(s => s > START_CHIPS).length;
    // Value stats (avg/median/high/net) ignore scores above 100,000 — almost always tampered or
    // corrupted saves — so they don't skew. Counts above (and completions) still include every row.
    const valScores = scores.filter(s => s <= 100000); // rows are ordered chips.desc, so [0] is the max
    const avg    = valScores.length ? Math.round(valScores.reduce((a, b) => a + b, 0) / valScores.length) : 0;
    const sorted = [...valScores].sort((a, b) => a - b);
    const med    = sorted.length === 0 ? 0
      : sorted.length % 2 === 0 ? Math.round((sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2)
      : sorted[Math.floor(sorted.length/2)];
    const max    = valScores.length ? valScores[0] : 0;
    // Today's net chips — each finish's deviation from the 1,000-chip start (outliers excluded).
    const todayNet = valScores.reduce((a, s) => a + (s - START_CHIPS), 0);

    // Hourly submission breakdown from created_at
    const hourBuckets = Array(24).fill(0);
    for (const r of rows) {
      const h = new Date(r.created_at);
      hourBuckets[(h.getUTCHours() + 17) % 24]++; // shift to Phoenix time (UTC-7)
    }
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakAMPM = peakHour === 0 ? '12am' : peakHour < 12 ? peakHour + 'am' : peakHour === 12 ? '12pm' : (peakHour - 12) + 'pm';

    // New today / Returning — reuse the today entry from the per-seed counts fetched above.
    const newPlayersVal = newPlayers !== null ? fmt(newPlayers) : warn('needs RPC');
    const returningPlayers = newPlayers !== null ? fingerprintedCount - newPlayers : null;
    const returningVal = returningPlayers !== null
      ? `${fmt(returningPlayers)}${pct(returningPlayers, fingerprintedCount)}`
      : warn('needs RPC');

    // Score distribution — same RPC as results screen (fetched in the parallel batch above), no "you" line.
    let distHTML = '';
    try {
      if (distRes && distRes.ok) {
        const dist = await distRes.json();
        if (Array.isArray(dist) && dist.length) distHTML = _distChartHTML(dist.map(b => parseInt(b.count)));
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
        ['Net chips',        net(todayNet)],
      ]],
      ['Outcomes', [
        ['In profit',        `${fmt(inProfit)}${pct(inProfit, total)}`],
        ['Went bust',        `<span style="color:${bozos>0?'var(--lose)':'inherit'}">${fmt(bozos)}</span>${pct(bozos, total)}`],
        ['Peak hour',        peakAMPM],
        ['Borrowed',         borrowedVal],
      ]],
      lifetimeGroup,
    ]) + distHTML;
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:var(--lose);padding:10px 0">Error: ${err.message}</div>`;
  }
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
