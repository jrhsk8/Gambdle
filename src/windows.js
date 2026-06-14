// ─── WINDOWS — the XP window chrome ─────────────────────────────────────────
// Dragging for the main game window, the floating window manager (Help / About /
// modifier popups / Send Feedback), and the XP notification balloon with its
// tutorial-tip runtime. render() calls _reapplyDragPos() after each full
// re-render so the window keeps its dragged position.

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

// ─── MOBILE DETECTION ───────────────────────────────────────────────────────
// Shared by the window manager and the menus: ≤480px gets blocking modals and
// inline submenus instead of floating windows.
let _forceMobile = null;   // test hook: null = use the real viewport width
const _isMobile = () => _forceMobile !== null ? _forceMobile : window.innerWidth <= 480;

// ─── WINDOW MANAGER (Help / About / modifier popup / Send Feedback) ───────────────────────────────
// On DESKTOP these are non-blocking floating windows: multiple open at once, one instance per type
// (re-opening focuses the existing one), and the game stays clickable + draggable underneath. On
// MOBILE (≤480px) each is a single blocking modal (dark backdrop, outside-tap closes) — the old
// behaviour, kept because floating windows don't fit a 360px screen. Both share the WinXP blue-bar
// chrome; `key` namespaces the window id ('win-<key>'). See styles.css `.info-modal.float-win`.
let _winZ = 600;        // z-index high-water mark; floats sit above the game chrome (z 1–500)
let _winCascade = 0;    // each desktop open steps the box down-and-right so windows don't stack exactly

// Brings a floating window's box to the front and gives it the active (blue) title bar, greying
// every other open float via .win-inactive (the existing inactive-title-bar style).
function focusWindow(box) {
  if (!box) return;
  const overlay = box.closest('.info-modal');
  if (overlay) overlay.style.zIndex = ++_winZ;
  document.querySelectorAll('.info-modal.float-win > .info-box').forEach(b =>
    b.classList.toggle('win-inactive', b !== box));
}

// Greys every floating window — fired when the player clicks the game (no window focused).
function blurAllWindows() {
  document.querySelectorAll('.info-modal.float-win > .info-box').forEach(b => b.classList.add('win-inactive'));
}

// × handler: closes the window the button lives in.
function closeWindow(btn) { btn.closest('.info-modal')?.remove(); }

// □ handler: glides this window back to center (zeroes its drag offset). No-op if undragged.
function recenterWindow(btn) {
  const box = btn.closest('.info-box');
  if (!box) return;
  const o = box._winOffset || { x: 0, y: 0 };
  if (o.x === 0 && o.y === 0) return;
  box._winOffset = { x: 0, y: 0 };
  box.style.transition = 'transform 0.22s ease';
  box.style.transform = 'translate(0,0)';
  setTimeout(() => { box.style.transition = ''; }, 220);
}

// Mobile only: an outside tap on the dark overlay closes the modal — EXCEPT the tap that brings an
// unfocused tab back into focus (the _refocusAt / document.hasFocus guard). _downOnSelf gates on a
// click that BOTH starts and ends on the overlay, so releasing a title-bar drag onto the overlay is
// never treated as an outside tap. Desktop floats don't use this — they (de)activate via the
// document-level focus handler (focusWindow / blurAllWindows, in _dragMousedown above).
function _infoOverlayClick(el, e) {
  if (e.target !== el || !el._downOnSelf) return;
  if (document.hasFocus() && Date.now() - _refocusAt >= 300) el.remove();
}

