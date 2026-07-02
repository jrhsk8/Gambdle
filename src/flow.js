// ─── GAME FLOW ──────────────────────────────────────────────────────────────
// The engine every screen plugs into: render() (full #app re-render + screen
// dispatch), the status bar, navigation (goTo/advanceTo, bust → borrow routing),
// the shared next-hand / result-panel helpers, and start/borrow tracking.

// ─── APP SHELL ───────────────────────────────────────────────────────────

let _noAnim=false;

// ─── STATUS BAR ──────────────────────────────────────────────────────────
// Hint copy (STATUS_HINT) lives in src/gametext.js with the rest of the editable text.

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

// ─── RENDER ──────────────────────────────────────────────────────────────

// Full re-render: replaces all of #app. Use surgical DOM updates mid-hand to avoid flash.
function render(){
  // Game screens dispatch through the Game registry (GAMES[screen].screen, registered by each game's
  // file); the non-game shell screens stay in this local table.
  const scr={intro:screenIntro,choice:screenChoice,borrow:screenBorrow,results:screenResults,devstats:screenDevStats,retention:screenRetention,devices:screenDevices,seedcheck:screenSeedCheck};
  const inner = (GAMES[S.screen]?.screen||scr[S.screen]||screenIntro)();
  document.getElementById('app').innerHTML=`<div class="app">
    <div class="window">
      ${inner}
      ${statusBar()}
    </div>
  </div>`;
  const _panel = document.querySelector('.panel');
  // The Seed Checker scans FUTURE days, so today's modifier banner would be misleading there: suppress it.
  const _mod = S.screen === 'seedcheck' ? '' : modBannerHTML(S.screen === 'results');
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
  if (S.screen === 'retention') fetchRetention();
  if (S.screen === 'devices') fetchDevices();
  _runTutorial();
  _drawLayoutDebug();
}

