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
  // Places a varied 5-bet set (a straight number, a color, a column, a dozen, and an
  // even-money bet) so the multi-bet spin and result flow gets exercised. Goes through
  // roulettePresetBets in roulette.js rather than writing S.rBets/debit() directly here,
  // so the bets get placed the same way a real player's bet would.
  mutate(s => { s.screen='roulette'; s.rPhase='bet'; });
  if(S.rBets.length===0) roulettePresetBets([17,45,37,40,44],10);
  closeDropdowns();
  if(S.rBets.length>0)rSpin();else render();
}
// Jump straight to the free-entry Ladder bonus round: forces the ladder_day mod so the
// bet screen shows the free entry (as on a real Ladder day) and lands on a fresh run.
function devLadder(){
  S.forcedMod = 'ladder_day';
  resetLadderRun('dev-jump');
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

// Value stats (avg/median/high/net) normally ignore scores above 100,000 as tampered/corrupt.
// The checkbox on the page flips this off to see the raw numbers; session-only, defaults on.
let _statsCapOn = true;
const _STATS_CAP = 100000;

function toggleStatsCap() {
  _statsCapOn = !_statsCapOn;
  const el = document.getElementById('devstats-body');
  if (el) el.innerHTML = `<div style="color:var(--shadow);padding:18px 0">Fetching…</div>`;
  fetchDevStats();
}

function screenDevStats() {
  const seed = getActiveSeed();
  return `${hdr('Dev Stats · Day #' + S.day)}
  <div class="panel" style="text-align:center">
    <div style="font-family:var(--btn-f);font-size:1.6rem;color:var(--gold-hi);margin-bottom:2px">Day #${S.day} Stats</div>
    <div style="font-size:0.72rem;color:var(--shadow);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Seed ${seed}</div>
    <label style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:0.72rem;color:var(--shadow);letter-spacing:.05em;margin-bottom:8px;cursor:pointer">
      <input type="checkbox" ${_statsCapOn ? 'checked' : ''} onclick="toggleStatsCap()" style="width:14px;height:14px;accent-color:var(--gold)">
      Ignore scores over 100k
    </label>
    <div class="divider"></div>
    <div id="devstats-body">
      <div style="color:var(--shadow);padding:18px 0">Fetching…</div>
    </div>
    <div class="divider"></div>
    <button class="btn-gold" onclick="goTo('intro')">← Close</button>
  </div>`;
}

// Builds a distribution bar chart from 7 bucket counts (<=249 … >=4000). Shared by the dev-stats
// score chart (single-RPC + fallback paths) and the Retention page's chips-at-quit chart; `label`
// is the heading above the bars.
function _distChartHTML(counts, label = 'Score Distribution') {
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
  return `<div class="dvs-grp-lbl dvs-grp-lbl-bare" style="margin-top:8px">${label}</div><div class="dist-wrap"><div class="dist-bars">${cols}</div></div>`;
}

async function fetchDevStats() {
  const el = document.getElementById('devstats-body');
  if (!el) return;
  const seed = getActiveSeed();
  // Each category is one inlaid (recessed) box: gold label as a header, its stats listed one per
  // line inside. The boxes flow into two columns (.dvs-groups) so the screen still fits on desktop.
  const renderGroups = (groups) =>
    `<div class="dvs-groups">` +
    groups.map(([title, rows]) =>
      `<div class="dvs-box"><div class="dvs-grp-lbl">${title}</div>` +
      rows.map(([k, v]) => `<div class="irow"><span class="ik">${k}</span><span class="iv">${v}</span></div>`).join('') +
      `</div>`
    ).join('') + `</div>`;
  const warn = (txt) => `<span style="color:var(--shadow);font-size:.75rem">${txt}</span>`;
  const pct  = (n, d) => d > 0 ? ` <span style="color:var(--shadow);font-size:.75rem">(${Math.round(n/d*100)}%)</span>` : '';
  const net  = (n) => `<span style="color:${col(n)}">${sign(n)}</span>`;

  // One RPC returns the entire payload (see supabase/dev_stats.sql). It aggregates fingerprint
  // counts server-side (SECURITY DEFINER) so the client never reads the raw device fingerprint —
  // that column is no longer anon-selectable (see supabase/fingerprint-lockdown.sql). There is no
  // REST fallback: a device fingerprint must never be enumerable from the browser.
  try {
    // p_cap: int4 max when the checkbox is off = effectively uncapped.
    const r = await sbFetch('/rest/v1/rpc/get_dev_stats', {
      method: 'POST',
      body: { p_seed: seed, p_cap: _statsCapOn ? _STATS_CAP : 2147483647 },
    });
    if (r && r.ok) {
      const d = await r.json();
      if (d && d.today && d.lifetime && d.last7) {
        const T = d.today, L = d.lifetime, W = d.last7;
        const ph = T.peak_hour;
        const peakAMPM = ph == null ? warn('n/a') : ph === 0 ? '12am' : ph < 12 ? ph + 'am' : ph === 12 ? '12pm' : (ph - 12) + 'pm';
        const dnf = Math.max((T.started || 0) - (T.completions || 0), 0);
        const returning = T.fingerprinted - T.new_players;
        // Drop-off funnel now lives on the dedicated Retention page (fetchRetention / get_retention).
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
            ['Std dev',    T.stddev != null ? fmt(T.stddev) : warn('needs RPC')],
            ['Net chips',  net(T.net)],
          ]],
          ['Outcomes', [
            ['In profit',  `${fmt(T.in_profit)}${pct(T.in_profit, T.completions)}`],
            ['Went bust',  `<span style="color:${T.bust > 0 ? 'var(--lose)' : 'inherit'}">${fmt(T.bust)}</span>${pct(T.bust, T.completions)}`],
            ['Peak hour',  peakAMPM],
            ['Borrowed',   `${fmt(T.borrowed)}${pct(T.borrowed, T.started)}`],
          ]],
          lifetimeGroup,
        ].filter(Boolean)) + _distChartHTML(d.distribution || []);
        return;
      }
    }
    // RPC reachable but returned an unusable shape (not deployed / older definition).
    el.innerHTML = `<div style="color:var(--shadow);padding:14px 0;text-align:center">${warn('get_dev_stats returned no data · run supabase/dev_stats.sql')}</div>`;
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:var(--lose);padding:10px 0">Error: ${err.message}</div>`;
  }
}

