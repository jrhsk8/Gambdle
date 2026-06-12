// Bet index reference (from R_BETS in roulette.js):
//   0-36  straight-up numbers
//   37    column top  (3,6,...,36)
//   38    column mid  (2,5,...,35)
//   39    column bot  (1,4,...,34)
//   40    1st dozen   (1-12)
//   41    2nd dozen   (13-24)
//   42    3rd dozen   (25-36)
//   43    1-18
//   44    Even
//   45    Red
//   46    Black
//   47    Odd
//   48    19-36

// ─── evalBet ─────────────────────────────────────────────────────────────────

describe('evalBet — straight-up numbers', () => {
  it('wins when spin matches the bet number', () => {
    for (let n = 0; n <= 36; n++) {
      assert(evalBet(n, n), `bet ${n} wins on spin ${n}`);
    }
  });

  it('loses when spin does not match', () => {
    assert(!evalBet(17, 18), 'bet 17 loses on spin 18');
    assert(!evalBet(0, 1), 'bet 0 loses on spin 1');
    assert(!evalBet(36, 0), 'bet 36 loses on spin 0');
  });
});

describe('evalBet — zero kills outside bets', () => {
  const outsideBets = [37,38,39,40,41,42,43,44,45,46,47,48];
  it('all outside bets lose on zero', () => {
    for (const idx of outsideBets) {
      assert(!evalBet(idx, 0), `bet idx ${idx} should lose on 0`);
    }
  });
});

describe('evalBet — Red (45) and Black (46)', () => {
  // Standard European red numbers
  const REDS_KNOWN = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  it('Red wins on known red numbers', () => {
    for (const n of REDS_KNOWN) assert(evalBet(45, n), `red wins on ${n}`);
  });

  it('Black wins on non-red, non-zero numbers', () => {
    for (let n = 1; n <= 36; n++) {
      if (!REDS_KNOWN.has(n)) assert(evalBet(46, n), `black wins on ${n}`);
    }
  });

  it('Red loses on black numbers', () => {
    for (let n = 1; n <= 36; n++) {
      if (!REDS_KNOWN.has(n)) assert(!evalBet(45, n), `red loses on ${n}`);
    }
  });

  it('Black loses on red numbers', () => {
    for (const n of REDS_KNOWN) assert(!evalBet(46, n), `black loses on ${n}`);
  });

  it('no number is both red and black', () => {
    for (let n = 1; n <= 36; n++) {
      const r = evalBet(45, n), b = evalBet(46, n);
      assert(r !== b, `${n} must be either red or black, not both/neither`);
    }
  });
});

describe('evalBet — Even (44) and Odd (47)', () => {
  it('Even wins on even numbers', () => {
    for (let n = 2; n <= 36; n += 2) assert(evalBet(44, n), `even wins on ${n}`);
  });

  it('Odd wins on odd numbers', () => {
    for (let n = 1; n <= 35; n += 2) assert(evalBet(47, n), `odd wins on ${n}`);
  });

  it('Even loses on odd numbers', () => {
    for (let n = 1; n <= 35; n += 2) assert(!evalBet(44, n), `even loses on ${n}`);
  });

  it('Odd loses on even numbers', () => {
    for (let n = 2; n <= 36; n += 2) assert(!evalBet(47, n), `odd loses on ${n}`);
  });
});

describe('evalBet — Low/High (43/48)', () => {
  it('1-18 wins on 1 through 18', () => {
    for (let n = 1; n <= 18; n++) assert(evalBet(43, n), `low wins on ${n}`);
  });

  it('19-36 wins on 19 through 36', () => {
    for (let n = 19; n <= 36; n++) assert(evalBet(48, n), `high wins on ${n}`);
  });

  it('1-18 loses on 19-36', () => {
    for (let n = 19; n <= 36; n++) assert(!evalBet(43, n), `low loses on ${n}`);
  });

  it('19-36 loses on 1-18', () => {
    for (let n = 1; n <= 18; n++) assert(!evalBet(48, n), `high loses on ${n}`);
  });
});

