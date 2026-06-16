// ─── Borrow-chips feature tests ───────────────────────────────────────────────
// Verifies that the daily borrow option surfaces correctly when a player goes
// bust mid-run, that borrowing/declining work, and that the debt is applied to
// the next day's starting stack.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _brwSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _brwSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _brwRestore = () => {
  const r = JSON.parse(_brwSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
  _ls.removeItem('gambdle_borrow_debt');
};

function withBrwState(overrides, fn) {
  Object.assign(S, overrides);
  try { fn(); } finally { _brwRestore(); }
}

// ─── _canShowBorrow ───────────────────────────────────────────────────────────

describe('_canShowBorrow — eligibility checks', () => {
  it('true when borrowUsed=false and rResult=null', () => {
    withBrwState({ borrowUsed: false, rResult: null }, () => {
      assert(_canShowBorrow(), 'should be eligible before any borrow');
    });
  });

  it('false when borrowUsed=true', () => {
    withBrwState({ borrowUsed: true, rResult: null }, () => {
      assert(!_canShowBorrow(), 'should not be eligible after borrow used');
    });
  });

  it('false when rResult is set (roulette already done)', () => {
    withBrwState({ borrowUsed: false, rResult: { delta: -100 } }, () => {
      assert(!_canShowBorrow(), 'should not be eligible after roulette is complete');
    });
  });
});

// ─── advanceTo — bust intercept ───────────────────────────────────────────────

describe('advanceTo — redirects to borrow screen when eligible', () => {
  it('bust going to results mid-BJ → borrow screen, return = bj (hand < 3)', () => {
    withBrwState({
      screen: 'bj', chips: 0, borrowUsed: false, rResult: null,
      bjHand: 1, bjPhase: 'result', bjBet: 0,
      bjHistory: [{ bet:100, result:'lose', delta:-100, player:[], dealer:[] }],
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'borrow', 'should land on borrow screen');
      assertEqual(S.borrowReturnScreen, 'bj', 'return screen should be bj');
      assertEqual(S.bjPhase, 'bet', 'bjPhase should be reset to bet');
    });
  });

  it('bust going to results after all 3 BJ hands → borrow screen, return = GAME2', () => {
    withBrwState({
      screen: 'bj', chips: 0, borrowUsed: false, rResult: null,
      bjHand: 3, bjPhase: 'result', bjBet: 0,
      bjHistory: [
        { bet:400, result:'lose', delta:-400, player:[], dealer:[] },
        { bet:400, result:'lose', delta:-400, player:[], dealer:[] },
        { bet:200, result:'lose', delta:-200, player:[], dealer:[] },
      ],
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'borrow', 'should land on borrow screen');
      // After all BJ hands, return screen should be the next game (uth by default)
      assertEqual(S.borrowReturnScreen, NEXT_SCREEN['bj'], 'return screen should be GAME2');
    });
  });

  it('bust transitioning from BJ to UTH → borrow screen, return = uth', () => {
    withBrwState({
      screen: 'bj', chips: 0, borrowUsed: false, rResult: null,
      bjHand: 3, bjPhase: 'result',
    }, () => {
      advanceTo('uth');
      assertEqual(S.screen, 'borrow', 'should land on borrow screen');
      assertEqual(S.borrowReturnScreen, 'uth', 'return screen should be uth');
    });
  });

  it('bust going to roulette from UTH → borrow screen, return = roulette', () => {
    withBrwState({
      screen: 'uth', chips: 0, borrowUsed: false, rResult: null,
      uthHand: 3, uthPhase: 'result',
    }, () => {
      advanceTo('roulette');
      assertEqual(S.screen, 'borrow', 'should land on borrow screen');
      assertEqual(S.borrowReturnScreen, 'roulette', 'return screen should be roulette');
    });
  });

  it('bust with borrowUsed=true → results, no borrow screen', () => {
    withBrwState({
      screen: 'bj', chips: 0, borrowUsed: true, rResult: null,
      bjHand: 1, bjPhase: 'result', bjBet: 0,
      bjHistory: [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }],
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'results', 'should go directly to results when already used');
    });
  });

  it('bust after roulette (rResult set) → results, no borrow screen', () => {
    withBrwState({
      screen: 'roulette', chips: 0, borrowUsed: false,
      rResult: { delta: -200 }, rPhase: 'result',
    }, () => {
      advanceTo('results');
      assertEqual(S.screen, 'results', 'should not intercept after roulette is done');
    });
  });
});