// Core opener. `key` identifies the window type; `boxHTML` is the full .info-box element markup.
// Desktop: floating, one per type (focuses an existing one instead of duplicating). Mobile: a single
// blocking modal that replaces any prior dialog. Returns the overlay element.
function _openWindow(key, boxHTML) {
  const id = 'win-' + key;
  if (_isMobile()) {
    document.querySelectorAll('.info-modal').forEach(m => m.remove());   // single blocking modal
    const el = document.createElement('div');
    el.id = id; el.className = 'info-modal';
    el.addEventListener('mousedown', e => { el._downOnSelf = (e.target === el); });
    el.onclick = e => _infoOverlayClick(el, e);
    el.innerHTML = boxHTML;
    document.body.appendChild(el);
    return el;
  }
  const existing = document.getElementById(id);
  if (existing) { focusWindow(existing.querySelector('.info-box')); return existing; }
  const el = document.createElement('div');
  el.id = id; el.className = 'info-modal float-win';
  el.innerHTML = boxHTML;
  document.body.appendChild(el);
  const box = el.querySelector('.info-box');
  const step = (_winCascade++ % 6) * 26;   // cascade so stacked opens don't sit exactly on top
  box._winOffset = { x: step, y: step };
  if (step) box.style.transform = `translate(${step}px,${step}px)`;
  focusWindow(box);
  return el;
}

// The □ recenter button only makes sense for a draggable desktop float; mobile modals are fixed, so
// they show just ×, matching the pre-floating-windows look.
const _recenterBtnHTML = () => _isMobile() ? '' : `<span class="tb-btn" title="Center" onclick="recenterWindow(this)">□</span>`;

// Shared blue-bar window for Help sections, the modifier popup, and About. `key` namespaces the id.
function _openInfoModal(title, content, key) {
  _openWindow(key, `<div class="info-box info-box-titled">
    <div class="title-bar">
      <span class="tb-title"><span class="tb-icon">♠</span>${title}</span>
      <span class="tb-btns">
        ${_recenterBtnHTML()}
        <span class="tb-btn close" title="Close" onclick="closeWindow(this)">×</span>
      </span>
    </div>
    <div class="info-content">${content}</div>
  </div>`);
}

function showInfo(section) {
  const {title, body} = INFO_SECTIONS[section] || INFO_SECTIONS.overview;
  _openInfoModal(title, `<div style="display:flex;flex-direction:column;gap:14px;font-size:1.15rem;color:var(--ink);line-height:1.55">${body}</div>`, 'help-' + section);
}

// File → About Gambdle. A mini ♠ GAMBDLE logo + editable subtitle/body; the copy lives in
// src/gametext.js (ABOUT_GAMBDLE) so it can be edited without touching the UI code.
function showAbout() {
  closeDropdowns();
  const a = (typeof ABOUT_GAMBDLE !== 'undefined' && ABOUT_GAMBDLE) || { subtitle: '', body: '' };
  const content = `
    <div style="text-align:center;padding:4px 4px 2px">
      <div class="logo logo-mini"><span class="logo-spade">♠</span>GAMBDLE</div>
      <div class="logo-sub">${a.subtitle || ''}</div>
    </div>
    <div class="divider" style="margin:14px 0"></div>
    <div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${a.body || ''}</div>`;
  _openInfoModal('About Gambdle', content, 'about');
}

