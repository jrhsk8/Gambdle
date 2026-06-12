// ─── Game shell lock-in tests ─────────────────────────────────────────────────
// Locks the current behavior of the app-shell seams in game.js before the module
// split: statusBar(), submitAndFetchLeaderboard(), _resumeAfterRefresh(), the
// welcome-popup gate, and the boot-call surface. If a refactor moves or renames
// any of these, this file is the tripwire.
//
// Techniques reused from start-tracking.test.js:
//   • async functions run synchronously up to their first `await`, so a sync
//     fetch spy captures the first request without async test support.
//   • _withBacklogSeed (dev.test.js) toggles archive/preview mode safely.
// New here:
//   • withImmediateTimeouts replaces window.setTimeout with an immediate call,
//     so _resumeAfterRefresh's 300ms resume timers run synchronously.
//   • render/startWheelAnim/_resolveSpinNumber are globals declared with
//     `function`, so they can be stubbed by assignment and restored (same trick
//     test.html uses for _doReload).

// ─── Setup ────────────────────────────────────────────────────────────────────
const _gsSavedSeedFlag = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _gsSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _gsRestore = () => {
  const r = JSON.parse(_gsSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// Runs fn with the test seed removed and today's submitted-key cleared (simulates
// a real player session), restoring both afterwards.
function _gsLive(fn) {
  const savedFlag = _ls.getItem('gambdle_use_test_seed');
  _ls.removeItem('gambdle_use_test_seed');
  const subKey = `gambdle_submitted_${getActiveSeed()}`;
  const savedSub = _ls.getItem(subKey);
  _ls.removeItem(subKey);
  try { fn(); } finally {
    savedFlag !== null ? _ls.setItem('gambdle_use_test_seed', savedFlag) : _ls.removeItem('gambdle_use_test_seed');
    savedSub  !== null ? _ls.setItem(subKey, savedSub) : _ls.removeItem(subKey);
  }
}

// Fetch spy whose response is NOT ok, so submitAndFetchLeaderboard never runs its
// `_ls.setItem(subKey)` success path as a stray microtask after the test ends.
function _gsFetchSpy(fn) {
  const orig = window.fetch;
  const calls = [];
  window.fetch = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null), headers: { get: () => null } });
  };
  try { fn(calls); } finally { window.fetch = orig; }
}

// Replaces window.setTimeout with an immediate invoke for the duration of fn.
function withImmediateTimeouts(fn) {
  const orig = window.setTimeout;
  window.setTimeout = (cb) => { cb(); return 0; };
  try { fn(); } finally { window.setTimeout = orig; }
}

// Stubs render() with a counter for the duration of fn — _resumeAfterRefresh's
// contract is "fix the phase, then re-render"; the render itself is covered by
// the render smoke tests.
function withRenderSpy(fn) {
  const orig = render;
  let count = 0;
  render = () => { count++; };
  try { fn(() => count); } finally { render = orig; _noAnim = false; }
}

// ─── statusBar ────────────────────────────────────────────────────────────────

describe('statusBar — per-screen hints', () => {
  function barFor(screen) {
    const prev = S.screen;
    S.screen = screen;
    try { return statusBar(); } finally { S.screen = prev; }
  }

  it('intro shows the idle hint', () => {
    assert(barFor('intro').includes('Idle · Start a new game.'), 'intro hint');
  });

  it('bj / uth / roulette show their game hints', () => {
    assert(barFor('bj').includes('Blackjack · Choose action.'), 'bj hint');
    assert(barFor('uth').includes("Hold'em · Choose action."), 'uth hint');
    assert(barFor('roulette').includes('Roulette · Place a bet.'), 'roulette hint');
  });

  it('borrow and results show their hints', () => {
    assert(barFor('borrow').includes('Borrow chips to continue.'), 'borrow hint');
    assert(barFor('results').includes('New game at midnight'), 'results hint');
  });

  it('unknown screens (including choice) fall back to Ready.', () => {
    assert(barFor('choice').includes('Ready.'), 'choice has no hint entry today — falls back');
    assert(barFor('nonsense').includes('Ready.'), 'unknown screen falls back');
  });

  it('shows the Gambdle label with the day number and the mute toggle', () => {
    const html = barFor('intro');
    assert(html.includes(`Gambdle #${S.day}`), `label should be Gambdle #${S.day}`);
    assert(html.includes('id="sb-mute-icon"'), 'mute icon present');
  });

  it('backlog mode relabels: past day = Archive, future day = Preview', () => {
    _withBacklogSeed(20260505, () => {
      assert(barFor('intro').includes(`Archive #${S.day}`), 'past backlog day shows Archive');
    });
    _withBacklogSeed(20991231, () => {
      assert(barFor('intro').includes(`Preview #${S.day}`), 'future backlog day shows Preview');
    });
  });

  it('backlog results screen shows "Day #N complete"', () => {
    _withBacklogSeed(20260505, () => {
      assert(barFor('results').includes(`Day #${S.day} complete`), 'backlog results hint');
    });
  });
});

// ─── submitAndFetchLeaderboard ───────────────────────────────────────────────