// ─── borrowChips ─────────────────────────────────────────────────────────────

describe('borrowChips — takes the loan', () => {
  it('sets chips to _effectiveBorrowAmount()', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth' }, () => {
      const expected = _effectiveBorrowAmount();
      borrowChips();
      assertEqual(S.chips, expected, 'chips should equal effective borrow amount');
    });
  });

  it('sets borrowUsed = true', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth' }, () => {
      borrowChips();
      assert(S.borrowUsed, 'borrowUsed should be true');
    });
  });

  it('writes debt to localStorage as JSON with amount and targetSeed', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth' }, () => {
      borrowChips();
      const raw = _ls.getItem('gambdle_borrow_debt');
      assert(!!raw, 'debt should be written to localStorage');
      const debt = JSON.parse(raw);
      assertEqual(debt.amount, _effectiveBorrowAmount(), 'debt.amount should equal effective borrow amount');
      assert(typeof debt.targetSeed === 'number', 'debt.targetSeed should be a number');
    });
  });

  it('navigates to borrowReturnScreen', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      uthHand: 0, uthPhase: 'bet', uthAnte: 0, uthHistory: [],
      uthHole: [], uthDealer: [], uthComm: [],
    }, () => {
      borrowChips();
      assertEqual(S.screen, 'uth', 'should navigate to uth');
      assertEqual(S.borrowReturnScreen, null, 'borrowReturnScreen should be cleared');
    });
  });

  it('falls back to GAME1 when borrowReturnScreen is null', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: null,
      bjHand: 0, bjPhase: 'bet', bjBet: 0, bjHistory: [],
      bjPlayer: [], bjDealer: [],
    }, () => {
      borrowChips();
      assertEqual(S.screen, GAME1, 'should fall back to GAME1');
    });
  });
});

// ─── declineBorrow ────────────────────────────────────────────────────────────

describe('declineBorrow — accepts defeat', () => {
  it('sets borrowUsed = true', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      bjHistory: [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }],
      uthHistory: [], rResult: null,
    }, () => {
      declineBorrow();
      assert(S.borrowUsed, 'borrowUsed should be true after decline');
    });
  });

  it('navigates to results screen', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      bjHistory: [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }],
      uthHistory: [], rResult: null,
    }, () => {
      declineBorrow();
      assertEqual(S.screen, 'results', 'should navigate to results');
    });
  });

  it('clears borrowReturnScreen', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      bjHistory: [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }],
      uthHistory: [], rResult: null,
    }, () => {
      declineBorrow();
      assertEqual(S.borrowReturnScreen, null, 'borrowReturnScreen should be cleared');
    });
  });

  it('prevents borrow screen from showing again after decline', () => {
    withBrwState({ chips: 0, screen: 'results', borrowUsed: true, rResult: null }, () => {
      // After decline, borrowUsed=true → _canShowBorrow() is false → no intercept
      assert(!_canShowBorrow(), '_canShowBorrow should be false after decline');
    });
  });
});

// ─── Debt application in loadState ───────────────────────────────────────────