describe('evalBet — Dozens (40/41/42)', () => {
  it('1st dozen (40) wins on 1-12', () => {
    for (let n = 1; n <= 12; n++) assert(evalBet(40, n), `1st dozen wins on ${n}`);
  });

  it('1st dozen loses outside 1-12', () => {
    assert(!evalBet(40, 13), '1st dozen loses on 13');
    assert(!evalBet(40, 36), '1st dozen loses on 36');
  });

  it('2nd dozen (41) wins on 13-24', () => {
    for (let n = 13; n <= 24; n++) assert(evalBet(41, n), `2nd dozen wins on ${n}`);
  });

  it('3rd dozen (42) wins on 25-36', () => {
    for (let n = 25; n <= 36; n++) assert(evalBet(42, n), `3rd dozen wins on ${n}`);
  });

  it('dozens are mutually exclusive', () => {
    for (let n = 1; n <= 36; n++) {
      const wins = [40,41,42].filter(idx => evalBet(idx, n));
      assertEqual(wins.length, 1, `${n} should win exactly one dozen, won ${wins.length}`);
    }
  });
});

describe('evalBet — Columns (37/38/39)', () => {
  it('top column (37) wins on 3,6,...,36', () => {
    for (let n = 3; n <= 36; n += 3) assert(evalBet(37, n), `top col wins on ${n}`);
  });

  it('mid column (38) wins on 2,5,...,35', () => {
    for (let n = 2; n <= 35; n += 3) assert(evalBet(38, n), `mid col wins on ${n}`);
  });

  it('bot column (39) wins on 1,4,...,34', () => {
    for (let n = 1; n <= 34; n += 3) assert(evalBet(39, n), `bot col wins on ${n}`);
  });

  it('columns are mutually exclusive', () => {
    for (let n = 1; n <= 36; n++) {
      const wins = [37,38,39].filter(idx => evalBet(idx, n));
      assertEqual(wins.length, 1, `${n} should win exactly one column, won ${wins.length}`);
    }
  });
});

// ─── getRBetNums ─────────────────────────────────────────────────────────────

describe('getRBetNums', () => {
  it('returns [] for bet index 0 (green zero loses outside bets)', () => {
    assertDeepEqual(getRBetNums(0), []);
  });

  it('returns [n] for straight-up number bets 1-36', () => {
    for (let n = 1; n <= 36; n++) {
      assertDeepEqual(getRBetNums(n), [n], `straight-up ${n}`);
    }
  });

  it('1st dozen covers exactly 12 numbers (1-12)', () => {
    const nums = getRBetNums(40);
    assertEqual(nums.length, 12);
    for (let n = 1; n <= 12; n++) assert(nums.includes(n), `${n} in 1st dozen`);
    assert(!nums.includes(13), '13 not in 1st dozen');
  });

  it('2nd dozen covers 13-24', () => {
    const nums = getRBetNums(41);
    assertEqual(nums.length, 12);
    for (let n = 13; n <= 24; n++) assert(nums.includes(n), `${n} in 2nd dozen`);
  });

  it('3rd dozen covers 25-36', () => {
    const nums = getRBetNums(42);
    assertEqual(nums.length, 12);
    for (let n = 25; n <= 36; n++) assert(nums.includes(n), `${n} in 3rd dozen`);
  });

  it('Red and Black together cover exactly 1-36', () => {
    const red = getRBetNums(45), black = getRBetNums(46);
    assertEqual(red.length, 18, '18 red numbers');
    assertEqual(black.length, 18, '18 black numbers');
    const all = new Set([...red, ...black]);
    assertEqual(all.size, 36, 'red + black = 36 unique numbers');
    for (let n = 1; n <= 36; n++) assert(all.has(n), `${n} covered`);
  });

  it('Even and Odd together cover exactly 1-36', () => {
    const even = getRBetNums(44), odd = getRBetNums(47);
    assertEqual(even.length, 18);
    assertEqual(odd.length, 18);
    const all = new Set([...even, ...odd]);
    assertEqual(all.size, 36);
  });

  it('getRBetNums is consistent with evalBet for all outside bets', () => {
    for (let idx = 37; idx <= 48; idx++) {
      const nums = getRBetNums(idx);
      for (const n of nums) {
        assert(evalBet(idx, n), `getRBetNums(${idx}) lists ${n}, evalBet should agree`);
      }
    }
  });

  it('column top (37) covers 12 numbers', () => {
    assertEqual(getRBetNums(37).length, 12);
  });

  it('all three columns cover all 36 non-zero numbers', () => {
    const all = new Set([...getRBetNums(37), ...getRBetNums(38), ...getRBetNums(39)]);
    assertEqual(all.size, 36);
    for (let n = 1; n <= 36; n++) assert(all.has(n), `${n} covered by columns`);
  });
});