// Smooth cross-screen render: wrap the full re-render in a View Transition so significantly different
// screens (a new game, a hand's result panel, the next hand) crossfade instead of popping. Falls back
// to a plain synchronous render() (which keeps card choreography, replay, and the layout suite intact)
// whenever the API is unavailable (Node, Firefox, older Safari), the user prefers reduced motion, or a
// test is running (__GAMBDLE_TEST__: the unit suite calls bjResolve/render directly and asserts on the
// DOM synchronously, so it must never go async). Mid-hand renders keep calling render() directly.
function navRender(){
  if(typeof document==='undefined'
     || typeof document.startViewTransition!=='function'
     || (typeof window!=='undefined' && window.__GAMBDLE_TEST__)
     || (typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
    render(); return;
  }
  document.startViewTransition(()=>render());
}

function updateChipDisplay() {
  const el = document.getElementById(DOM.chipBadge);
  if (el) {
    el.innerHTML = `${icon('chip')} ${cfmt(S.chips)}`;
  }
}

// ─── NAVIGATION & ACTIONS ────────────────────────────────────────────────

function goTo(s){S.screen=s;navRender();} // crossfade screen changes (advanceTo → goTo, borrow, menu nav)
// Shared skip logic for all_in_or_skip: push a skip entry, increment the hand counter, advance to the
// next screen if done, otherwise reset and re-render. Everything game-specific (the history array, the
// hand counter, the reset fn, the successor screen) is read from the Game registry keyed on `screen`,
// so a caller only says which game and what entry to record.
function _skipHand(screen, entry) {
  const g = GAMES[screen];
  gameHistory(screen).push(entry);
  S[g.handKey]++;
  if (S[g.handKey] >= 3) { advanceTo(NEXT_SCREEN[screen]); return; }
  g.reset('hand-advance'); // still within the same Round: see the reset(reason) rules in core.js
  navRender();
}

// Shared "next hand" flow: sound → reset → re-render (or go to results/borrow if busted).
function _nextHand(resetFn) {
  sndAdvance();
  resetFn('hand-advance'); // see the reset(reason) rules in core.js
  if (isChipBusted()) {
    if (_canShowBorrow()) {
      S.borrowReturnScreen = _borrowReturnScreen();
      S.screen = 'borrow';
    } else {
      S.screen = 'results';
    }
  }
  navRender();
}

// Advance to the next hand of the current game: the onclick target on every card game's result panel.
// Dispatches through the Game registry so flow.js carries no per-game next-hand wrappers.
function advanceHand(){ GAMES[S.screen].nextHand(); }

// Enter the first game slot of the run at its bet phase. Reads the slot's phaseKey from the Game
// registry so a swapped GAME1 (dev menu) initializes the right phase field, not a hardcoded bjPhase.
function _enterFirstSlot(){ S.screen=GAME1; S[GAMES[GAME1].phaseKey]='bet'; }

// Produces the standard result panel used by BJ, UTH-fold, etc.
// detailHTML is injected between the delta line and the bottom control cluster: the bet inlay box
// now shows the player's new running total after the hand, with the advance button beneath it
// (width-matched to the Deal / Final Spin button via .game-controls).
function _resultPanel(dotsHTML, delta, headlineHTML, detailHTML, btnAction, btnText, panelCls='') {
  return `<div class="panel ${panelCls}" style="text-align:center">
    ${dotsHTML}
    <div class="divider"></div>
    <div class="result-head">
      <div class="result-hl" style="color:${col(delta)}">${headlineHTML}</div>
      <div class="result-sub" style="color:${col(delta)}">${csign(delta)} chips</div>
    </div>
    ${detailHTML}
    ${gameControls(betInlay('Total', cfmt(S.chips)), `<button class="btn-gold" onclick="${btnAction}">${btnText}</button>`)}
  </div>`;
}

// The advance button (label + onclick) shown on a card game's result screen. Shared by Blackjack,
// Hold'em and Poker, which all phrase it identically. Busted → go to results; the last hand of 3 →
// the next game (worded "Final Round: Roulette" when roulette is the finale, else "Round 2: <name>");
// any earlier hand → the next hand (via the registry-dispatched advanceHand()). `nextScreen` is
// NEXT_SCREEN[game].
function resultAdvanceBtn(isLast, nextScreen) {
  if (isChipBusted()) return { text: `Game Over ${icon('skull',{fill:true})}`, action: "advanceTo('results')" };
  if (!isLast)        return { text: 'Next Hand →',  action: 'advanceHand()' };
  // Use the SHORT game name ("Hold'em", not "Ultimate Texas Hold'em") so the label fits the
  // box-width advance button on one line at every breakpoint, especially the narrow 1024 panel.
  const text = nextScreen === 'roulette' ? 'Final Round: Roulette →' : `Round 2: ${GAME_META[nextScreen].short} →`;
  return { text, action: `advanceTo('${nextScreen}')` };
}

// Plays a transition sound scaled to how well the player is doing.
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('assets/sounds/mediumbet.mp3');else playMp3('assets/sounds/smallbet.mp3');}
// Navigates between games; redirects to results early if the player is busted (<10 chips).
// If the borrow option is still available when a bust is detected, shows the borrow screen first.
function advanceTo(s){
  // The Ladder mod day: a completed run to 'results' detours once through the free bonus round, but
  // only after roulette has resolved (rResult set) and the ladder hasn't been played yet. The two
  // states that DON'T earn it both move straight to results (so the chip recalc below runs): a player
  // who borrowed and then recovered, and a player who busted without ever borrowing. Equivalently the
  // detour fires when bust and borrow agree (isChipBusted()===S.borrowUsed): a clean finish (neither)
  // or a borrowed-and-still-busted finish.
  if(s==='results')s=next(s,{ladderFree:ladderMode().detourToday,ladPlayed:!!S.ladResult,rResolved:S.rResult!==null,busted:isChipBusted(),borrowUsed:S.borrowUsed});
  if(isChipBusted()&&_canShowBorrow()){
    if(s!=='results'){
      // Mid-game transition bust (e.g., would have gone to UTH/Roulette but broke).
      S.borrowReturnScreen=s;
    }else{
      // Explicit "Game Over" bust from a result phase: determine where to return if they borrow.
      const ret=_borrowReturnScreen();
      // Reset the current game to bet phase so returning lands on a fresh hand (no-op for single-run
      // games, which have no reset slot). The borrow flow only returns the three card games here.
      GAMES[ret]?.reset('borrow-prep');   // see the reset(reason) rules in core.js; ret may be a non-game screen (results), hence the `?.` guard
      S.borrowReturnScreen=ret;
    }
    sndAdvance();goTo('borrow');return;
  }
  // Busted players are normally forced to results, but the free ladder entry is house
  // money: a busted player still gets (and may need) the bonus round.
  if(s!=='results'&&!(s==='ladder'&&ladderMode().detourToday)&&isChipBusted())s='results';
  if(s==='results'&&!DEV_OVERRIDE){
    const _calc=recalcChips();
    // Fall back to the current saved value if the recalculation is non-finite (corrupted history).
    // Skipped in dev mode so dev-menu chip bonuses aren't recomputed away on the results screen.
    // Clamp at 0: balances never go negative (debit() floors at 0), so a sub-zero recalc is a corrupt save.
    S.chips=Number.isFinite(_calc)?Math.max(0,_calc):S.chips;
  }
  if(PROGRESS_STAGES.has(s))_submitProgress(s);
  sndAdvance();goTo(s);
}

