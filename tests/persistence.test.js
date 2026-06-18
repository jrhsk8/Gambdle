// ─── Setup ────────────────────────────────────────────────────────────────────
// Activate test-seed mode so that:
//   getStateKey()  → 'gambdle_test_state'   (isolated from real daily saves)
//   saveState()    → skips getPref/setPref/toast  (guarded by !_testActive())
// Also clear gambdle_forced_mod so loadState() doesn't trigger a stray saveState().

const _savedSeedFlag   = _ls.getItem('gambdle_use_test_seed');
const _savedForcedMod  = _ls.getItem('gambdle_forced_mod');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _PKEY = getStateKey(); // 'gambdle_test_state'

// Snapshot of clean S taken before any persistence tests run.
// _mkSave() uses this as the base so every save has all expected fields.
const _sCleanJson = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });

function _restoreS() {
  const r = JSON.parse(_sCleanJson);
  r.pkHeld = new Set(r.pkHeld);
  Object.assign(S, r);
}

// Returns a complete save object: clean defaults merged with caller overrides.
function _mkSave(overrides = {}) {
  const base = JSON.parse(_sCleanJson);
  const out  = { ...base, ...overrides };
  if (out.pkHeld instanceof Set) out.pkHeld = [...out.pkHeld];
  return out;
}

// Writes a full save, calls loadState(), runs fn(), then cleans up storage and S.
function withSave(overrides, fn) {
  const prev = _ls.getItem(_PKEY);
  _ls.setItem(_PKEY, JSON.stringify(_mkSave(overrides)));
  loadState();
  try { fn(); } finally {
    prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
    _restoreS();
  }
}

// Removes the save key, calls loadState() (fresh-start path), then cleans up.
function withNoSave(fn) {
  const prev = _ls.getItem(_PKEY);
  _ls.removeItem(_PKEY);
  _restoreS();
  loadState();
  try { fn(); } finally {
    prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
    _restoreS();
  }
}

// Writes a raw string (not necessarily valid JSON) to the save key.
// Passes the load error (or null) to fn(), which can then assert on it.
function withRawSave(rawString, fn) {
  const prev = _ls.getItem(_PKEY);
  _ls.setItem(_PKEY, rawString);
  let loadErr = null;
  try { loadState(); } catch (e) { loadErr = e; }
  try { fn(loadErr); } finally {
    prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
    _restoreS();
  }
}

// ─── Fresh start ──────────────────────────────────────────────────────────────

describe('loadState — fresh start', () => {
  it('no saved state: chips default to START (1000)', () => {
    withNoSave(() => assertEqual(S.chips, 1000));
  });

  it('no saved state: screen is intro', () => {
    withNoSave(() => assertEqual(S.screen, 'intro'));
  });

  it('no saved state: all history arrays are empty', () => {
    withNoSave(() => {
      assertEqual(S.bjHistory.length,  0, 'bjHistory');
      assertEqual(S.uthHistory.length, 0, 'uthHistory');
      assertEqual(S.pkHistory.length,  0, 'pkHistory');
    });
  });

  it('no saved state: rResult is null', () => {
    withNoSave(() => assert(S.rResult === null));
  });
});

// ─── Mid-hand resume ─────────────────────────────────────────────────────────