describe('submitAndFetchLeaderboard — submission guards', () => {
  it('test mode: skips submission, first call is the percentile RPC', () => {
    _gsFetchSpy(calls => {
      submitAndFetchLeaderboard();
      assertEqual(calls.length, 1, 'one sync call expected');
      assert(calls[0].url.includes('get_percentile'), `expected percentile RPC, got ${calls[0].url}`);
      assert(!calls.some(c => c.url.includes('submit-score')), 'no submit-score call in test mode');
    });
  });

  it('already submitted today: skips submission, goes straight to percentile', () => {
    _gsLive(() => {
      const subKey = `gambdle_submitted_${getActiveSeed()}`;
      _ls.setItem(subKey, '1');
      _gsFetchSpy(calls => {
        submitAndFetchLeaderboard();
        assert(calls[0].url.includes('get_percentile'), 'percentile first when already submitted');
      });
      _ls.removeItem(subKey);
    });
  });

  it('backlog mode: never submits, queries the percentile for the backlog seed', () => {
    _gsLive(() => {
      _withBacklogSeed(20260505, () => {
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assert(calls[0].url.includes('get_percentile'), 'percentile first in backlog mode');
          assertEqual(JSON.parse(calls[0].opts.body).p_seed, 20260505, 'queries the backlog seed');
        });
      });
    });
  });
});

describe('submitAndFetchLeaderboard — submission payload (live mode)', () => {
  it('POSTs to the submit-score Edge Function first', () => {
    _gsLive(() => {
      _gsFetchSpy(calls => {
        submitAndFetchLeaderboard();
        assertEqual(calls.length, 1, 'exactly one sync call');
        assert(calls[0].url.includes('/functions/v1/submit-score'), `expected submit-score, got ${calls[0].url}`);
        assertEqual(calls[0].opts.method, 'POST');
      });
    });
  });

  it('sends seed, chips, and a non-empty fingerprint', () => {
    _gsLive(() => {
      _gsFetchSpy(calls => {
        submitAndFetchLeaderboard();
        const body = JSON.parse(calls[0].opts.body);
        assertEqual(body.seed, getActiveSeed(), 'body.seed');
        assertEqual(body.chips, Math.max(0, S.chips), 'body.chips');
        assert(typeof body.fingerprint === 'string' && body.fingerprint.length > 0, 'fingerprint non-empty');
      });
    });
  });

  it('clamps negative chip counts to 0', () => {
    _gsLive(() => {
      const prev = S.chips;
      S.chips = -50;
      try {
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assertEqual(JSON.parse(calls[0].opts.body).chips, 0, 'negative chips clamp to 0');
        });
      } finally { S.chips = prev; }
    });
  });

  it('sends the transcript array, and [] when S.tx is not an array', () => {
    _gsLive(() => {
      const prevTx = S.tx;
      try {
        S.tx = [{ g: 'sys', a: 'borrow', amt: 500 }];
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assertDeepEqual(JSON.parse(calls[0].opts.body).tx, S.tx, 'transcript passes through');
        });
        S.tx = null;
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assertDeepEqual(JSON.parse(calls[0].opts.body).tx, [], 'non-array tx becomes []');
        });
      } finally { S.tx = prevTx; }
    });
  });

  it('marks unverifiedSpin true only when S.rUnverified === true', () => {
    _gsLive(() => {
      const prev = S.rUnverified;
      try {
        S.rUnverified = true;
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assertEqual(JSON.parse(calls[0].opts.body).unverifiedSpin, true, 'flag set');
        });
        delete S.rUnverified;
        _gsFetchSpy(calls => {
          submitAndFetchLeaderboard();
          assertEqual(JSON.parse(calls[0].opts.body).unverifiedSpin, false, 'flag defaults false');
        });
      } finally { S.rUnverified = prev; }
    });
  });
});

// ─── _resumeAfterRefresh ─────────────────────────────────────────────────────