// File → Player Profile. Lifetime stats from this device only (profileStats in core.js):
// tier line (graded on lifetime net via NET_TIERS), stat grid, 4-week calendar, and the
// cosmetic unlock chase. Standard cream info-window chrome, same as Help/About.
function showProfile() {
  closeDropdowns();
  const p = profileStats();
  const tier = getNetTier(p.net);
  const stat = (v, lbl, cls = '') =>
    `<div class="pf-stat"><b${cls ? ` class="${cls}"` : ''}>${v}</b><span>${lbl}</span></div>`;
  const stats =
    stat(fmt(p.streak), 'Streak') +
    stat(fmt(p.longest), 'Longest') +
    stat(fmt(p.best), 'Best') +
    stat(fmt(p.avg), 'Avg') +
    stat(p.net === 0 ? fmt(0) : sign(p.net), 'Lifetime Net', p.net > 0 ? 'pf-pos' : p.net < 0 ? 'pf-neg' : '') +
    stat(fmt(p.busts), 'Busts');
  const cells = p.calendar.map(c => `<i class="pf-c-${c}"></i>`);
  // 4 week rows of 7 days, oldest first (today is the last cell); each row labeled with its start date.
  const cal = [0, 7, 14, 21].map(r =>
    `<span class="pf-cal-wk">${p.calDates[r]}</span>${cells.slice(r, r + 7).join('')}`
  ).join('');
  const badges = UNLOCKS.map(u => getPref(u.prefKey)
    ? `<div class="pf-badge"><span class="pf-badge-ic">${u.icon}</span>${u.label}</div>`
    : `<div class="pf-badge pf-locked"><span class="pf-badge-ic">${icon('lock')}</span>${u.label}<span class="pf-badge-hint">${fmt(u.threshold)}+</span></div>`
  ).join('');
  const content = `
    <div class="pf-tier">${tier.emoji} ${tier.label} · ${fmt(p.daysPlayed)} ${p.daysPlayed === 1 ? 'day' : 'days'} played</div>
    <div class="pf-grid">${stats}</div>
    <div class="pf-sec">Last 4 Weeks</div>
    <div class="pf-cal">${cal}</div>
    <div class="pf-legend">
      <span><i class="pf-c-profit"></i>Profit</span><span><i class="pf-c-loss"></i>Loss</span>
      <span><i class="pf-c-bust"></i>Bust</span><span><i class="pf-c-miss"></i>Missed</span>
    </div>
    <div class="pf-sec">Unlocks</div>
    <div class="pf-badges">${badges}</div>`;
  _openInfoModal('Player Profile', content, 'profile');
}

// ─── XP NOTIFICATION BALLOON ─────────────────────────────────────────────
// The welcome copy (POPUP_MESSAGES) and its POPUP_ENABLED switch live in
// src/gametext.js with the rest of the editable text.

function showPopup(id) {
  if (!POPUP_ENABLED && !DEV_OVERRIDE) return;
  const msg = POPUP_MESSAGES[id];
  if (msg) _renderBalloon(msg.title, msg.body);
}

// Renders the XP balloon with an arbitrary title/body; returns true if shown.
// Shared by showPopup (legacy welcome) and the tutorial tips below.
function _renderBalloon(title, body, sticky = false) {
  const el = document.getElementById('xp-balloon');
  if (!el) return false;
  el.innerHTML = `
    <div class="xpb-inner">
      <div class="xpb-header">
        <div class="xpb-icon">i</div>
        <div class="xpb-title">${title}</div>
        <button class="xpb-close" onclick="dismissPopup()" title="Close">✕</button>
      </div>
      <div class="xpb-body">${body}</div>
    </div>
    <div class="xpb-tail"></div>`;
  el.className = 'xpb-visible';
  el.dataset.sticky = sticky ? '1' : '';
  el.dataset.screen = S.screen;        // sticky balloons close when this screen changes (see _runTutorial)
  _updateBalloonPosition();
  // No auto-fade. Tips also dismiss on an outside click; a sticky balloon (What's New) stays until the
  // X or a screen change instead. Deferred so the opening click doesn't immediately close it.
  if (!sticky) setTimeout(() => document.addEventListener('pointerdown', _popupOutsideClick), 0);
  return true;
}

// ─── TUTORIAL TIPS ───────────────────────────────────────────────────────
// Lightweight, once-ever contextual popups for things that surprise players
// (mostly how this Ultimate Texas Hold'em differs from regular Hold'em). Text
// lives in src/gametext.js; triggers are wired in _runTutorial(), called from
// render(). Skipped under automation (navigator.webdriver) so tips never appear
// in the test/screenshot/webkit harnesses, and on archive/backlog views.

function _tipSeen(id){ try { return !!_ls.getItem('gambdle_tip_' + id + '_seen'); } catch { return false; } }

// Dev "Test Tutorial" mode: when on, tips always fire (ignoring the seen history and the
// Tips-off setting) and are never persisted as seen, so they reappear on every visit.
function _testTutorial(){ try { return _ls.getItem('gambdle_dev_test_tutorial') === '1'; } catch { return false; } }