describe('loadState — mid-BJ resume', () => {
  it('restores phase, bet, chips, and hand number', () => {
    withSave({
      screen: 'bj', chips: 900,
      bjPhase: 'player', bjBet: 100, bjHand: 1,
    }, () => {
      assertEqual(S.screen,  'bj');
      assertEqual(S.bjPhase, 'player');
      assertEqual(S.bjBet,   100);
      assertEqual(S.chips,   900);
      assertEqual(S.bjHand,  1);
    });
  });

  it('restores player and dealer card arrays', () => {
    withSave({
      screen: 'bj',
      bjPhase: 'player', bjBet: 50,
      bjPlayer: [{ r: '8', s: '♠' }, { r: '7', s: '♥' }],
      bjDealer: [{ r: 'K', s: '♦' }, { r: '2', s: '♣' }],
    }, () => {
      assertEqual(S.bjPlayer.length, 2);
      assertEqual(S.bjPlayer[0].r, '8');
      assertEqual(S.bjPlayer[1].s, '♥');
      assertEqual(S.bjDealer[0].r, 'K');
    });
  });

  it('restores double-down state', () => {
    withSave({
      screen: 'bj', bjPhase: 'dealer',
      bjDoubled: true, bjBet: 200,
    }, () => {
      assert(S.bjDoubled, 'bjDoubled flag');
      assertEqual(S.bjBet, 200);
    });
  });

  it('restores active split hand', () => {
    withSave({
      screen: 'bj', chips: 800,
      bjPhase: 'split', bjBet: 100, bjSplit: true,
      bjSplitHands: [
        [{ r: '8', s: '♠' }, { r: '5', s: '♦' }],
        [{ r: '8', s: '♥' }, { r: 'K', s: '♣' }],
      ],
      bjSplitActive: 0,
      bjSplitBets: [100, 100],
    }, () => {
      assert(S.bjSplit, 'bjSplit flag');
      assertEqual(S.bjSplitHands.length, 2);
      assertEqual(S.bjSplitHands[0][0].r, '8');
      assertEqual(S.bjSplitBets[1], 100);
      assertEqual(S.bjSplitActive, 0);
    });
  });

  it('restores completed BJ hand history', () => {
    withSave({
      screen: 'bj',
      bjHand: 2,
      bjHistory: [{ delta: 150 }, { delta: -100 }],
      chips: 1050,
    }, () => {
      assertEqual(S.bjHistory.length, 2);
      assertEqual(S.bjHistory[0].delta,  150);
      assertEqual(S.bjHistory[1].delta, -100);
    });
  });
});

describe('loadState — mid-UTH resume', () => {
  it('restores flop phase with raised play bet', () => {
    withSave({
      screen: 'uth', chips: 750,
      uthPhase: 'flop', uthAnte: 200,
      uthRaise: 400, uthRaiseMult: 4, uthRaised: true,
      uthRevealComm: 3,
      uthHole:   [{ r: 'A', s: '♠' }, { r: 'K', s: '♠' }],
      uthDealer: [{ r: '2', s: '♥' }, { r: '7', s: '♦' }],
      uthComm:   [
        { r: 'Q', s: '♠' }, { r: 'J', s: '♠' }, { r: '10', s: '♠' },
        { r: '3', s: '♣' }, { r: '6',  s: '♦' },
      ],
    }, () => {
      assertEqual(S.uthPhase,      'flop');
      assertEqual(S.uthAnte,       200);
      assertEqual(S.uthRaise,       400);
      assertEqual(S.uthRaiseMult,   4);
      assert(S.uthRaised,          'uthRaised');
      assertEqual(S.uthRevealComm, 3);
      assertEqual(S.uthHole[0].r,  'A');
      assertEqual(S.uthComm.length, 5);
    });
  });

  it('restores turn phase with no raise yet', () => {
    withSave({
      screen: 'uth', uthPhase: 'turn',
      uthRaised: false, uthAnte: 100, uthRaise: 0, uthRevealComm: 5,
    }, () => {
      assertEqual(S.uthPhase,      'turn');
      assert(!S.uthRaised,         'uthRaised is false');
      assertEqual(S.uthRevealComm, 5);
    });
  });
});

describe('loadState — roulette resume', () => {
  it('restores bet phase with placed bets', () => {
    withSave({
      screen: 'roulette', chips: 900,
      rPhase: 'bet', rBet: 100,
      rBets: [{ pick: 45, bet: 50 }, { pick: 17, bet: 50 }],
    }, () => {
      assertEqual(S.rPhase,       'bet');
      assertEqual(S.rBets.length, 2);
      assertEqual(S.rBets[0].pick, 45);
      assertEqual(S.rBets[1].pick, 17);
      assertEqual(S.rBet,          100);
    });
  });

  it('restores post-spin result', () => {
    withSave({
      screen: 'roulette', chips: 1175,
      rPhase: 'result', rSpin: 17,
      rResult: { delta: 175, spin: 17 },
    }, () => {
      assertEqual(S.rSpin,         17);
      assertEqual(S.rResult.delta, 175);
      assertEqual(S.rPhase,        'result');
    });
  });

  it('restores re-spin-used flag', () => {
    withSave({ rReSpun: true, rSpin: 5 }, () => {
      assert(S.rReSpun, 'rReSpun flag');
    });
  });
});

// ─── Chip guards ─────────────────────────────────────────────────────────────