describe('loadState — applies borrow debt only on the exact target day', () => {
  it('does not consume debt when test seed is active (guard)', () => {
    // Test seed IS active throughout this file. Debt should never apply in test mode.
    _ls.setItem('gambdle_borrow_debt', JSON.stringify({ amount: BORROW_AMOUNT, targetSeed: getDailySeed() }));
    _ls.removeItem(getStateKey());
    S.chips = START_CHIPS;
    loadState();
    assert(S.chips === START_CHIPS, 'debt must not apply when test seed is active');
    _ls.removeItem('gambdle_borrow_debt');
    _brwRestore();
  });

  it('clears an expired debt (target day in the past) without applying it', () => {
    // Simulate a debt whose targetSeed is yesterday (always < today).
    const yesterdaySeed = getDailySeed() - 1; // crude but sufficient for this check
    _ls.setItem('gambdle_borrow_debt', JSON.stringify({ amount: BORROW_AMOUNT, targetSeed: yesterdaySeed }));
    // Temporarily disable test seed to exercise the real path
    _ls.removeItem('gambdle_use_test_seed');
    _ls.removeItem(getStateKey());
    S.chips = START_CHIPS;
    try {
      loadState();
      // Debt expired — chips should be unaffected and debt cleared
      assertEqual(S.chips, START_CHIPS, 'expired debt should not deduct chips');
      assert(!_ls.getItem('gambdle_borrow_debt'), 'expired debt should be removed from localStorage');
    } finally {
      _ls.setItem('gambdle_use_test_seed', '1');
      _ls.removeItem('gambdle_borrow_debt');
      _brwRestore();
    }
  });

  it('applies debt when targetSeed matches today', () => {
    const todaySeed = getDailySeed();
    _ls.setItem('gambdle_borrow_debt', JSON.stringify({ amount: BORROW_AMOUNT, targetSeed: todaySeed }));
    _ls.removeItem('gambdle_use_test_seed');
    _ls.removeItem(getStateKey());
    S.chips = START_CHIPS;
    try {
      loadState();
      assertEqual(S.chips, START_CHIPS - BORROW_AMOUNT, 'debt targeting today should deduct chips');
      assert(!_ls.getItem('gambdle_borrow_debt'), 'consumed debt should be cleared');
    } finally {
      _ls.setItem('gambdle_use_test_seed', '1');
      _ls.removeItem('gambdle_borrow_debt');
      _brwRestore();
    }
  });

  it('leaves a future debt untouched (target day not yet reached)', () => {
    const futureSeed = getDailySeed() + 1;
    _ls.setItem('gambdle_borrow_debt', JSON.stringify({ amount: BORROW_AMOUNT, targetSeed: futureSeed }));
    _ls.removeItem('gambdle_use_test_seed');
    _ls.removeItem(getStateKey());
    S.chips = START_CHIPS;
    try {
      loadState();
      assertEqual(S.chips, START_CHIPS, 'future debt should not yet deduct chips');
      assert(!!_ls.getItem('gambdle_borrow_debt'), 'future debt should remain in localStorage');
    } finally {
      _ls.setItem('gambdle_use_test_seed', '1');
      _ls.removeItem('gambdle_borrow_debt');
      _brwRestore();
    }
  });
});

// ─── _effectiveBorrowAmount — respects min_chips modifier ────────────────────

describe('_effectiveBorrowAmount — min_chips floor', () => {
  it('returns BORROW_AMOUNT when no min_chips modifier', () => {
    withBrwState({ forcedMod: null }, () => {
      assertEqual(_effectiveBorrowAmount(), BORROW_AMOUNT, 'should equal BORROW_AMOUNT with no modifier');
    });
  });

  it('returns min_chips when min_chips > BORROW_AMOUNT', () => {
    withBrwState({ forcedMod: 'high_roller' }, () => {
      const minC = getMod('min_chips') || 0;
      if (minC > BORROW_AMOUNT) {
        assertEqual(_effectiveBorrowAmount(), minC, 'should equal min_chips when modifier is active and higher');
      } else {
        // modifier exists but min_chips <= BORROW_AMOUNT — still passes
        assert(_effectiveBorrowAmount() >= BORROW_AMOUNT, 'should be at least BORROW_AMOUNT');
      }
    });
  });

  it('never returns less than BORROW_AMOUNT', () => {
    withBrwState({}, () => {
      assert(_effectiveBorrowAmount() >= BORROW_AMOUNT, 'effective amount should never be below BORROW_AMOUNT');
    });
  });
});

// ─── borrowChips stores borrowAmount ─────────────────────────────────────────