describe('_resumeAfterRefresh — mid-animation state restore', () => {
  it('does nothing on screens without a pending animation', () => {
    const prevScreen = S.screen;
    S.screen = 'intro';
    try {
      withRenderSpy(renders => {
        withImmediateTimeouts(() => _resumeAfterRefresh());
        assertEqual(renders(), 0, 'no render on intro');
      });
    } finally { S.screen = prevScreen; }
  });

  it('UTH refresh during reveal: advances to result and re-renders', () => {
    const prev = { screen: S.screen, uthPhase: S.uthPhase, uthHistory: S.uthHistory };
    S.screen = 'uth'; S.uthPhase = 'reveal'; S.uthHistory = [{ delta: -10 }];
    try {
      withRenderSpy(renders => {
        withImmediateTimeouts(() => _resumeAfterRefresh());
        assertEqual(S.uthPhase, 'result', 'phase resumed to result');
        assertEqual(renders(), 1, 'one re-render');
      });
    } finally { Object.assign(S, prev); }
  });

  it('poker refresh during draw: bumps the hand counter and shows the result', () => {
    const prev = { screen: S.screen, pkPhase: S.pkPhase, pkHand: S.pkHand };
    S.screen = 'poker'; S.pkPhase = 'draw'; S.pkHand = 1;
    try {
      withRenderSpy(renders => {
        withImmediateTimeouts(() => _resumeAfterRefresh());
        assertEqual(S.pkPhase, 'result', 'phase resumed to result');
        assertEqual(S.pkHand, 2, 'hand counter bumped');
        assertEqual(renders(), 1, 'one re-render');
      });
    } finally { Object.assign(S, prev); }
  });

  it('roulette refresh mid-spin with the spin known: restarts the wheel animation', () => {
    const prev = { screen: S.screen, rPhase: S.rPhase, rSpin: S.rSpin };
    const origWheel = startWheelAnim;
    let wheelCalls = 0;
    startWheelAnim = () => { wheelCalls++; };
    S.screen = 'roulette'; S.rPhase = 'spinning'; S.rSpin = 17;
    try {
      withImmediateTimeouts(() => _resumeAfterRefresh());
      assertEqual(wheelCalls, 1, 'wheel animation restarted');
      assertEqual(S.rSpin, 17, 'spin result untouched');
    } finally { startWheelAnim = origWheel; _rouletteAudio = null; Object.assign(S, prev); }
  });

  it('roulette refresh mid-spin before the spin words arrived: re-fetches the spin', () => {
    const prev = { screen: S.screen, rPhase: S.rPhase, rSpin: S.rSpin, rBets: S.rBets };
    const origResolve = _resolveSpinNumber;
    let resolveArgs = null;
    // Never-resolving promise: the .then continuation (saveState + a real 60ms
    // timer firing startWheelAnim) must not run after this test finishes.
    _resolveSpinNumber = (bets) => { resolveArgs = bets; return new Promise(() => {}); };
    S.screen = 'roulette'; S.rPhase = 'spinning'; S.rSpin = null;
    S.rBets = [{ pick: 7, bet: 25 }, { pick: 38, bet: 10 }];
    try {
      withImmediateTimeouts(() => _resumeAfterRefresh());
      assertDeepEqual(resolveArgs, [[7, 25], [38, 10]], 're-fetch carries the placed bets');
    } finally { _resolveSpinNumber = origResolve; _rouletteAudio = null; Object.assign(S, prev); }
  });
});

// ─── Welcome popup gate ──────────────────────────────────────────────────────

describe('_maybeShowWelcomePopup — disabled gate', () => {
  // POPUP_ENABLED is currently false; the gate must mean "no writes, no balloon".
  // If POPUP_ENABLED is ever deliberately flipped on, update this lock.
  it('POPUP_ENABLED is off', () => {
    assertEqual(POPUP_ENABLED, false, 'welcome popup is currently disabled');
  });

  it('writes no seen-key and schedules nothing while disabled', () => {
    const saved = _ls.getItem('gambdle_popup_welcome_seen');
    _ls.removeItem('gambdle_popup_welcome_seen');
    try {
      withImmediateTimeouts(() => _maybeShowWelcomePopup());
      assertEqual(_ls.getItem('gambdle_popup_welcome_seen'), null, 'no seen-key written');
      assert(!document.querySelector('.popup-balloon'), 'no balloon rendered');
    } finally {
      saved !== null ? _ls.setItem('gambdle_popup_welcome_seen', saved) : _ls.removeItem('gambdle_popup_welcome_seen');
    }
  });
});

// ─── Boot surface ────────────────────────────────────────────────────────────
// game.js's boot tail calls these in order; render() dispatches to the screen
// functions. If a module extraction drops a script tag or renames a function,
// this fails immediately with the missing name.

describe('boot surface — every global the shell wires together exists', () => {
  it('boot sequence functions exist', () => {
    for (const fn of ['loadState', 'applyPrefs', 'render', 'initWindowDrag',
                      '_bjResumeAfterRefresh', '_resumeAfterRefresh', '_maybeShowWelcomePopup']) {
      assertEqual(typeof window[fn], 'function', `${fn} must be a global function`);
    }
  });

  it('screen renderers used by render() exist', () => {
    for (const fn of ['screenIntro', 'screenChoice', 'screenBJ', 'screenUTH', 'screenPoker',
                      'screenRoulette', 'screenBorrow', 'screenResults', 'screenDevStats', 'statusBar']) {
      assertEqual(typeof window[fn], 'function', `${fn} must be a global function`);
    }
  });

  it('navigation, leaderboard, and dev seams exist', () => {
    for (const fn of ['goTo', 'advanceTo', 'startGame', '_submitStart', '_submitBorrow',
                      'submitAndFetchLeaderboard', 'fetchScoreDistribution', '_renderScoreDist',
                      'devReset', '_doReload', '_drawLayoutDebug', '_dragMousedown',
                      'updateChipDisplay', '_resultPanel', 'resultAdvanceBtn']) {
      assertEqual(typeof window[fn], 'function', `${fn} must be a global function`);
    }
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────
_gsSavedSeedFlag !== null
  ? _ls.setItem('gambdle_use_test_seed', _gsSavedSeedFlag)
  : _ls.removeItem('gambdle_use_test_seed');
_gsRestore();
