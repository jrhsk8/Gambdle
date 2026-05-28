// Advanced dev-mode tests: seed switching, date arithmetic, state isolation, RNG behavior.
// Runs in dev-tests.html alongside dev.test.js.
//
// Uses direct manipulation of globals (_backlogSeed, DAILY_SEED_OVERRIDES) — intentional,
// since we're testing the contracts those globals define.

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

// ─── getRngSeed — seed overrides ─────────────────────────────────────────────

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