describe('borrowChips — stores actual borrowed amount in state', () => {
  it('sets S.borrowAmount to _effectiveBorrowAmount()', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      uthHand: 0, uthPhase: 'bet', uthAnte: 0, uthHistory: [],
      uthHole: [], uthDealer: [], uthComm: [],
    }, () => {
      const expected = _effectiveBorrowAmount();
      borrowChips();
      assertEqual(S.borrowAmount, expected, 'borrowAmount should match effective borrow amount');
    });
  });

  it('debt in localStorage has correct amount and targets the next day seed', () => {
    withBrwState({ chips: 0, screen: 'borrow', borrowUsed: false, borrowReturnScreen: 'uth',
      uthHand: 0, uthPhase: 'bet', uthAnte: 0, uthHistory: [],
      uthHole: [], uthDealer: [], uthComm: [],
    }, () => {
      borrowChips();
      const raw = _ls.getItem('gambdle_borrow_debt');
      assert(!!raw, 'debt entry should exist in localStorage');
      const debt = JSON.parse(raw);
      assertEqual(debt.amount, S.borrowAmount, 'debt.amount should match S.borrowAmount');
      assert(debt.targetSeed > getDailySeed(), 'debt.targetSeed should be tomorrow or later');
    });
  });
});

// ─── Results recalculation with borrow ───────────────────────────────────────

describe('advanceTo(results) — recalculates chips including borrow', () => {
  it('adds borrowAmount to recalc when borrowUsed=true', () => {
    // Player started with 1000, lost 1000 in BJ, borrowed 50, won 100 in UTH, +200 in roulette.
    const bjH = [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }];
    const uthH = [
      { ante:25, blind:25, play:0, playMult:0, result:'win', delta:100, anteDelta:25, blindDelta:25, playDelta:50, playerBest:null, dealerBest:null, dealerQualifies:true },
      { ante:0, blind:0, play:0, playMult:0, result:'skip', delta:0 },
      { ante:0, blind:0, play:0, playMult:0, result:'skip', delta:0 },
    ];
    withBrwState({
      screen: 'roulette', chips: 200,
      borrowUsed: true, borrowAmount: BORROW_AMOUNT,
      rResult: { delta: 200 }, rPhase: 'result',
      bjHistory: bjH, uthHistory: uthH, bjHand: 1, uthHand: 3,
    }, () => {
      advanceTo('results');
      // Expected: 1000 (start) + 50 (borrowed) + (-1000) (bj) + 100 (uth) + 200 (roulette) = 350
      const expected = START_CHIPS + BORROW_AMOUNT + (-1000) + 100 + 200;
      assertEqual(S.chips, expected, 'chips should include borrowAmount in recalculation');
    });
  });

  it('declined borrow (borrowUsed=true, borrowAmount=0) adds NO phantom 50', () => {
    // Regression: declineBorrow sets borrowUsed=true (to gate the re-prompt + the ladder detour)
    // but takes no loan, so borrowAmount stays 0. recalc must add 0 — not fall back to BORROW_AMOUNT.
    // The bug credited a free 50 the Transcript never records, so the server replay (0) disagreed
    // with the client (50). A busted player who accepts defeat scores their real total.
    const bjH = [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }];
    withBrwState({
      screen: 'roulette', chips: 0,
      borrowUsed: true, borrowAmount: 0,
      rResult: { delta: 0 }, rPhase: 'result',
      bjHistory: bjH, uthHistory: [], bjHand: 1, uthHand: 0,
    }, () => {
      advanceTo('results');
      // Fix: 1000 + 0 (no loan) − 1000 = 0. The bug would yield 1000 + 50 − 1000 = 50.
      assertEqual(S.chips, 0, 'declined borrow must not add a phantom 50');
    });
  });

  it('uses S.borrowAmount not BORROW_AMOUNT (handles modifier-inflated borrow)', () => {
    const bjH = [{ bet:1000, result:'lose', delta:-1000, player:[], dealer:[] }];
    const customBorrowAmt = 150; // simulates min_chips=150 modifier
    withBrwState({
      screen: 'roulette', chips: 200,
      borrowUsed: true, borrowAmount: customBorrowAmt,
      rResult: { delta: 200 }, rPhase: 'result',
      bjHistory: bjH, uthHistory: [], bjHand: 1, uthHand: 0,
    }, () => {
      advanceTo('results');
      const expected = START_CHIPS + customBorrowAmt + (-1000) + 0 + 200;
      assertEqual(S.chips, expected, 'recalc should use S.borrowAmount not the constant');
    });
  });

  it('does not add any borrow when borrowUsed=false', () => {
    const bjH = [{ bet:100, result:'win', delta:100, player:[], dealer:[] }];
    withBrwState({
      screen: 'roulette', chips: 1100,
      borrowUsed: false, borrowAmount: 0,
      rResult: { delta: 0 }, rPhase: 'result',
      bjHistory: bjH, uthHistory: [], bjHand: 1, uthHand: 0,
    }, () => {
      advanceTo('results');
      const expected = START_CHIPS + 100 + 0 + 0;
      assertEqual(S.chips, expected, 'chips should not include any borrow when not borrowed');
    });
  });

  it('clamps a sub-zero recalc to 0 (corrupted save can never show a negative score)', () => {
    // Simulates a corrupted/edited save whose history deltas sum far below -(START_CHIPS): the
    // recalc would be deeply negative, but a chip balance can never be < 0, so it must clamp to 0.
    const bjH = [{ bet:1000, result:'lose', delta:-51000, player:[], dealer:[] }];
    withBrwState({
      screen: 'roulette', chips: 0,
      borrowUsed: false, borrowAmount: 0,
      rResult: { delta: 0 }, rPhase: 'result',
      bjHistory: bjH, uthHistory: [], bjHand: 1, uthHand: 0,
    }, () => {
      advanceTo('results');
      assertEqual(S.chips, 0, 'negative recalc should clamp to 0, not display -50,000');
    });
  });
});