describe('loadState — anti-inflation guard (results screen)', () => {
  it('chips recomputed from history, tampered save value ignored', () => {
    withSave({
      screen: 'results', chips: 99999,
      bjHistory:  [{ delta: 200 }, { delta: -50 }, { delta: 100 }], // net +250
      uthHistory: [{ delta: -100 }, { delta: 300 }],                 // net +200
      rResult:    { delta: -50 },
    }, () => {
      // 1000 + 250 + 200 - 50 = 1400
      assertEqual(S.chips, 1400);
    });
  });

  it('all-loss run computes correct low total', () => {
    withSave({
      screen: 'results', chips: 99999,
      bjHistory:  [{ delta: -300 }],
      uthHistory: [{ delta: -200 }],
      rResult:    { delta: -100 },
    }, () => {
      assertEqual(S.chips, 400); // 1000 - 300 - 200 - 100
    });
  });

  it('null rResult counts as zero delta', () => {
    withSave({
      screen: 'results', chips: 99999,
      bjHistory:  [{ delta: 500 }],
      uthHistory: [{ delta: 0 }],
      rResult:    null,
    }, () => {
      assertEqual(S.chips, 1500); // 1000 + 500
    });
  });

  it('multiple hands per game: all deltas summed', () => {
    withSave({
      screen: 'results', chips: 99999,
      bjHistory:  [{ delta: 100 }, { delta: -50 }, { delta: 200 }], // +250
      uthHistory: [{ delta: -100 }, { delta: 100 }, { delta: 50 }], // +50
      rResult:    { delta: 300 },
    }, () => {
      assertEqual(S.chips, 1600); // 1000 + 250 + 50 + 300
    });
  });
});

describe('loadState — no-progress guard', () => {
  it('chips forced to START when nothing has happened', () => {
    withSave({
      screen: 'intro', chips: 9999,
      bjHistory: [], uthHistory: [], pkHistory: [],
      rResult: null, bjBet: 0, uthAnte: 0, pkBet: 0, rBets: [],
    }, () => assertEqual(S.chips, 1000));
  });

  it('guard does not fire once bjBet is placed', () => {
    withSave({
      screen: 'bj', chips: 9999,
      bjBet: 100,
      bjHistory: [], uthHistory: [], pkHistory: [],
      rResult: null, uthAnte: 0, pkBet: 0, rBets: [],
    }, () => assertEqual(S.chips, 9999, 'chips preserved with bet pending'));
  });

  it('guard does not fire once bjHistory has entries', () => {
    withSave({
      screen: 'bj', chips: 1200,
      bjHistory: [{ delta: 200 }],
      bjBet: 0, uthAnte: 0, pkBet: 0, rBets: [],
    }, () => assertEqual(S.chips, 1200));
  });

  it('guard does not fire once rBets has items', () => {
    withSave({
      screen: 'roulette', chips: 9999,
      bjHistory: [], uthHistory: [], pkHistory: [],
      rResult: null, bjBet: 0, uthAnte: 0, pkBet: 0,
      rBets: [{ pick: 1, bet: 50 }],
    }, () => assertEqual(S.chips, 9999, 'chips preserved with rBets placed'));
  });

  it('guard does not fire once uthAnte is set', () => {
    withSave({
      screen: 'uth', chips: 9999,
      bjHistory: [], uthHistory: [], pkHistory: [],
      rResult: null, bjBet: 0, uthAnte: 100, pkBet: 0, rBets: [],
    }, () => assertEqual(S.chips, 9999));
  });
});

// ─── Save/load round-trip ─────────────────────────────────────────────────────