// ─── RETENTION SCREEN ────────────────────────────────────────────────────
// Dev-only page (goTo('retention')) dedicated to player retention & in-session drop-off. Three
// blocks, all from the get_retention RPC: day-over-day return (D1/D7 + days-played), the drop-off
// funnel (moved here from Player Stats), and quit position (where the tab was last hidden + the chip
// count held at that moment, from the `quits` beacon: see _submitQuit in flow.js). Every return
// number is keyed on the localStorage device id, which churns (cleared storage, private mode, second
// device, Safari ITP eviction), so the rates are lower bounds: labeled "approximate" on the page.

function screenRetention() {
  const seed = getActiveSeed();
  return `${hdr('Retention · Day #' + S.day)}
  <div class="panel" style="text-align:center">
    <div style="font-family:var(--btn-f);font-size:1.6rem;color:var(--gold-hi);margin-bottom:2px">Retention &amp; Drop-off</div>
    <div style="font-size:0.72rem;color:var(--shadow);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Seed ${seed} · device-id based, approximate</div>
    <div class="divider"></div>
    <div id="retention-body">
      <div style="color:var(--shadow);padding:18px 0">Fetching…</div>
    </div>
    <div class="divider"></div>
    <button class="btn-gold" onclick="goTo('intro')">← Close</button>
  </div>`;
}