// ─── Roulette payouts: _evalBets payout amounts ─────────────────────────────

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

// ─── rBetLabel — clear, disambiguated bet names ───────────────────────────────
describe('rBetLabel', () => {
  it('numbers: "#17" compact, "Number 17" long', () => {
    assertEqual(rBetLabel(17), '#17');
    assertEqual(rBetLabel(17, true), 'Number 17');
    assertEqual(rBetLabel(0), '#0', 'green zero');
  });

  it('the three 2:1 columns are named by their board row', () => {
    // The board tiles stay "2:1"; the spin/result label says which row.
    assertEqual(rBetLabel(37), 'Top Row');
    assertEqual(rBetLabel(38), 'Middle Row');
    assertEqual(rBetLabel(39), 'Bottom Row');
    assert(new Set([rBetLabel(37), rBetLabel(38), rBetLabel(39)]).size === 3, 'columns are distinguishable');
  });

  it('column row names are the same in long form', () => {
    assertEqual(rBetLabel(37, true), 'Top Row');
    assertEqual(rBetLabel(39, true), 'Bottom Row');
  });

  it('dozens and even-money bets pass through their plain label', () => {
    assertEqual(rBetLabel(40), '1-12');
    assertEqual(rBetLabel(42), '25-36');
    assertEqual(rBetLabel(45), 'Red');
    assertEqual(rBetLabel(46), 'Black');
    assertEqual(rBetLabel(44), 'Even');
    assertEqual(rBetLabel(48), '19-36');
  });

  it('out-of-range index returns "?"', () => {
    assertEqual(rBetLabel(99), '?');
  });
});

// ─── _resolveRoulette — idempotency (a spin is only ever credited once) ──────────
// Regression for the "all-in win counted twice" bug: a duplicate/late rFinish (flaky audio
// firing onended + error, bfcache restore, refresh race) must not re-credit the payout.
describe('_resolveRoulette — credits a spin exactly once', () => {
  // Run the resolve with render/saveState/updateChipDisplay stubbed out so we can assert on
  // the chip math without DOM/network side effects, then restore the real functions.
  function withStubs(fn) {
    const _r = window.render, _u = window.updateChipDisplay, _s = window.saveState;
    window.render = () => {}; window.updateChipDisplay = () => {}; window.saveState = () => {};
    const _snap = { rResult: S.rResult, rBets: S.rBets, rSpin: S.rSpin, rPhase: S.rPhase,
                    rReSpun: S.rReSpun, chips: S.chips, forcedMod: S.forcedMod };
    try { fn(); }
    finally {
      window.render = _r; window.updateChipDisplay = _u; window.saveState = _s;
      Object.assign(S, _snap);
    }
  }

  it('all-in straight-up win credits stake+profit once (2375 on #14 → 85,500)', () => {
    withStubs(() => {
      S.forcedMod = {};               // neutralize daily modifier (no winMult / respin)
      S.rResult = null; S.rReSpun = false; S.rPhase = 'spinning';
      S.rBets = [{ pick: 14, bet: 2375 }]; S.rSpin = 14; S.chips = 0;
      _resolveRoulette();
      assertEqual(S.chips, 85500, 'first resolve: 2375 × 36');
      assertEqual(S.rResult.delta, 83125, 'net delta = 2375 × 35');
    });
  });

  it('a duplicate/late second resolve does NOT credit the win again', () => {
    withStubs(() => {
      S.forcedMod = {};
      S.rResult = null; S.rReSpun = false; S.rPhase = 'spinning';
      S.rBets = [{ pick: 14, bet: 2375 }]; S.rSpin = 14; S.chips = 0;
      _resolveRoulette();
      _resolveRoulette();             // simulate a duplicate/late rFinish
      assertEqual(S.chips, 85500, 'chips stay at the single-credit value (not 171,000)');
      assertEqual(S.rResult.delta, 83125, 'rResult unchanged by the second call');
    });
  });

  it('a losing spin is also only resolved once', () => {
    withStubs(() => {
      S.forcedMod = {};
      S.rResult = null; S.rReSpun = false; S.rPhase = 'spinning';
      S.rBets = [{ pick: 14, bet: 500 }]; S.rSpin = 7; S.chips = 0; // bet already deducted
      _resolveRoulette();
      _resolveRoulette();
      assertEqual(S.chips, 0, 'loss does not double-deduct');
      assertEqual(S.rResult.delta, -500, 'net delta = -stake');
    });
  });
});