// Shows tip `id` once, if tutorials are on and no balloon is already up. Returns
// true if shown. Safe to call on every render — it self-dedupes via localStorage.
function _maybeTip(id){
  const force = _testTutorial();              // dev Test Tutorial: ignore seen + off, never persist
  if (!force && getPref('tutorial_off')) return false;
  if (!force && _tipSeen(id)) return false;
  if (typeof TUTORIAL_TIPS === 'undefined' || !TUTORIAL_TIPS[id]) return false;
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible')) return false; // one at a time → retry next render
  const tip = TUTORIAL_TIPS[id];
  // The first tip a player ever sees gets the "you can turn these off" note appended (not in force mode).
  const firstEver = !force && !_ls.getItem('gambdle_tutorial_intro_seen');
  const body = (firstEver && typeof TUTORIAL_OFF_NOTE === 'string') ? tip.body + TUTORIAL_OFF_NOTE : tip.body;
  if (!_renderBalloon(tip.title, body)) return false;
  if (!force) try {
    _ls.setItem('gambdle_tip_' + id + '_seen', '1');
    if (firstEver) _ls.setItem('gambdle_tutorial_intro_seen', '1');
  } catch {}
  return true;
}

// Pure mapping of the current screen/phase to the tip ids eligible right now, in
// priority order. Kept separate from _runTutorial so it can be unit-tested without
// the automation/balloon side effects. Returns [] on any non-trigger state.
function _eligibleTips(){
  const s = S.screen, out = [];
  if (s === 'intro') out.push('modifier');
  if (s === 'bj'  && S.bjPhase  === 'bet')     out.push('bj_hands');
  if (s === 'uth' && S.uthPhase === 'bet')     out.push('uth_bet');
  if (s === 'uth' && S.uthPhase === 'preflop') out.push('uth_raise');
  if (s === 'uth' && S.uthPhase === 'turn' && !S.uthRaised) out.push('uth_turn'); // river: raise 1x or fold, no check
  if (s === 'uth' && (S.uthPhase === 'reveal' || S.uthPhase === 'result')) out.push('uth_qualify');
  if (s === 'ladder' && S.ladPhase === 'bet') out.push('ladder');
  return out;
}

// localStorage key the current "what's new" note dedupes on (one per WHATS_NEW.id).
function _whatsNewKey(){ return 'gambdle_whatsnew_' + (typeof WHATS_NEW !== 'undefined' ? WHATS_NEW.id : ''); }

// Has this player finished at least one run before? Used to limit the "what's new" note to returning
// players. A completed run leaves a highscore and/or a gambdle_history entry.
function _isReturningPlayer(){
  try {
    if (_ls.getItem('gambdle_highscore')) return true;
    return Object.keys(JSON.parse(_ls.getItem('gambdle_history') || '{}')).length > 0;
  } catch { return false; }
}

// Shows the WHATS_NEW announcement balloon once to a returning player with Tips on, then marks it
// seen. A brand-new player is silently opted out of the *current* note (the key is marked seen
// without showing anything) so they only ever see FUTURE announcements; their normal new-player tips
// are untouched. Returns true if the balloon was shown. Environment guards (webdriver / backlog) and
// the "intro screen only" gate live in _runTutorial, its only caller — mirroring _maybeTip.
function _maybeWhatsNew(){
  if (typeof WHATS_NEW === 'undefined' || !WHATS_NEW.enabled) return false;
  if (getPref('tutorial_off')) return false;
  const key = _whatsNewKey();
  let seen; try { seen = !!_ls.getItem(key); } catch { return false; }
  if (seen) return false;
  if (!_isReturningPlayer()) { try { _ls.setItem(key, '1'); } catch {} return false; } // new player → future notes only
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible')) return false; // a tip already has the balloon
  if (!_renderBalloon(WHATS_NEW.title, WHATS_NEW.body, true)) return false; // sticky: X or screen change only
  try { _ls.setItem(key, '1'); } catch {}
  return true;
}