describe('saveState → loadState round-trip', () => {
  it('modified fields are persisted and restored', () => {
    const prev = _ls.getItem(_PKEY);
    try {
      Object.assign(S, { screen: 'bj', chips: 1337, bjPhase: 'player', bjBet: 150, bjHand: 2 });
      saveState();
      S.chips = 0; S.bjBet = 0; S.screen = 'intro';
      loadState();
      assertEqual(S.chips,   1337);
      assertEqual(S.bjBet,    150);
      assertEqual(S.screen,  'bj');
      assertEqual(S.bjHand,    2);
    } finally {
      prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
      _restoreS();
    }
  });

  it('pkHeld Set serialized as array in storage, restored as Set', () => {
    const prev = _ls.getItem(_PKEY);
    try {
      S.pkHeld = new Set([0, 2, 4]);
      saveState();

      const stored = JSON.parse(_ls.getItem(_PKEY));
      assert(Array.isArray(stored.pkHeld), 'stored as array');
      assertDeepEqual([...stored.pkHeld].sort((a, b) => a - b), [0, 2, 4]);

      S.pkHeld = new Set();
      loadState();
      assert(S.pkHeld instanceof Set, 'restored as Set');
      assertEqual(S.pkHeld.size, 3);
      assert(S.pkHeld.has(0) && S.pkHeld.has(2) && S.pkHeld.has(4));
    } finally {
      prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
      _restoreS();
    }
  });

  it('multiple consecutive saves: last write wins', () => {
    const prev = _ls.getItem(_PKEY);
    try {
      Object.assign(S, { chips: 900, bjBet: 100 });
      saveState();
      Object.assign(S, { chips: 1100, bjBet: 0, bjHistory: [{ delta: 100 }] });
      saveState();

      S.chips = 0; S.bjHistory = [];
      loadState();
      assertEqual(S.chips, 1100);
      assertEqual(S.bjHistory.length, 1);
    } finally {
      prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
      _restoreS();
    }
  });

  it('forcedMod is persisted and restored', () => {
    const prev = _ls.getItem(_PKEY);
    try {
      S.forcedMod = 'double_pay';
      saveState();
      S.forcedMod = null;
      loadState();
      assertEqual(S.forcedMod, 'double_pay');
    } finally {
      prev !== null ? _ls.setItem(_PKEY, prev) : _ls.removeItem(_PKEY);
      _restoreS();
    }
  });
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

describe('loadState — graceful degradation', () => {
  it('corrupted JSON degrades gracefully — no throw, day starts fresh', () => {
    // A truncated/corrupt save (e.g. storage-quota pressure) must not crash boot. loadState
    // treats an unparseable value as "no save" and leaves S in a usable default state.
    withRawSave('{{NOT_VALID_JSON', err => {
      assert(err === null, 'loadState did not throw on invalid JSON');
      assert(Array.isArray(S.bjHistory), 'S left in a usable default state');
      assert(S.pkHeld instanceof Set, 'pkHeld still a Set');
    });
  });

  it('empty object {} does not throw', () => {
    withRawSave(JSON.stringify({}), err => {
      assert(err === null, 'no throw on empty save');
    });
  });

  it('save with only chips and screen: screen restored, chips reset by no-progress guard', () => {
    // No history or bets in a partial save → _noProg fires → chips forced to START.
    // screen is still correctly restored.
    withRawSave(JSON.stringify({ chips: 1234, screen: 'bj' }), err => {
      assert(err === null, 'no throw');
      assertEqual(S.screen, 'bj', 'screen restored from partial save');
      assertEqual(S.chips,  1000, 'no-progress guard fires: chips reset to START');
    });
  });

  it('save with only chips and screen: missing fields retain S defaults', () => {
    withRawSave(JSON.stringify({ chips: 500, screen: 'bj' }), err => {
      assert(err === null);
      assert(Array.isArray(S.bjHistory), 'bjHistory still array');
      assert(S.pkHeld instanceof Set,    'pkHeld still a Set');
    });
  });

  it('save with null chips does not crash', () => {
    withRawSave(JSON.stringify({ chips: null, screen: 'intro' }), err => {
      assert(err === null, 'no throw');
      // null chips: S.chips becomes null, which is odd but not a crash
      // The important thing is it does not throw
    });
  });
});

// ─── Format migration ─────────────────────────────────────────────────────────

describe('loadState — format migration', () => {
  it("screen='poker' migrated to GAME2 when GAME2 !== 'poker'", () => {
    if (GAME2 === 'poker') return; // skip if dev has set GAME2=poker
    withSave({ screen: 'poker' }, () => {
      assertEqual(S.screen, GAME2, `migrated 'poker' → GAME2='${GAME2}'`);
    });
  });

  it('non-poker screens are never migrated', () => {
    for (const scr of ['bj', 'uth', 'roulette', 'results', 'intro']) {
      withSave({ screen: scr }, () => {
        assertEqual(S.screen, scr, `'${scr}' unchanged`);
      });
    }
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ls.removeItem(_PKEY);
_savedSeedFlag  === null ? _ls.removeItem('gambdle_use_test_seed') : _ls.setItem('gambdle_use_test_seed', _savedSeedFlag);
_savedForcedMod === null ? _ls.removeItem('gambdle_forced_mod')    : _ls.setItem('gambdle_forced_mod', _savedForcedMod);
_restoreS();