// ─── Double Ball (r_double_ball): a bet wins if EITHER ball matches, pays once ───
describe('_evalBets — r_double_ball (Double Ball)', () => {
  it('wins when the first ball matches (pays once at 35:1)', () => {
    S.forcedMod = 'r_double_ball'; S.rSpin2 = 5;
    const [r] = _evalBets([_bet(17, 10)], 17);
    assertEqual(r.won, true);
    assertEqual(r.delta, 350, 'straight-up pays 35:1 once, not doubled');
    S.forcedMod = null; S.rSpin2 = null;
  });

  it('wins when only the second ball matches', () => {
    S.forcedMod = 'r_double_ball'; S.rSpin2 = 17;
    const [r] = _evalBets([_bet(17, 10)], 5); // first ball misses, second hits
    assertEqual(r.won, true);
    assertEqual(r.delta, 350);
    S.forcedMod = null; S.rSpin2 = null;
  });

  it('an even-money bet hit by BOTH balls still pays only once', () => {
    S.forcedMod = 'r_double_ball'; S.rSpin2 = 3; // 1 and 3 are both red
    const [r] = _evalBets([_bet(45, 10)], 1);
    assertEqual(r.won, true);
    assertEqual(r.delta, 10, 'Red pays 1:1 once (not 20)');
    S.forcedMod = null; S.rSpin2 = null;
  });

  it('loses only when neither ball matches', () => {
    S.forcedMod = 'r_double_ball'; S.rSpin2 = 18;
    const [r] = _evalBets([_bet(17, 10)], 5);
    assertEqual(r.won, false);
    assertEqual(r.delta, -10);
    S.forcedMod = null; S.rSpin2 = null;
  });

  it('ignores the second ball when the modifier is off', () => {
    S.forcedMod = {}; S.rSpin2 = 17; // would win via second ball, but modifier inactive
    const [r] = _evalBets([_bet(17, 10)], 5);
    assertEqual(r.won, false);
    S.forcedMod = null; S.rSpin2 = null;
  });
});

// ─── spinFromRandom — winning-pocket selection from spin words (incl. the hot-number boost) ─────
// The server (or local fallback) supplies 4 random uint32 "words"; spinFromRandom maps them to
// the pocket(s) as w0 % pool (+ w1 for the hot-number fall-through, w2 for Double Ball). Feeding
// small ints walks every pool slot deterministically (no statistics / flakiness).
const _spinW = (w0 = 0, w1 = 0, w2 = 0, w3 = 0) => spinFromRandom([w0, w1, w2, w3]);