// Returns the screen to navigate to after a borrow, based on where the player is mid-run:
// stay on the current game if it has hands left, else its Run-order successor (via next()).
function _borrowReturnScreen(){
  const hk=GAMES[S.screen]?.handKey;          // the 3-hand card games carry one; single-run games don't
  const hand=hk ? S[hk] : undefined;
  return hand===undefined ? S.screen : next(S.screen,{handsLeft:hand<3});
}
function startGame(){
  sndChip('allin');
  // Player's Choice day: divert to the picker before the first game. The pick screen commits
  // S.pcPick, then routes into GAME1 (see pickModifier). On a normal day, go straight to Blackjack.
  if(pendingPlayersChoice()){S.screen='choice';navRender();_submitStart();return;}
  _enterFirstSlot();navRender();_submitStart();
}

// Fire-and-forget: records that this device started today's game.
// Skipped in dev/test/backlog modes; deduplicated per device per day via localStorage.
// Requires a `starts` table in Supabase; see .claude/VERSIONS.md for setup SQL.
async function _submitStart() {
  const seed = getActiveSeed();
  const key = `gambdle_started_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  const res = await sbFetch('/rest/v1/starts', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: { seed, fingerprint: getDeviceId() },
  });
  if (res && res.ok) _ls.setItem(key, '1');
}

// Fire-and-forget: records that this device took the borrow loan today (only when the chips are
// actually accepted via borrowChips (declining doesn't fire this). Skipped in dev/test/backlog
// modes; deduplicated per device per day via localStorage (borrow is once-per-day anyway).
// Requires a `borrows` table in Supabase; see .claude/VERSIONS.md for setup SQL.
async function _submitBorrow() {
  const seed = getActiveSeed();
  const key = `gambdle_borrowed_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  const res = await sbFetch('/rest/v1/borrows', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: { seed, fingerprint: getDeviceId() },
  });
  if (res && res.ok) _ls.setItem(key, '1');
}

// Fire-and-forget: records the furthest game stage this device reached today (beaconed on entry to
// UTH and Roulette via advanceTo). Lets dev stats bucket non-completers by where they stopped.
// Skipped in dev/test/backlog modes; deduplicated per device/day/stage via localStorage.
// Requires a `progress` table in Supabase; see .claude/SUPABASE.md.
async function _submitProgress(stage) {
  const seed = getActiveSeed();
  const key = `gambdle_progress_${seed}_${stage}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  const res = await sbFetch('/rest/v1/progress', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: { seed, fingerprint: getDeviceId(), stage },
  });
  if (res && res.ok) _ls.setItem(key, '1');
}

// The game stages a progress beacon fires on (entry to game 2, the roulette finale, and the Ladder
// bonus round on ladder_day). Game 1 is already covered by the `starts` row, and reaching 'results'
// is covered by the score submission. 'ladder' only occurs on ladder_day; it's a no-op otherwise.
const PROGRESS_STAGES = new Set([GAME2, 'roulette', 'ladder']);

// ─── Client/device profile beacon (Devices dev page) ─────────────────────────
// Fire-and-forget at app LOAD: INSERTs ONE row per device/day describing this client's viewport,
// browser/OS, traffic source, and environment prefs. Powers the dev-only "Devices" screen
// (goTo('devices'), fetchDevices in dev.js). Analytics-only: every field is client-asserted and
// unvalidated (NOT leaderboard-grade). Captured at load so the referrer is freshest and even players
// who bounce on a broken layout are sampled. Skipped in dev/test/backlog; deduped per device/day via
// localStorage (key set only on a 2xx). A plain INSERT (not an upsert) on purpose: a merge-duplicates
// upsert needs anon SELECT on the table, which would expose the raw `ua`, so we forgo updates and let
// the (seed,fingerprint) PK turn the rare double-fire (cleared storage) into a harmless 409. Called
// once from game.js boot (gated there to never fire under the unit-test harness). Requires a `clients`
// table + `clients_public` view; see supabase/clients.sql.

// Parse a userAgent into coarse browser/os tokens: cheap GROUP BY on the read side. Pure (string in,
// tokens out), so it's unit-testable. Order matters: Edge ('Edg/') and Chromium-derivatives (Opera
// 'OPR/', Samsung) are checked before Chrome, and Chrome before Safari, because every Chromium UA
// also contains 'Safari' (and Chromium UAs contain 'Chrome').
function _parseUA(ua){
  const s = (ua || '').toLowerCase();
  const browser = /edg\//.test(s) ? 'edge'
    : /opr\/|opera/.test(s) ? 'opera'
    : /samsungbrowser/.test(s) ? 'samsung'
    : /firefox|fxios/.test(s) ? 'firefox'
    : /chrome|crios|chromium/.test(s) ? 'chrome'
    : /safari/.test(s) ? 'safari'
    : 'other';
  const os = /iphone|ipad|ipod/.test(s) ? 'ios'
    : /android/.test(s) ? 'android'
    : /windows/.test(s) ? 'windows'
    : /mac os x|macintosh/.test(s) ? 'macos'
    : /linux/.test(s) ? 'linux'
    : 'other';
  return { browser, os };
}

// Traffic source token: an explicit ?utm_source/?src/?ref param wins; else the referrer's host
// (www-stripped); same-origin referrers and no referrer collapse to 'direct'. Best-effort.
function _srcToken(){
  try {
    const p = new URLSearchParams(location.search);
    const tag = p.get('utm_source') || p.get('src') || p.get('ref');
    if (tag) return tag.slice(0, 40).toLowerCase();
    const ref = document.referrer;
    if (!ref) return 'direct';
    const host = new URL(ref).hostname.replace(/^www\./, '');
    return (!host || host === location.hostname) ? 'direct' : host.slice(0, 60).toLowerCase();
  } catch { return 'direct'; }
}

// Environment prefs bundle. tz = getTimezoneOffset() in minutes (positive = west of UTC; Phoenix=420).
// `private` flags the localStorage→sessionStorage fallback (private browsing), which explains some
// device-id churn behind the retention undercount. Each matchMedia read is defensive.
function _clientPrefs(){
  const mm = (q) => { try { return matchMedia(q).matches; } catch { return false; } };
  return {
    tz: new Date().getTimezoneOffset(),
    reduced_motion: mm('(prefers-reduced-motion: reduce)'),
    color_scheme: mm('(prefers-color-scheme: dark)') ? 'dark' : 'light',
    lang: (navigator.language || '').slice(0, 10),
    private: _ls === sessionStorage,
  };
}

async function _submitClient() {
  const seed = getActiveSeed();
  const key = `gambdle_client_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  // Skip speculative prerenders (bot/Chrome-prefetch noise); real visible/backgrounded loads still fire.
  if (typeof document !== 'undefined' && document.visibilityState === 'prerender') return;
  const { browser, os } = _parseUA(navigator.userAgent || '');
  const prefs = _clientPrefs();
  const res = await sbFetch('/rest/v1/clients', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: {
      seed, fingerprint: getDeviceId(),
      w: innerWidth, h: innerHeight, dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      browser, os, ua: (navigator.userAgent || '').slice(0, 180), src: _srcToken(),
      tz: prefs.tz, reduced_motion: prefs.reduced_motion, color_scheme: prefs.color_scheme,
      lang: prefs.lang, private: prefs.private,
    },
  });
  if (res && res.ok) _ls.setItem(key, '1');
}

