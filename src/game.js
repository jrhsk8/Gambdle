// One-off init at page load: restores the saved day state, applies prefs, renders the
// current screen, wires window drag, and resumes any animation a mid-hand refresh cut off.
// Just first-paint and recovery orchestration, no game logic.
//
// ─── BOOT ───────────────────────────────────────────────────────────────────

// Resumes any in-flight animation after a mid-hand refresh. The Game registry's `resume`
// slot (registered per-game: bj.js, uth.js, poker.js, roulette.js, ladder.js) guards phase
// internally, so this is one registry lookup with no per-game branches. Even Blackjack
// (instant, no stagger) has a no-op resume, so every game takes the same path.
function _resumeAfterRefresh() {
  GAMES[S.screen]?.resume();   // every game entry has a resume (no-op where instant); optional call guards against S.screen being a shell screen with no entry
}

// First-time player UX: shows the welcome popup only on the very first visit (localStorage gate).
// Gated by POPUP_ENABLED so it can be toggled off globally without code changes.
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
_resumeAfterRefresh();
_maybeShowWelcomePopup();
// Device/environment profile beacon (Devices dev page). Gated out of unit tests to avoid
// live network writes at boot; the rest of its skip logic (dev/test/backlog/dedup) lives
// in _submitClient, which every caller shares.
if (!(typeof window !== 'undefined' && window.__GAMBDLE_TEST__)) _submitClient();