describe('spinFromRandom — Sweet Sixteen boost (true 10×: P(16) = 10/37)', () => {
  it('16 wins in exactly 10 of the 37 equally-likely first-word buckets → 10/37 ≈ 27%', () => {
    S.forcedMod = 'r_sweet_sixteen';
    let hits = 0;
    for (let b = 0; b < 37; b++) if (_spinW(b, 0).n === 16) hits++;
    S.forcedMod = null;
    assertEqual(hits, 10, '16 wins 10 of 37 first-word buckets (10/37, a true 10× of the fair 1/37)');
  });

  it('a boost-band first word returns 16 regardless of the second word', () => {
    S.forcedMod = 'r_sweet_sixteen';
    for (let b = 0; b < 10; b++) assertEqual(_spinW(b, 5).n, 16, `bucket ${b} → 16`);
    S.forcedMod = null;
  });

  it('a non-boost first word falls through to a fair spin over the other 36 pockets, skipping 16', () => {
    S.forcedMod = 'r_sweet_sixteen';
    const hist = {};
    for (let c = 0; c < 36; c++) {
      const n = _spinW(10, c).n;  // first word bucket 10 ≥ boost → second stage
      hist[n] = (hist[n] || 0) + 1;
      assertEqual(n, c < 16 ? c : c + 1, `second-stage slot ${c} maps past 16`);
    }
    S.forcedMod = null;
    assert(!(16 in hist), 'second stage never lands on 16 (no double counting)');
    assertEqual(Object.keys(hist).length, 36, 'all 36 other pockets reachable');
  });
});

describe('spinFromRandom — Hot Zero shares the same path (true 10× on 0)', () => {
  it('0 wins 10 of 37 first-word buckets; the fall-through is a fair spin over 1..36', () => {
    S.forcedMod = 'r_hot_zero';
    let hits = 0; const others = {};
    for (let b = 0; b < 37; b++) if (_spinW(b, 0).n === 0) hits++;
    for (let c = 0; c < 36; c++) {
      const n = _spinW(36, c).n;   // bucket 36 ≥ boost → second stage
      others[n] = (others[n] || 0) + 1;
      assertEqual(n, c + 1, `second-stage slot ${c} → ${c + 1}`);
    }
    S.forcedMod = null;
    assertEqual(hits, 10, '0 wins 10/37 of the time');
    assert(!(0 in others), 'second stage never re-lands on 0');
  });
});

describe('spinFromRandom — no boost, force group, Double Ball, override', () => {
  it('with no modifier the 37 first-word slots map 1:1 onto 0..36', () => {
    S.forcedMod = {};
    const hist = {};
    for (let r = 0; r < 37; r++) { const n = _spinW(r).n; hist[n] = (hist[n] || 0) + 1; }
    S.forcedMod = null;
    for (let n = 0; n <= 36; n++) assertEqual(hist[n], 1, `pocket ${n} appears exactly once`);
  });

  it('a force-group day walks only the group pockets (Dozen II → 13..24)', () => {
    S.forcedMod = 'r_group_13_24';
    try {
      for (let k = 0; k < 12; k++) assertEqual(_spinW(k).n, 13 + k, `slot ${k} → ${13 + k}`);
      assertEqual(_spinW(12).n, 13, 'slot 12 wraps back to the first group pocket');
    } finally { S.forcedMod = null; }
  });

  it('Double Ball derives a second, always-distinct pocket from word 2', () => {
    S.forcedMod = 'r_double_ball';
    try {
      const seen = new Set();
      for (let k = 0; k < 36; k++) {
        const { n, n2 } = _spinW(5, 0, k);
        assertEqual(n, 5, 'ball 1 comes from word 0');
        assert(n2 !== null && n2 !== 5, `ball 2 (${n2}) must differ from ball 1`);
        seen.add(n2);
      }
      assertEqual(seen.size, 36, 'ball 2 covers all 36 other pockets uniformly');
    } finally { S.forcedMod = null; }
  });

  it('without Double Ball the second pocket is null', () => {
    S.forcedMod = {};
    try { assertEqual(_spinW(5, 0, 9).n2, null); } finally { S.forcedMod = null; }
  });

  it('DEAL.rSpinOverride beats the hot-number boost outright', () => {
    const prev = DEAL.rSpinOverride;
    DEAL.rSpinOverride = 23; S.forcedMod = 'r_sweet_sixteen';
    try { assertEqual(_spinW(0).n, 23); }
    finally { DEAL.rSpinOverride = prev; S.forcedMod = null; }
  });
});