async function fetchRetention() {
  const el = document.getElementById('retention-body');
  if (!el) return;
  const seed = getActiveSeed();
  // Same inlaid two-column box layout as the Player Stats page.
  const renderGroups = (groups) =>
    `<div class="dvs-groups">` +
    groups.map(([title, rows]) =>
      `<div class="dvs-box"><div class="dvs-grp-lbl">${title}</div>` +
      rows.map(([k, v]) => `<div class="irow"><span class="ik">${k}</span><span class="iv">${v}</span></div>`).join('') +
      `</div>`
    ).join('') + `</div>`;
  const warn = (txt) => `<span style="color:var(--shadow);font-size:.75rem">${txt}</span>`;
  const pct  = (n, d) => d > 0 ? ` <span style="color:var(--shadow);font-size:.75rem">(${Math.round(n/d*100)}%)</span>` : '';
  const rate = (n, d) => d > 0 ? `${Math.round(n/d*100)}% <span style="color:var(--shadow);font-size:.75rem">(${fmt(n)}/${fmt(d)})</span>` : warn('no data yet');

  try {
    const r = await sbFetch('/rest/v1/rpc/get_retention', {
      method: 'POST', body: { p_seed: seed },
    });
    if (!r || !r.ok) throw new Error(`HTTP ${r ? r.status : 'network'}`);
    const d = await r.json();
    if (!d || !d.returns) { el.innerHTML = `<div style="color:var(--shadow);padding:14px 0;text-align:center">${warn('get_retention RPC not deployed yet · run supabase/retention.sql')}</div>`; return; }
    const R = d.returns, F = d.funnel || {}, Q = d.quit || {};

    // Day-over-day return: D1/D7 across all cohorts that have had time to mature (lower bounds).
    const returnGroup = ['Return · day-over-day', [
      ['Next-day (D1)', rate(R.d1?.ret || 0, R.d1?.base || 0)],
      ['One-week (D7)', rate(R.d7?.ret || 0, R.d7?.base || 0)],
    ]];
    // Days played in the trailing 7-day window: one bucket per distinct-days-played count.
    const dp = (R.days_played || []).map(c => +c);
    const dpTotal = dp.reduce((a, b) => a + b, 0);
    const daysGroup = ['Days played · last 7d', dp.length === 7
      ? dp.map((c, i) => [i === 6 ? '7 days' : `${i + 1} day${i ? 's' : ''}`, `${fmt(c)}${pct(c, dpTotal)}`])
      : [['Status', warn('no data yet')]]];

    // Drop-off funnel (moved here from Player Stats). dnf = started − completions for this seed.
    const dnf = Math.max((F.started || 0) - (F.completions || 0), 0);
    const funnelPre = (F.completions || 0) > 0 && ((F.uth || 0) + (F.roulette || 0)) === 0;
    const funnelGroup = funnelPre
      ? ['Drop-off · where DNFs stopped', [['Status', warn('no funnel data for this seed')]]]
      : dnf > 0 ? ['Drop-off · where DNFs stopped', [
          ['Stopped at Blackjack', `${fmt(F.bj)}${pct(F.bj, dnf)}`],
          ['Stopped at Hold\'em',  `${fmt(F.uth)}${pct(F.uth, dnf)}`],
          ['Stopped at Roulette',  `${fmt(F.roulette)}${pct(F.roulette, dnf)}`],
          ...((F.ladder || 0) > 0 ? [['Stopped at the Ladder', `${fmt(F.ladder)}${pct(F.ladder, dnf)}`]] : []),
        ]]
      : null;

    // Quit position: where the tab was hidden last today, and the chips held at that moment.
    const chips = Q.chips || {};
    const qN = chips.n || 0;
    const SCREEN_LBL = { bj: 'Blackjack', uth: "Hold'em", poker: 'Poker', roulette: 'Roulette', ladder: 'The Ladder', borrow: 'Borrow', results: 'Results', intro: 'Intro', choice: 'Choice' };
    const byScreen = Array.isArray(Q.by_screen) ? Q.by_screen : [];
    // Excludes finishers (screen='results') server-side: this is mid-run abandonment only.
    const quitGroup = ['Quit position · mid-run', byScreen.length
      ? byScreen.slice(0, 8).map(b => [`${SCREEN_LBL[b.screen] || b.screen}${b.phase && b.phase !== '?' ? ' · ' + b.phase : ''}`, `${fmt(b.n)}${pct(b.n, qN)}`])
      : [['Status', warn('no mid-run quits yet')]]];
    const chipsGroup = qN > 0 ? ['Chips at quit', [
      ['Snapshots', fmt(qN)],
      ['Average',   fmt(chips.avg || 0)],
      ['Median',    fmt(chips.median || 0)],
    ]] : null;

    el.innerHTML = renderGroups([returnGroup, daysGroup, funnelGroup, quitGroup, chipsGroup].filter(Boolean))
      + (qN > 0 ? _distChartHTML((chips.buckets || []).map(c => +c), 'Chips at Quit') : '');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--lose);padding:10px 0">Error: ${err.message}</div>`;
  }
}

