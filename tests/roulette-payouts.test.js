// Tests _evalBets payout amounts (not just win/loss).
// Neutralize daily modifier unless testing modifier effects.

function _bet(pick, amount) { return { pick, bet: amount }; }

// ─── Base payouts (no modifier) ───────────────────────────────────────────────

describe('_evalBets — straight-up payout', () => {
  it('straight-up win pays 35:1 (delta = bet×35)', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(17, 10)], 17);
    assertEqual(r.delta, 350);
    assertEqual(r.won, true);
    S.forcedMod = null;
  });

  it('straight-up loss deducts stake (delta = -bet)', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(17, 10)], 18);
    assertEqual(r.delta, -10);
    assertEqual(r.won, false);
    S.forcedMod = null;
  });

  it('zero (idx 0) wins on spin 0: pays 35:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(0, 50)], 0);
    assertEqual(r.delta, 1750);
    assertEqual(r.won, true);
    S.forcedMod = null;
  });

  it('zero bet loses on non-zero spin', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(0, 50)], 7);
    assertEqual(r.delta, -50);
    S.forcedMod = null;
  });
});

describe('_evalBets — column and dozen payout (2:1)', () => {
  it('winning column pays 2:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(37, 20)], 36); // top col wins on 36
    assertEqual(r.delta, 40); // 20 × 2
    S.forcedMod = null;
  });

  it('losing column deducts stake', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(37, 20)], 1);
    assertEqual(r.delta, -20);
    S.forcedMod = null;
  });

  it('winning dozen pays 2:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(40, 30)], 6); // 1st dozen
    assertEqual(r.delta, 60);
    S.forcedMod = null;
  });
});

describe('_evalBets — outside bets payout (1:1)', () => {
  it('Red win pays 1:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(45, 25)], 1); // 1 is red
    assertEqual(r.delta, 25);
    S.forcedMod = null;
  });

  it('Even win pays 1:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(44, 25)], 4);
    assertEqual(r.delta, 25);
    S.forcedMod = null;
  });

  it('Low (1-18) win pays 1:1', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(43, 25)], 12);
    assertEqual(r.delta, 25);
    S.forcedMod = null;
  });

  it('outside bet on zero: delta = -bet', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(45, 25)], 0); // red loses on 0
    assertEqual(r.delta, -25);
    S.forcedMod = null;
  });
});

describe('_evalBets — multiple bets in one call', () => {
  it('one win one loss: correct individual deltas', () => {
    S.forcedMod = {};
    // 17 is black (not in REDS set), so Red (idx 45) loses on spin 17
    const results = _evalBets([_bet(17, 10), _bet(45, 20)], 17);
    assertEqual(results[0].delta,  350); // straight-up win
    assertEqual(results[1].delta, -20);  // red loses on 17 (17 is black)
    S.forcedMod = null;
  });

  it('two winning bets: correct totals', () => {
    S.forcedMod = {};
    const results = _evalBets([_bet(1, 10), _bet(45, 10)], 1); // #1 wins, Red wins (1 is red)
    assertEqual(results[0].delta, 350); // straight-up
    assertEqual(results[1].delta,  10); // red 1:1
    S.forcedMod = null;
  });
});

// ─── r_payout_mult modifier ───────────────────────────────────────────────────

describe('_evalBets — r_payout_mult modifier', () => {
  it('multiplies straight-up payout by modifier value', () => {
    S.forcedMod = 'r_double_all'; // r_payout_mult=2
    const [r] = _evalBets([_bet(17, 10)], 17);
    assertEqual(r.delta, 700); // 10 × 35 × 2
    S.forcedMod = null;
  });

  it('multiplies outside bet payout', () => {
    S.forcedMod = 'r_double_all';
    const [r] = _evalBets([_bet(45, 10)], 1); // red wins
    assertEqual(r.delta, 20); // 10 × 1 × 2
    S.forcedMod = null;
  });

  it('does not affect losing bets', () => {
    S.forcedMod = 'r_double_all';
    const [r] = _evalBets([_bet(17, 10)], 18);
    assertEqual(r.delta, -10);
    S.forcedMod = null;
  });
});

// ─── r_number_pay modifier ────────────────────────────────────────────────────

describe('_evalBets — r_number_pay modifier (hot numbers)', () => {
  it('straight-up win uses r_number_pay instead of 35', () => {
    S.forcedMod = 'r_hot_numbers'; // r_number_pay=50
    const [r] = _evalBets([_bet(7, 10)], 7);
    assertEqual(r.delta, 500); // 10 × 50
    S.forcedMod = null;
  });

  it('outside bet win uses normal 1:1 (r_number_pay does not apply)', () => {
    S.forcedMod = 'r_hot_numbers';
    const [r] = _evalBets([_bet(45, 10)], 1); // red
    assertEqual(r.delta, 10); // 10 × 1 (unchanged)
    S.forcedMod = null;
  });

  it('column/dozen win uses normal 2:1 (r_number_pay does not apply)', () => {
    S.forcedMod = 'r_hot_numbers';
    const [r] = _evalBets([_bet(40, 10)], 6); // 1st dozen
    assertEqual(r.delta, 20); // 10 × 2 (unchanged)
    S.forcedMod = null;
  });
});

// ─── r_color_double modifier ──────────────────────────────────────────────────

describe('_evalBets — r_color_double modifier', () => {
  it('Red win pays 2:1 with r_color_double', () => {
    S.forcedMod = 'r_color_double';
    const [r] = _evalBets([_bet(45, 10)], 1); // red wins on 1
    assertEqual(r.delta, 20); // 10 × 1 × 2
    S.forcedMod = null;
  });

  it('Black win pays 2:1 with r_color_double', () => {
    S.forcedMod = 'r_color_double';
    const [r] = _evalBets([_bet(46, 10)], 2); // 2 is black
    assertEqual(r.delta, 20);
    S.forcedMod = null;
  });

  it('straight-up win unaffected by r_color_double', () => {
    S.forcedMod = 'r_color_double';
    const [r] = _evalBets([_bet(7, 10)], 7);
    assertEqual(r.delta, 350); // still 35:1
    S.forcedMod = null;
  });

  it('color loss still deducts stake', () => {
    S.forcedMod = 'r_color_double';
    const [r] = _evalBets([_bet(45, 10)], 2); // red loses on 2 (black)
    assertEqual(r.delta, -10);
    S.forcedMod = null;
  });
});

// ─── enriched result fields ───────────────────────────────────────────────────

describe('_evalBets — result fields', () => {
  it('result has won, delta, pay, pick, bet fields', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(17, 10)], 17);
    assert('won'   in r, 'won field');
    assert('delta' in r, 'delta field');
    assert('pay'   in r, 'pay field');
    assert('pick'  in r, 'pick field');
    assert('bet'   in r, 'bet field');
    S.forcedMod = null;
  });

  it('pay reflects actual multiplier used', () => {
    S.forcedMod = {};
    const [r] = _evalBets([_bet(17, 10)], 17);
    assertEqual(r.pay, 35);
    S.forcedMod = null;
  });

  it('pay with r_payout_mult reflects boosted multiplier', () => {
    S.forcedMod = 'r_double_all';
    const [r] = _evalBets([_bet(17, 10)], 17);
    assertEqual(r.pay, 70); // 35 × 2
    S.forcedMod = null;
  });
});