// ─── screenBorrow renders ─────────────────────────────────────────────────────

describe('screenBorrow — renders without throwing', () => {
  it('renders the borrow screen without error', () => {
    withBrwState({
      screen: 'borrow', chips: 0, borrowUsed: false,
      borrowReturnScreen: 'uth',
    }, () => {
      let err = null;
      try { render(); } catch(e) { err = e; }
      assert(!err, 'screenBorrow should render without throwing: ' + err);
    });
  });

  it('renders correctly when borrowReturnScreen is null', () => {
    withBrwState({
      screen: 'borrow', chips: 0, borrowUsed: false,
      borrowReturnScreen: null,
    }, () => {
      let err = null;
      try { render(); } catch(e) { err = e; }
      assert(!err, 'screenBorrow renders even with null borrowReturnScreen');
    });
  });
});

// ─── screenIntro — reflects debt-adjusted starting chips ─────────────────────

describe('screenIntro — shows S.chips not START_CHIPS', () => {
  it('shows reduced chips when debt has been applied (e.g. 950)', () => {
    withBrwState({ chips: START_CHIPS - BORROW_AMOUNT, screen: 'intro' }, () => {
      const html = screenIntro();
      assert(html.includes(fmt(START_CHIPS - BORROW_AMOUNT)), 'intro should show debt-adjusted chip count');
      assert(!html.includes(`>${fmt(START_CHIPS)} chips<`), 'intro should not show full START_CHIPS when debt applied');
    });
  });

  it('shows START_CHIPS when no debt', () => {
    withBrwState({ chips: START_CHIPS, screen: 'intro' }, () => {
      const html = screenIntro();
      assert(html.includes(fmt(START_CHIPS)), 'intro should show START_CHIPS when no debt');
    });
  });

  it('shows correct amount for modifier-inflated borrow (e.g. 850 after 150 borrowed)', () => {
    const customBorrow = 150;
    withBrwState({ chips: START_CHIPS - customBorrow, screen: 'intro' }, () => {
      const html = screenIntro();
      assert(html.includes(fmt(START_CHIPS - customBorrow)), 'intro should show modifier-inflated debt-adjusted chips');
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_brwSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _brwSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_ls.removeItem('gambdle_borrow_debt');
_brwRestore();