// Fire-and-forget: snapshots where this device is the moment the tab hides (visibilitychange→hidden)
// or the page is torn down (pagehide): the exact screen, its phase, the hand index (3-hand games),
// and the live chip count. Upserts ONE row per device/day (Prefer: merge-duplicates → last write
// wins), so the final snapshot is wherever the player actually quit. Powers the dev-only Retention
// page's quit block. Skipped in dev/test/backlog; a module-level signature guard suppresses redundant
// identical writes (the hide events fire on every tab-switch / phone-lock, not just the final exit).
// Uses keepalive so the request survives an unloading page (a plain fetch would be cancelled).
// Analytics-only: chips here are client-reported and unvalidated, unlike the `scores` submission.
// Requires a `quits` table in Supabase; see .claude/SUPABASE.md.
let _lastQuitSnap = '';
function _submitQuit() {
  if (DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  const g = GAMES[S.screen] || {};
  const phase = g.phaseKey ? (S[g.phaseKey] ?? null) : null;
  const hand  = g.handKey  ? (S[g.handKey]  ?? null) : null;
  const snap = { seed: getActiveSeed(), fingerprint: getDeviceId(), screen: S.screen, phase, hand, chips: S.chips };
  const sig = JSON.stringify([snap.screen, snap.phase, snap.hand, snap.chips]);
  if (sig === _lastQuitSnap) return;
  _lastQuitSnap = sig;
  // Fire-and-forget on an unloading page: not awaited, keepalive so the request survives, no timeout
  // (an AbortController during teardown is pointless). sbFetch swallows any error internally.
  sbFetch('/rest/v1/quits', {
    method: 'POST',
    keepalive: true,
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: snap,
  });
}

// visibilitychange→hidden is the reliable "leaving" signal on mobile (fires on tab-switch, phone-lock,
// and close); pagehide is the desktop-navigation backup. beforeunload/unload are unreliable, so we
// don't use them. Registered at load like the other window listeners (windows.js).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) _submitQuit(); });
  window.addEventListener('pagehide', _submitQuit);
}