// ─── Sweet Sixteen — modifier configuration (the day wiring) ─────────────────────────────────────
describe('Sweet Sixteen — modifier config', () => {
  it('preset exists with the right type, title, and boost keys', () => {
    const m = PRESET_MODIFIERS.r_sweet_sixteen;
    assert(m, 'r_sweet_sixteen preset exists');
    assertEqual(m.type, 'roulette');
    assertEqual(m.title, 'Sweet Sixteen');
    assertEqual(m.r_hot_number, 16);
    assertEqual(m.r_hot_boost, 10);
  });

  it('replaces r_multi_bet in the daily CYCLE_ORDER', () => {
    assert(CYCLE_ORDER.includes('r_sweet_sixteen'), 'cycle now includes Sweet Sixteen');
    assert(!CYCLE_ORDER.includes('r_multi_bet'), 'cycle no longer includes r_multi_bet');
  });

  it("is tomorrow's daily modifier (2026-06-04)", () => {
    assertEqual(DAILY_MODIFIERS[20260604], 'r_sweet_sixteen');
  });

  it('keeps the r_multi_bet preset and its frozen archive day (Day 5) intact', () => {
    assert(PRESET_MODIFIERS.r_multi_bet, 'r_multi_bet preset retained for archives');
    assertEqual(DAILY_MODIFIERS[20260509], 'r_multi_bet', 'frozen Day 5 unchanged');
  });
});

// ─── spinFromRandom — Loaded Colors (dynamic 66% boost on the player's chosen color) ─────────────
// Unlike the fixed hot-number boost, this one reads the single locked bet, so the boosted set is
// whichever color the player picked. Stage 1 is w0 % 100 < 66 (hit the chosen 18 pockets via w1),
// else fall through to the other 19 pockets (other color + green 0) via w1. Feeding small ints
// walks every bucket deterministically.
describe('spinFromRandom — Loaded Colors boost (chosen color wins 66%)', () => {
  // Runs fn with Loaded Colors active and a single bet on `pick`, then restores state.
  function withColorBet(pick, fn) {
    const prevMod = S.forcedMod, prevBets = S.rBets;
    S.forcedMod = 'r_color_lock'; S.rBets = [_bet(pick, 10)];
    try { fn(); } finally { S.forcedMod = prevMod; S.rBets = prevBets; }
  }
  const isBlack = n => n !== 0 && !REDS.has(n);

  it('a Red bet: red wins in exactly 66 of the 100 first-word buckets', () => {
    withColorBet(45, () => {
      let hits = 0;
      for (let b = 0; b < 100; b++) if (REDS.has(_spinW(b, 0).n)) hits++;
      assertEqual(hits, 66, 'red wins 66/100 first-word buckets (exactly 66%)');
    });
  });

  it('a Red bet: a hit bucket walks all 18 red pockets via the second word', () => {
    withColorBet(45, () => {
      const seen = new Set();
      for (let c = 0; c < 18; c++) { const n = _spinW(0, c).n; assert(REDS.has(n), `slot ${c} → a red pocket (${n})`); seen.add(n); }
      assertEqual(seen.size, 18, 'all 18 red pockets reachable');
    });
  });

  it('a Red bet: a miss bucket falls through to the other 19 pockets (black + green 0)', () => {
    withColorBet(45, () => {
      const seen = new Set();
      for (let c = 0; c < 19; c++) { const n = _spinW(66, c).n; assert(!REDS.has(n) || n === 0, `slot ${c} → not red (${n})`); seen.add(n); }
      assertEqual(seen.size, 19, 'all 19 non-red pockets reachable');
      assert(seen.has(0), 'green 0 sits in the miss bucket');
    });
  });

  it('a Black bet boosts black instead (black wins 66 of 100 buckets)', () => {
    withColorBet(46, () => {
      let hits = 0;
      for (let b = 0; b < 100; b++) if (isBlack(_spinW(b, 0).n)) hits++;
      assertEqual(hits, 66, 'black wins 66/100 first-word buckets');
    });
  });

  it('a non-color single bet spins fair (no boost): 37 slots map 1:1 onto 0..36', () => {
    const prevMod = S.forcedMod, prevBets = S.rBets;
    S.forcedMod = 'r_color_lock'; S.rBets = [_bet(7, 10)]; // straight-up number, not a color
    try {
      const hist = {};
      for (let r = 0; r < 37; r++) { const n = _spinW(r).n; hist[n] = (hist[n] || 0) + 1; }
      for (let n = 0; n <= 36; n++) assertEqual(hist[n], 1, `pocket ${n} appears exactly once (fair)`);
    } finally { S.forcedMod = prevMod; S.rBets = prevBets; }
  });
});

