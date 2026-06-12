// ─── BOOT ───────────────────────────────────────────────────────────────────
// Loads last. Restores the saved day state, applies prefs, renders the current
// screen, wires window dragging, and resumes any animation a refresh interrupted.

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
    if (S.rSpin == null) {
      // Refresh landed during the spin-word fetch: re-acquire and resume. The spin Edge
      // Function is idempotent per device-day, so the re-fetch returns the same words.
      const bets = S.rBets.map(b => [b.pick, b.bet]);
      _resolveSpinNumber(bets).then(sp => {
        S.rSpin = sp.n; S.rSpin2 = sp.n2;
        saveState();
        setTimeout(startWheelAnim, 60);
      });
    } else setTimeout(startWheelAnim, 60);
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