// ─── DEVICES SCREEN ────────────────────────────────────────────────────────
// Dev-only page (goTo('devices')) for the player device/environment census: a viewport-size
// distribution plus browser/OS, form factor, traffic source, timezone, and environment prefs: the
// gap the Player Stats (audience) and Retention pages don't cover. Reads the clients_public VIEW
// (raw UA omitted) for today's seed and aggregates client-side (beacon: _submitClient in flow.js;
// schema: supabase/clients.sql). Seed-scoped like the other dev pages; intentionally exempt from the
// strict layout fit rule (it may scroll).

function screenDevices() {
  const seed = getActiveSeed();
  return `${hdr('Devices · Day #' + S.day)}
  <div class="panel" style="text-align:center">
    <div style="font-family:var(--btn-f);font-size:1.6rem;color:var(--gold-hi);margin-bottom:2px">Devices &amp; Environment</div>
    <div style="font-size:0.72rem;color:var(--shadow);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Seed ${seed} · today · client-reported</div>
    <div class="divider"></div>
    <div id="devices-body">
      <div style="color:var(--shadow);padding:18px 0">Fetching…</div>
    </div>
    <div class="divider"></div>
    <button class="btn-gold" onclick="goTo('intro')">← Close</button>
  </div>`;
}

// Generic vertical bar chart for an arbitrary labeled bucket list ([{label,count}]). The score
// distribution's _distChartHTML is hardcoded to 7 chip buckets, so this is its general-purpose
// sibling, used for the Devices viewport-width chart. Inline-styled (no new CSS) and bottom-aligned:
// each column is count/bar/label stacked, and equal-height count+label rows make the bar baselines
// line up. Sqrt-scales the heights when one bucket dwarfs the rest (same trick as _distChartHTML).
function _barsHTML(bars, heading) {
  if (!Array.isArray(bars) || !bars.length) return '';
  const counts = bars.map(b => b.count);
  const sorted = [...counts].sort((a, b) => b - a);
  const useLog = sorted[0] > 0 && sorted[1] > 0 && sorted[0] / sorted[1] > 3;
  const scaled = counts.map(c => useLog ? Math.sqrt(c) : c);
  const max = Math.max(...scaled, 1);
  const cols = bars.map((b, i) => {
    const h = b.count > 0 ? Math.max(Math.round(scaled[i] / max * 70), 2) : 0;
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;gap:2px;min-width:0">
      <span style="font-size:.66rem;color:var(--gold-hi);line-height:1">${b.count}</span>
      <div style="width:62%;max-width:30px;height:${h}px;background:var(--gold-hi);border-radius:2px 2px 0 0"></div>
      <span style="font-size:.58rem;color:var(--shadow);line-height:1.1;white-space:nowrap">${b.label}</span>
    </div>`;
  }).join('');
  return `<div class="dvs-grp-lbl dvs-grp-lbl-bare" style="margin-top:10px">${heading}</div>
    <div style="display:flex;align-items:flex-end;gap:5px;padding:6px 4px 0">${cols}</div>`;
}

// Viewport-width buckets (ordered) for the Devices distribution chart. Pure → unit-testable.
const _VP_BUCKETS = ['<360', '360-413', '414-767', '768-1023', '1024+'];
function _vpBucket(w) {
  w = +w || 0;
  return w < 360 ? '<360' : w < 414 ? '360-413' : w < 768 ? '414-767' : w < 1024 ? '768-1023' : '1024+';
}

async function fetchDevices() {
  const el = document.getElementById('devices-body');
  if (!el) return;
  const seed = getActiveSeed();
  // Same inlaid two-column box layout as Player Stats / Retention.
  const renderGroups = (groups) =>
    `<div class="dvs-groups">` +
    groups.map(([title, rows]) =>
      `<div class="dvs-box"><div class="dvs-grp-lbl">${title}</div>` +
      rows.map(([k, v]) => `<div class="irow"><span class="ik">${k}</span><span class="iv">${v}</span></div>`).join('') +
      `</div>`
    ).join('') + `</div>`;
  const warn = (txt) => `<span style="color:var(--shadow);font-size:.75rem">${txt}</span>`;
  const pct  = (n, d) => d > 0 ? ` <span style="color:var(--shadow);font-size:.75rem">(${Math.round(n / d * 100)}%)</span>` : '';

  try {
    const r = await sbFetch(`/rest/v1/clients_public?seed=eq.${seed}&select=w,h,dpr,browser,os,src,tz,reduced_motion,color_scheme,lang,private`);
    if (!r || !r.ok) throw new Error(`HTTP ${r ? r.status : 'network'}`);
    const rows = await r.json();
    const total = Array.isArray(rows) ? rows.length : 0;
    if (!total) {
      el.innerHTML = `<div style="color:var(--shadow);padding:14px 0;text-align:center">No device data yet for seed ${seed}. ${warn('(the clients beacon fires on real loads only)')}</div>`;
      return;
    }

    // Tally a field into [label, count] entries, sorted desc; optional mapper coarsens the raw value.
    const tally = (key, map) => {
      const m = {};
      for (const row of rows) { const k = map ? map(row[key]) : (row[key] == null ? '?' : String(row[key])); m[k] = (m[k] || 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const asRows = (entries, top = 6) => entries.slice(0, top).map(([k, n]) => [k, `${fmt(n)}${pct(n, total)}`]);

    // Viewport distribution (bar chart): counts per ordered width bucket.
    const vpCounts = {};
    for (const row of rows) { const b = _vpBucket(row.w); vpCounts[b] = (vpCounts[b] || 0) + 1; }
    const vpBars = _VP_BUCKETS.map(b => ({ label: b, count: vpCounts[b] || 0 }));

    // Form factor from width (matches the feedback dialog's thresholds: <=480 mobile, <=1024 tablet).
    const form = { mobile: 0, tablet: 0, desktop: 0 };
    for (const row of rows) { const w = +row.w || 0; form[w <= 480 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop']++; }
    const formRows = [
      ['Mobile',  `${fmt(form.mobile)}${pct(form.mobile, total)}`],
      ['Tablet',  `${fmt(form.tablet)}${pct(form.tablet, total)}`],
      ['Desktop', `${fmt(form.desktop)}${pct(form.desktop, total)}`],
    ];

    // Display: snapshot count, average DPR, retina share.
    const dprVals = rows.map(row => +row.dpr || 1);
    const avgDpr = dprVals.reduce((a, b) => a + b, 0) / dprVals.length;
    const retina = dprVals.filter(d => d >= 2).length;
    const displayRows = [['Snapshots', fmt(total)], ['Avg DPR', avgDpr.toFixed(2)], ['Retina (2x+)', `${fmt(retina)}${pct(retina, total)}`]];

    // Timezone: getTimezoneOffset() minutes → "UTC±H" label (offset is positive WEST, so negate).
    const tzLabel = (min) => {
      const o = -(+min) / 60; if (!Number.isFinite(o)) return '?';
      const a = Math.abs(o);
      return `UTC${o >= 0 ? '+' : '-'}${Number.isInteger(a) ? a : a.toFixed(1)}`;
    };

    // Environment prefs.
    const dark = rows.filter(row => row.color_scheme === 'dark').length;
    const rm   = rows.filter(row => row.reduced_motion).length;
    const priv = rows.filter(row => row.private).length;
    const topLang = tally('lang')[0];
    const prefRows = [
      ['Dark scheme',     `${fmt(dark)}${pct(dark, total)}`],
      ['Reduced motion',  `${fmt(rm)}${pct(rm, total)}`],
      ['Private / no-LS', `${fmt(priv)}${pct(priv, total)}`],
      ['Top language',    topLang ? `${topLang[0]}${pct(topLang[1], total)}` : warn('n/a')],
    ];

    el.innerHTML =
      _barsHTML(vpBars, 'Viewport width (CSS px)') +
      renderGroups([
        ['Display',        displayRows],
        ['Form factor',    formRows],
        ['Browser',        asRows(tally('browser'))],
        ['OS',             asRows(tally('os'))],
        ['Traffic source', asRows(tally('src'))],
        ['Timezone',       asRows(tally('tz', tzLabel))],
        ['Environment',    prefRows],
      ]);
  } catch (err) {
    el.innerHTML = `<div style="color:var(--lose);padding:10px 0">Error: ${err.message}</div>`;
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