// ─── Loaded Colors — modifier configuration (the day wiring) ─────────────────────────────────────
describe('Loaded Colors — modifier config', () => {
  it('preset exists with the right type, title, boost, and one-bet cap', () => {
    const m = PRESET_MODIFIERS.r_color_lock;
    assert(m, 'r_color_lock preset exists');
    assertEqual(m.type, 'roulette');
    assertEqual(m.title, 'Wait, how?');
    assertEqual(m.r_color_boost, 66);
    assertEqual(m.r_max_bets, 1);
  });

  it('replaces all_in_or_skip in the daily CYCLE_ORDER', () => {
    assert(CYCLE_ORDER.includes('r_color_lock'), 'cycle now includes Loaded Colors');
    assert(!CYCLE_ORDER.includes('all_in_or_skip'), 'cycle no longer includes all_in_or_skip');
  });

  it('launches on 2026-06-13', () => {
    assertEqual(DAILY_MODIFIERS[20260613], 'r_color_lock');
  });

  it('keeps the all_in_or_skip preset intact for direct use', () => {
    assert(PRESET_MODIFIERS.all_in_or_skip, 'all_in_or_skip preset retained');
  });
});

// ─── rAddBet — keep the bet amount selected after placing a bet ──────────────────────────────────
// The amount stays so the player can quickly stake the same on another tile; only the tile pick
// clears, and the kept amount caps to the chips left (it can never exceed the balance).
describe('rAddBet — keeps the bet amount (capped to remaining chips)', () => {
  // No roulette board is rendered in the unit harness, so rAddBet mutates state then bails at its
  // `if(!boardBtn) render()` early-return — exactly the state we assert. Stub the side effects.
  function withStubs(fn) {
    const _r = window.render, _s = window.saveState, _c = window.sndChip;
    window.render = () => {}; window.saveState = () => {}; window.sndChip = () => {};
    const snap = { rBets: S.rBets, rBet: S.rBet, rPick: S.rPick, chips: S.chips, forcedMod: S.forcedMod, screen: S.screen, rPhase: S.rPhase };
    try { fn(); } finally { window.render = _r; window.saveState = _s; window.sndChip = _c; Object.assign(S, snap); }
  }

  it('keeps the amount, clears the tile, debits the stake, records the bet', () => {
    withStubs(() => {
      S.forcedMod = {}; S.screen = 'roulette'; S.rPhase = 'bet'; S.rBets = []; S.rPick = 17; S.rBet = 50; S.chips = 200;
      rAddBet();
      assertEqual(S.chips, 150, 'stake debited');
      assertEqual(S.rBets.length, 1); assertEqual(S.rBets[0].pick, 17); assertEqual(S.rBets[0].bet, 50);
      assertEqual(S.rPick, null, 'tile pick cleared');
      assertEqual(S.rBet, 50, 'bet amount kept for the next bet');
    });
  });

  it('caps the kept amount to the chips left when it would exceed them', () => {
    withStubs(() => {
      S.forcedMod = {}; S.screen = 'roulette'; S.rPhase = 'bet'; S.rBets = []; S.rPick = 17; S.rBet = 50; S.chips = 50;
      rAddBet();
      assertEqual(S.chips, 0, 'all chips staked');
      assertEqual(S.rBet, 0, 'kept amount capped to the 0 chips left');
    });
  });

  it('does nothing without a tile picked', () => {
    withStubs(() => {
      S.forcedMod = {}; S.screen = 'roulette'; S.rPhase = 'bet'; S.rBets = []; S.rPick = null; S.rBet = 50; S.chips = 200;
      rAddBet();
      assertEqual(S.chips, 200, 'no debit'); assertEqual(S.rBets.length, 0, 'no bet recorded');
    });
  });
});
