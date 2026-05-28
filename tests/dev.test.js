// Dev-mode function tests.
// Runs in dev-tests.html which loads all source files (including game.js/ui.js) with:
//   - <div id="app"> in the DOM for render()
//   - location.reload stubbed to a no-op

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _resetDevState() {
  S.forcedMod = null;
  S.screen = 'intro';
  S.chips = START_CHIPS;
  saveState();
}

// ─── devApplyMod ─────────────────────────────────────────────────────────────

describe('devApplyMod', () => {
  it('sets S.forcedMod to the given key', () => {
    devApplyMod('r_hot_zero');
    assertEqual(S.forcedMod, 'r_hot_zero');
    S.forcedMod = null;
  });

  it('overwrites a previous forcedMod', () => {
    devApplyMod('double_pay');
    devApplyMod('comeback');
    assertEqual(S.forcedMod, 'comeback');
    S.forcedMod = null;
  });

  it('getMod reads the forced mod after devApplyMod', () => {
    devApplyMod('r_hot_zero');
    assertEqual(getMod('r_zero_boost'), 10);
    S.forcedMod = null;
  });

  it('accepts null to clear forced mod', () => {
    devApplyMod('double_pay');
    devApplyMod(null);
    assert(S.forcedMod === null, 'forcedMod should be null');
  });
});

// ─── devReset ────────────────────────────────────────────────────────────────

describe('devReset', () => {
  it('removes the current state key from storage', () => {
    _ls.setItem(getStateKey(), JSON.stringify({ chips: 999 }));
    assert(_ls.getItem(getStateKey()) !== null, 'precondition: state exists');
    devReset();
    assert(_ls.getItem(getStateKey()) === null, 'state removed after devReset');
  });

  it('calls location.reload (stubbed — reload count increments)', () => {
    const before = window._testReloadCount || 0;
    devReset();
    assert((window._testReloadCount || 0) > before, 'reload should have been called');
    // Restore state for subsequent tests
    _resetDevState();
  });
});

// ─── devSetGame ──────────────────────────────────────────────────────────────

describe('devSetGame', () => {
  it('sets gambdle_dev_game1 in storage', () => {
    devSetGame(1, 'uth');
    assertEqual(_ls.getItem('gambdle_dev_game1'), 'uth');
    _ls.removeItem('gambdle_dev_game1'); // remove so next load falls through to default
    _resetDevState();
  });

  it('sets gambdle_dev_game2 in storage', () => {
    devSetGame(2, 'bj');
    assertEqual(_ls.getItem('gambdle_dev_game2'), 'bj');
    _ls.removeItem('gambdle_dev_game2'); // remove so next load falls through to default
    _resetDevState();
  });

  it('removes current state key so next load starts fresh', () => {
    _ls.setItem(getStateKey(), JSON.stringify({ chips: 1234 }));
    devSetGame(1, 'bj');
    assert(_ls.getItem(getStateKey()) === null, 'state key cleared after devSetGame');
    _ls.removeItem('gambdle_dev_game1');
    _resetDevState();
  });
});

// ─── toggleTestSeed ──────────────────────────────────────────────────────────

describe('toggleTestSeed', () => {
  it('enables test seed when not active', () => {
    _ls.removeItem('gambdle_use_test_seed');
    assert(!_testActive(), 'precondition: test seed off');
    toggleTestSeed();
    assert(_testActive(), 'test seed should now be on');
  });

  it('disables test seed when active', () => {
    _ls.setItem('gambdle_use_test_seed', '1');
    assert(_testActive(), 'precondition: test seed on');
    toggleTestSeed();
    assert(!_testActive(), 'test seed should now be off');
  });

  it('clears gambdle_test_state when toggling off', () => {
    _ls.setItem('gambdle_use_test_seed', '1');
    _ls.setItem('gambdle_test_state', 'stale');
    toggleTestSeed();
    assert(_ls.getItem('gambdle_test_state') === null, 'test state cleared on toggle off');
  });

  it('clears gambdle_test_state when toggling on', () => {
    _ls.removeItem('gambdle_use_test_seed');
    _ls.setItem('gambdle_test_state', 'stale');
    toggleTestSeed();
    assert(_ls.getItem('gambdle_test_state') === null, 'test state cleared on toggle on');
    _ls.removeItem('gambdle_use_test_seed');
  });
});

// ─── devToggleUnlocks ────────────────────────────────────────────────────────

describe('devToggleUnlocks', () => {
  const UNLOCK_PREFS = [
    'golden_back_unlocked', 'whale_back_unlocked', 'orange_back_unlocked',
    'maroon_felt_unlocked', 'deck_emoji_unlocked', 'green_theme_unlocked',
  ];

  function _clearUnlocks() {
    UNLOCK_PREFS.forEach(k => setPref(k, false));
    setPref('cardback', 'default');
    setPref('felt', 'default');
    setPref('deck', 'default');
    setPref('theme', 'default');
  }

  it('sets all unlock prefs to true when starting from false', () => {
    _clearUnlocks();
    devToggleUnlocks();
    for (const k of UNLOCK_PREFS) {
      assert(!!getPref(k), `${k} should be unlocked`);
    }
    _clearUnlocks();
  });

  it('sets all unlock prefs to false when starting from true', () => {
    UNLOCK_PREFS.forEach(k => setPref(k, true));
    devToggleUnlocks();
    for (const k of UNLOCK_PREFS) {
      assert(!getPref(k), `${k} should be locked`);
    }
  });

  it('resets gold cardback to default when locking', () => {
    UNLOCK_PREFS.forEach(k => setPref(k, true));
    setPref('cardback', 'gold');
    devToggleUnlocks();
    assertEqual(getPref('cardback'), 'default');
  });

  it('keeps cardback as default if it was already default when locking', () => {
    UNLOCK_PREFS.forEach(k => setPref(k, true));
    setPref('cardback', 'default');
    devToggleUnlocks();
    assertEqual(getPref('cardback'), 'default');
  });
});
