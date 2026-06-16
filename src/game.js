// ─── BOOT ───────────────────────────────────────────────────────────────────
// Loads last. Restores the saved day state, applies prefs, renders the current
// screen, wires window dragging, and resumes any animation a refresh interrupted.

// Handles mid-animation refreshes by dispatching to the current screen's `resume` slot in the Game
// registry (GAMES[screen].resume, registered by each game's own file — UTH, Poker, Roulette). Each
// slot guards its own phase internally, so this is a pure screen lookup. Blackjack is the exception:
// its resume (_bjResumeAfterRefresh) stays a separate boot call due to its dealer-draw choreography.
function _resumeAfterRefresh() {
  GAMES[S.screen]?.resume?.();
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
