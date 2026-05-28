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