// Shows at most one eligible tip per render (a second surfaces on the next render
// rather than stacking). Skipped under automation (navigator.webdriver) so tips
// never appear in the test/screenshot/webkit harnesses, and on archive/backlog views.
// On the intro screen, the "what's new" note runs first: for a returning player the new-player
// modifier tip is already seen, so the note takes the balloon; for a new player it just silently
// opts them out of the current note and the modifier tip shows as usual.
function _runTutorial(){
  if (!_testTutorial() && (navigator.webdriver || _backlogSeed)) return;
  // A sticky balloon (What's New) closes as soon as you leave the screen it was shown on.
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible') && bal.dataset.sticky === '1' && bal.dataset.screen !== S.screen) dismissPopup();
  if (S.screen === 'intro') _maybeWhatsNew();
  for (const id of _eligibleTips()) if (_maybeTip(id)) break;
}

// Help menu → flip tips on/off. The menu rebuilds its label from getPref on next open.
function toggleTutorial(){
  const off = !getPref('tutorial_off');
  setPref('tutorial_off', off);
  closeDropdowns();
  toast(off ? 'Tips off' : 'Tips on 🎲');
}

// Dev menu → force tips to always show (ignores the seen history and the Tips-off setting).
// Persisted in _ls so it survives reloads while you preview. Tips never get marked seen while on.
function devToggleTestTutorial(){
  const on = !_testTutorial();
  try { _ls.setItem('gambdle_dev_test_tutorial', on ? '1' : ''); } catch {}
  const cb = document.getElementById('dev-test-tutorial-cb');
  if (cb) cb.checked = on;
  toast(on ? 'Test Tutorial on, tips always show' : 'Test Tutorial off');
}

// Timestamp (ms) of the most recent window refocus — see _popupOutsideClick.
let _refocusAt = 0;

// Closes the balloon on any click/tap that isn't inside it — EXCEPT the click that brings the
// window back into focus after it was unfocused (that click should leave the tip up). That refocus
// click can arrive either before focus is restored (document not yet focused) or just after the
// focus event fires, so we guard on both: an unfocused document, or a click within 300ms of refocus.
function _popupOutsideClick(e) {
  const el = document.getElementById('xp-balloon');
  if (el && el.contains(e.target)) return;
  if (!document.hasFocus() || Date.now() - _refocusAt < 300) return;
  dismissPopup();
}

function dismissPopup() {
  document.removeEventListener('pointerdown', _popupOutsideClick);
  const el = document.getElementById('xp-balloon');
  if (!el || !el.classList.contains('xpb-visible')) return;
  el.classList.remove('xpb-visible');
  el.classList.add('xpb-hiding');
  setTimeout(() => { el.className = ''; el.innerHTML = ''; }, 260);
}

// Anchors the balloon above the status bar at the window's right edge.
// Called after render() and on drag so the balloon tracks the window.
function _updateBalloonPosition() {
  const el = document.getElementById('xp-balloon');
  if (!el || !el.classList.contains('xpb-visible')) return;
  const win = document.querySelector('.window');
  if (!win) { el.style.bottom = '46px'; el.style.right = '8px'; return; }
  const rect = win.getBoundingClientRect();
  // Anchor just above the window's bottom-right. When the window is TALLER than the viewport (short
  // desktop height — now possible since the window grows to fit overflowing content), its bottom is
  // off-screen and the formula floors out; keep a 16px floor so the entrance animation (translateY
  // 10px) can't nudge the balloon off the bottom edge. Normal viewports already yield >16 here.
  el.style.bottom = Math.max(16, window.innerHeight - rect.bottom + 32) + 'px';
  el.style.right  = Math.max(4,  window.innerWidth  - rect.right  + 8)  + 'px';
}

// WinXP inactive title bar — dims chrome when tab loses focus
window.addEventListener('blur', () => document.body.classList.add('win-inactive'));
window.addEventListener('focus', () => { document.body.classList.remove('win-inactive'); _refocusAt = Date.now(); });
document.addEventListener('visibilitychange', () =>
  document.body.classList.toggle('win-inactive', document.hidden));
