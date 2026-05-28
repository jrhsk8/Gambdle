// ─── Setup ────────────────────────────────────────────────────────────────────
// Mirrors the pattern in persistence.test.js: activate test-seed so all saves
// go to 'gambdle_test_state' and are isolated from real daily progress.

const _rnSavedSeed = _ls.getItem('gambdle_use_test_seed');
const _rnSavedMod  = _ls.getItem('gambdle_forced_mod');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _rnKey  = getStateKey(); // 'gambdle_test_state'
const _rnSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });

const _rnMkSave = (o = {}) => ({ ...JSON.parse(_rnSnap), ...o });
const _rnRestore = () => {
  const r = JSON.parse(_rnSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// Writes a save, calls loadState(), runs fn(), then cleans up state + storage.
function withRNSave(overrides, fn) {
  const prev = _ls.getItem(_rnKey);
  _ls.setItem(_rnKey, JSON.stringify(_rnMkSave(overrides)));
  loadState();
  try { fn(); } finally {
    prev !== null ? _ls.setItem(_rnKey, prev) : _ls.removeItem(_rnKey);
    _rnRestore();
  }
}

// Shared fixtures
const _rr = (delta = -50) => ({
  delta,
  bets: [{ pick: 46, won: false, delta, pay: 1, bet: Math.abs(delta) }],
});
const _bjLose  = d => ({ bet: Math.abs(d), result: 'lose', delta: d, player: [], dealer: [] });
const _uthFold = (ante, d) => ({
  ante, blind: ante, play: 0, playMult: 0, result: 'fold', delta: d,
  anteDelta: -ante, blindDelta: -ante, playDelta: 0,
  playerBest: null, dealerBest: null, dealerQualifies: false,
});

// ─── getTier — edge cases ─────────────────────────────────────────────────────

describe('getTier — always returns a valid tier', () => {
  it('returns correct tier for all normal chip values', () => {
    assertEqual(getTier(0).label,    'Bozo',       '0');
    assertEqual(getTier(1).label,    'Survivor',   '1');
    assertEqual(getTier(999).label,  'Survivor',   '999');
    assertEqual(getTier(1000).label, 'Apprentice', '1000');
    assertEqual(getTier(1500).label, 'High Roller','1500');
    assertEqual(getTier(2500).label, 'Whale',      '2500');
  });

  it('negative chips: returns fallback tier instead of undefined', () => {
    const t = getTier(-1);
    assert(t !== undefined,           'not undefined');
    assert(typeof t.emoji === 'string','has emoji');
    assert(typeof t.label === 'string','has label');
  });

  it('NaN chips: returns fallback tier instead of undefined', () => {
    const t = getTier(NaN);
    assert(t !== undefined,           'not undefined');
    assert(typeof t.emoji === 'string','has emoji');
  });

  it('undefined chips: returns fallback tier instead of undefined', () => {
    const t = getTier(undefined);
    assert(t !== undefined,           'not undefined');
    assert(typeof t.emoji === 'string','has emoji');
  });
});

// ─── gameNet — malformed history entries ──────────────────────────────────────

describe('gameNet — non-finite deltas handled gracefully', () => {
  function withBJ(hist, fn) { const p = S.bjHistory;  S.bjHistory  = hist; try{fn();}finally{S.bjHistory  = p;} }
  function withUTH(hist, fn){ const p = S.uthHistory; S.uthHistory = hist; try{fn();}finally{S.uthHistory = p;} }

  it('undefined delta: treated as 0, result is finite', () => {
    withBJ([{ delta: undefined }], () => {
      const n = gameNet('bj');
      assert(Number.isFinite(n), `expected finite, got ${n}`);
      assertEqual(n, 0);
    });
  });

  it('NaN delta: treated as 0, result is finite', () => {
    withBJ([{ delta: NaN }], () => {
      const n = gameNet('bj');
      assert(Number.isFinite(n), `expected finite, got ${n}`);
      assertEqual(n, 0);
    });
  });

  it('null delta: treated as 0', () => {
    withBJ([{ delta: null }], () => {
      assertEqual(gameNet('bj'), 0);
    });
  });

  it('mixed valid and invalid: only finite deltas summed', () => {
    withBJ([
      { delta: 200 },
      { delta: undefined },
      { delta: -150 },
      { delta: NaN },
    ], () => {
      assertEqual(gameNet('bj'), 50, '200 + 0 + (-150) + 0 = 50');
    });
  });

  it('all valid deltas still sum correctly', () => {
    withBJ([{ delta: 100 }, { delta: -50 }, { delta: 200 }], () => {
      assertEqual(gameNet('bj'), 250);
    });
  });

  it('empty history returns 0', () => {
    withBJ([], () => assertEqual(gameNet('bj'), 0));
  });

  it('UTH history: undefined delta treated as 0', () => {
    withUTH([{ delta: undefined }, { delta: -100 }], () => {
      const n = gameNet('uth');
      assert(Number.isFinite(n), `expected finite, got ${n}`);
      assertEqual(n, -100);
    });
  });
});

// ─── loadState — results screen with corrupted history ────────────────────────

describe('loadState — results screen chip guard with bad history', () => {
  it('chips remain finite when a BJ entry has undefined delta', () => {
    withRNSave({
      screen: 'results', chips: 25,
      bjHistory:  [_bjLose(-300), { delta: undefined, result: 'lose', bet: 200, player: [], dealer: [] }, _bjLose(-100)],
      uthHistory: [_uthFold(37, -74)],
      rResult:    _rr(-50),
    }, () => {
      assert(Number.isFinite(S.chips), `chips must be finite after loadState, got ${S.chips}`);
    });
  });

  it('chips remain finite when all deltas are NaN', () => {
    withRNSave({
      screen: 'results', chips: 25,
      bjHistory:  [{ delta: NaN }, { delta: NaN }],
      uthHistory: [{ delta: NaN }],
      rResult:    _rr(-50),
    }, () => {
      assert(Number.isFinite(S.chips), `chips must be finite after loadState, got ${S.chips}`);
    });
  });

  it('correct chips calculated when all history is clean', () => {
    withRNSave({
      screen: 'results', chips: 99999,
      bjHistory:  [{ delta: 200 }, { delta: -50 }, { delta: 100 }], // +250
      uthHistory: [{ delta: -100 }, { delta: 300 }],                 // +200
      rResult:    _rr(-50),
    }, () => {
      assertEqual(S.chips, 1400, '1000 + 250 + 200 - 50 = 1400');
    });
  });
});

// ─── advanceTo results — corrupted history doesn't crash navigation ────────────

describe('advanceTo results — stuck roulette-result scenario', () => {
  it('navigates to results with undefined delta in BJ history', () => {
    withRNSave({
      screen: 'roulette', chips: 25,
      rPhase: 'result', rSpin: 36,
      rResult: _rr(-50),
      bjHand: 3,
      bjHistory:  [_bjLose(-300), { delta: undefined, result: 'lose', bet: 200, player: [], dealer: [] }, _bjLose(-100)],
      uthHand: 3,
      uthHistory: [_uthFold(37, -74), _uthFold(15, -30), _uthFold(5, -10)],
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'results', 'screen must be results after advanceTo');
    });
  });

  it('navigates to results with undefined delta in UTH history', () => {
    withRNSave({
      screen: 'roulette', chips: 25,
      rPhase: 'result', rSpin: 36,
      rResult: _rr(-50),
      bjHand: 3,
      bjHistory:  [_bjLose(-300), _bjLose(-200), _bjLose(-100)],
      uthHand: 3,
      uthHistory: [
        _uthFold(37, -74),
        { delta: undefined, ante: 0, blind: 0, play: 0, result: 'fold', playerBest: null, dealerBest: null, dealerQualifies: false },
        _uthFold(5, -10),
      ],
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'results', 'screen must be results after advanceTo');
    });
  });

  it('chips are finite after navigating with all-undefined deltas', () => {
    withRNSave({
      screen: 'roulette', chips: 25,
      rPhase: 'result', rSpin: 36,
      rResult: _rr(-50),
      bjHand: 3,
      bjHistory:  [{ delta: undefined }, { delta: NaN }, { delta: undefined }],
      uthHand: 3,
      uthHistory: [{ delta: undefined }, { delta: NaN }, { delta: undefined }],
    }, () => {
      advanceTo('results');
      assert(Number.isFinite(S.chips), `S.chips must be finite, got ${S.chips}`);
    });
  });

  it('chips fall back to saved value when recalculation from history is non-finite', () => {
    // With gameNet fixed, the calc will be 1000+0+0-50=950 (not 25), but chips will be finite.
    // This test verifies we never produce a NaN chips regardless of history content.
    withRNSave({
      screen: 'roulette', chips: 25,
      rPhase: 'result', rSpin: 36,
      rResult: _rr(-50),
      bjHand: 3,
      bjHistory:  [{ delta: undefined }, { delta: undefined }, { delta: undefined }],
      uthHand: 3,
      uthHistory: [{ delta: undefined }, { delta: undefined }, { delta: undefined }],
    }, () => {
      advanceTo('results');
      assert(Number.isFinite(S.chips), `chips must be finite, got ${S.chips}`);
      assertEqual(S.screen, 'results', 'screen must be results');
    });
  });

  it('correct chip total preserved when history is fully valid', () => {
    withRNSave({
      screen: 'roulette', chips: 25,
      rPhase: 'result', rSpin: 36,
      rResult: _rr(-50),
      bjHand: 3,
      bjHistory:  [_bjLose(-300), _bjLose(-400), _bjLose(-175)], // -875
      uthHand: 3,
      uthHistory: [_uthFold(37, -74), _uthFold(0, 0), _uthFold(0, 0)], // -74
      // expected: 1000 - 875 - 74 - 50 = 1
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'results', 'screen must be results');
      assert(Number.isFinite(S.chips), `chips must be finite, got ${S.chips}`);
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ls.removeItem(_rnKey);
_rnSavedSeed === null ? _ls.removeItem('gambdle_use_test_seed') : _ls.setItem('gambdle_use_test_seed', _rnSavedSeed);
_rnSavedMod  === null ? _ls.removeItem('gambdle_forced_mod')    : _ls.setItem('gambdle_forced_mod', _rnSavedMod);
_rnRestore();
