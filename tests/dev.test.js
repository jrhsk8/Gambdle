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
    assertEqual(getMod('r_hot_number'), 0);
    assertEqual(getMod('r_hot_boost'), 10);
    S.forcedMod = null;
  });

  it('accepts null to clear forced mod', () => {
    devApplyMod('double_pay');
    devApplyMod(null);
    assert(S.forcedMod === null, 'forcedMod should be null');
  });
});

// ─── devLadder ───────────────────────────────────────────────────────────────

describe('devLadder', () => {
  it('forces the ladder_day mod, resets the run, and jumps to the ladder bet phase', () => {
    S.ladPhase = 'done'; S.ladResult = { delta: 500, rung: 4, result: 'cash', free: true };
    devLadder();
    assertEqual(S.forcedMod, 'ladder_day');
    assertEqual(S.screen, 'ladder');
    assertEqual(S.ladPhase, 'bet', 'run reset to bet phase');
    assert(S.ladResult === null, 'previous result cleared');
    assertEqual(getMod('ladder_free'), 250, 'free entry active');
    S.forcedMod = null; resetLadderRun(); S.screen = 'intro';
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

// ─── Seed & Date Logic (advanced dev tests) ─────────────────────────────────
section('Seed & Date Logic');

// Advanced dev-mode tests: seed switching, date arithmetic, state isolation, RNG behavior.
// Runs in dev-tests.html alongside dev.test.js.
//
// Uses direct manipulation of globals (_backlogSeed, DAILY_SEED_OVERRIDES). That's intentional,
// since these tests are checking the behavior those globals define.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _withBacklogSeed(seed, fn) {
  _setBacklogSeedForTest(seed);
  try { fn(); } finally { _setBacklogSeedForTest(null); }
}

function _withSeedOverride(date, override, fn) {
  DAILY_SEED_OVERRIDES[date] = override;
  try { fn(); } finally { delete DAILY_SEED_OVERRIDES[date]; }
}

// Compute expected day number from a YYYYMMDD seed using the same formula as core.js.
function _expectedDayNum(seed) {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100) - 1;
  const d = seed % 100;
  return Math.floor((Date.UTC(y, m, d) - START_DATE_UTC) / 86400000) + 1;
}

// Run genDeal() logic deterministically for any seed (mirrors core.js genDeal).
function _genDealForSeed(seed) {
  const rng = mkRng(seed);
  const shoe = [];
  for (let i = 0; i < 2; i++) shoe.push(...buildDeck());
  const bjShoe    = shuffle([...shoe], rng);
  const pokerDecks = [0, 1, 2].map(() => shuffle(buildDeck(), rng));
  const uthDeck   = shuffle(buildDeck(), rng);
  return { bjShoe, pokerDecks, uthDeck };
}

// ─── Backlog seed: getActiveSeed ─────────────────────────────────────────────

describe('backlog seed — getActiveSeed', () => {
  it('no backlog seed: getActiveSeed() returns getDailySeed()', () => {
    _withBacklogSeed(null, () => {
      assertEqual(getActiveSeed(), getDailySeed());
    });
  });

  it('backlog seed set: getActiveSeed() returns the backlog seed', () => {
    _withBacklogSeed(20260505, () => {
      assertEqual(getActiveSeed(), 20260505);
    });
  });

  it('backlog seed is independent of getDailySeed()', () => {
    _withBacklogSeed(20260101, () => {
      assert(getActiveSeed() !== getDailySeed() || getDailySeed() === 20260101,
        'backlog seed should override the daily seed');
    });
  });

  it('after _withBacklogSeed returns, getActiveSeed() is today again', () => {
    _withBacklogSeed(20260505, () => {});
    assertEqual(getActiveSeed(), getDailySeed());
  });
});

// ─── State key isolation across seeds ────────────────────────────────────────

describe('state key isolation', () => {
  it('different seeds produce different state keys', () => {
    let key1, key2;
    _withBacklogSeed(20260505, () => { key1 = getStateKey(); });
    _withBacklogSeed(20260506, () => { key2 = getStateKey(); });
    assert(key1 !== key2, `seed 20260505 key (${key1}) should differ from 20260506 key (${key2})`);
  });

  it('state key for a seed is deterministic across calls', () => {
    let k1, k2;
    _withBacklogSeed(20260510, () => { k1 = getStateKey(); });
    _withBacklogSeed(20260510, () => { k2 = getStateKey(); });
    assertEqual(k1, k2, 'same seed always produces the same state key');
  });

  it('test-seed key is isolated from the daily state key', () => {
    const prev = _ls.getItem('gambdle_use_test_seed');
    _ls.removeItem('gambdle_use_test_seed');
    const dailyKey = getStateKey();
    _ls.setItem('gambdle_use_test_seed', '1');
    const testKey = getStateKey();
    assertEqual(testKey, 'gambdle_test_state');
    assert(dailyKey !== testKey, 'test state key must not match daily state key');
    // restore
    prev ? _ls.setItem('gambdle_use_test_seed', prev) : _ls.removeItem('gambdle_use_test_seed');
  });

  it('saving state under one seed does not affect another seed\'s saved state', () => {
    _withBacklogSeed(20260505, () => {
      _ls.setItem(getStateKey(), JSON.stringify({ chips: 1111 }));
    });
    _withBacklogSeed(20260506, () => {
      const saved = _ls.getItem(getStateKey());
      assert(saved === null || JSON.parse(saved).chips !== 1111,
        "seed 20260506's state should be independent of 20260505's save");
    });
    // cleanup
    _withBacklogSeed(20260505, () => _ls.removeItem(getStateKey()));
  });
});

// ─── Day number arithmetic ────────────────────────────────────────────────────

describe('day number arithmetic', () => {
  it('seed 20260505 is Day 1', () => {
    _withBacklogSeed(20260505, () => assertEqual(getActiveDayNum(), 1));
  });

  it('seed 20260506 is Day 2', () => {
    _withBacklogSeed(20260506, () => assertEqual(getActiveDayNum(), 2));
  });

  it('seed 20260528 (today) is Day 24', () => {
    _withBacklogSeed(20260528, () => assertEqual(getActiveDayNum(), 24));
  });

  it('seed 20260604 is Day 31', () => {
    _withBacklogSeed(20260604, () => assertEqual(getActiveDayNum(), 31));
  });

  it('consecutive seeds increment day number by exactly 1', () => {
    for (let d = 5; d < 29; d++) {
      const seed1 = 20260500 + d;
      const seed2 = 20260500 + d + 1;
      let n1, n2;
      _withBacklogSeed(seed1, () => { n1 = getActiveDayNum(); });
      _withBacklogSeed(seed2, () => { n2 = getActiveDayNum(); });
      assertEqual(n2 - n1, 1, `seeds ${seed1}→${seed2} should be consecutive days`);
    }
  });

  it('day number is always positive for seeds from launch day onward', () => {
    const seeds = [20260505, 20260515, 20260601, 20261231, 20270101];
    for (const s of seeds) {
      const n = _expectedDayNum(s);
      assert(n >= 1, `seed ${s} should be day ≥ 1, got ${n}`);
    }
  });
});

// ─── getRngSeed: seed overrides ────────────────────────────────────────────────

describe('getRngSeed — DAILY_SEED_OVERRIDES', () => {
  it('no override: getRngSeed() returns getActiveSeed()', () => {
    _withBacklogSeed(20260510, () => {
      // Ensure no override exists for this date
      const active = getActiveSeed();
      if (!DAILY_SEED_OVERRIDES[active]) {
        assertEqual(getRngSeed(), active);
      }
    });
  });

  it('with override: getRngSeed() returns the override seed', () => {
    _withBacklogSeed(20260510, () => {
      _withSeedOverride(20260510, 20260601, () => {
        assertEqual(getRngSeed(), 20260601);
      });
    });
  });

  it('override only affects getRngSeed, not getActiveSeed', () => {
    _withBacklogSeed(20260510, () => {
      _withSeedOverride(20260510, 20260601, () => {
        assertEqual(getActiveSeed(), 20260510);
        assertEqual(getRngSeed(), 20260601);
      });
    });
  });
});

// ─── genDeal reproducibility across seeds ────────────────────────────────────

describe('genDeal reproducibility across seeds', () => {
  it('same seed produces identical BJ shoe on two independent runs', () => {
    const a = _genDealForSeed(20260505);
    const b = _genDealForSeed(20260505);
    assertDeepEqual(a.bjShoe.map(c => c.r + c.s), b.bjShoe.map(c => c.r + c.s));
  });

  it('same seed produces identical UTH deck on two independent runs', () => {
    const a = _genDealForSeed(20260505);
    const b = _genDealForSeed(20260505);
    assertDeepEqual(a.uthDeck.map(c => c.r + c.s), b.uthDeck.map(c => c.r + c.s));
  });

  it('different seeds produce different BJ shoes', () => {
    const a = _genDealForSeed(20260505).bjShoe.slice(0, 10).map(c => c.r + c.s).join(',');
    const b = _genDealForSeed(20260506).bjShoe.slice(0, 10).map(c => c.r + c.s).join(',');
    assert(a !== b, 'different seeds must produce different BJ shoes');
  });

  it('different seeds produce different UTH decks', () => {
    const a = _genDealForSeed(20260505).uthDeck.map(c => c.r + c.s).join(',');
    const b = _genDealForSeed(20260506).uthDeck.map(c => c.r + c.s).join(',');
    assert(a !== b, 'different seeds must produce different UTH decks');
  });

  it('a seed override changes the actual card deal', () => {
    // Same calendar date but getRngSeed returns different value depending on override
    const dealNormal   = _genDealForSeed(20260510);
    const dealOverride = _genDealForSeed(20260601); // what the override would produce
    const shoe1 = dealNormal.bjShoe.slice(0, 5).map(c => c.r + c.s).join(',');
    const shoe2 = dealOverride.bjShoe.slice(0, 5).map(c => c.r + c.s).join(',');
    assert(shoe1 !== shoe2, 'an override seed produces a different card deal');
  });
});

// ─── Complex scenario: full seed-switch flow ──────────────────────────────────

describe('complex scenario — seed switch and isolation', () => {
  it('switching seeds gives a different deal, different state key, correct day number', () => {
    const seedA = 20260505;
    const seedB = 20260520;

    let keyA, keyB, dayA, dayB;
    _withBacklogSeed(seedA, () => { keyA = getStateKey(); dayA = getActiveDayNum(); });
    _withBacklogSeed(seedB, () => { keyB = getStateKey(); dayB = getActiveDayNum(); });

    // Keys are isolated
    assert(keyA !== keyB, `state keys must differ: ${keyA} vs ${keyB}`);

    // Day numbers are correct (Day 1 and Day 16)
    assertEqual(dayA, 1, 'seed 20260505 is Day 1');
    assertEqual(dayB, 16, 'seed 20260520 is Day 16');

    // Deals are different
    const dealA = _genDealForSeed(seedA);
    const dealB = _genDealForSeed(seedB);
    const shoeA = dealA.bjShoe.slice(0, 5).map(c => c.r + c.s).join(',');
    const shoeB = dealB.bjShoe.slice(0, 5).map(c => c.r + c.s).join(',');
    assert(shoeA !== shoeB, 'seeds 20260505 and 20260520 must deal different cards');

    // State saved under seedA is invisible to seedB
    _withBacklogSeed(seedA, () => _ls.setItem(getStateKey(), JSON.stringify({ chips: 9999 })));
    let seedBSave;
    _withBacklogSeed(seedB, () => { seedBSave = _ls.getItem(getStateKey()); });
    assert(seedBSave === null || JSON.parse(seedBSave).chips !== 9999,
      'seedB must not see seedA\'s saved chips');

    // Cleanup
    _withBacklogSeed(seedA, () => _ls.removeItem(getStateKey()));
  });
});
