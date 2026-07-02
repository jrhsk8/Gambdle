// ─── mkRng ───────────────────────────────────────────────────────────────────

describe('mkRng', () => {
  it('same seed produces identical sequence', () => {
    const a = mkRng(42), b = mkRng(42);
    for (let i = 0; i < 20; i++) {
      const va = a(), vb = b();
      assert(va === vb, `step ${i}: ${va} !== ${vb}`);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mkRng(1), b = mkRng(2);
    let same = 0;
    for (let i = 0; i < 20; i++) if (a() === b()) same++;
    assert(same < 20, 'different seeds should not be identical');
  });

  it('output is always in [0, 1)', () => {
    const rng = mkRng(99999);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      assert(v >= 0 && v < 1, `value ${v} out of [0,1)`);
    }
  });

  it('seed 0 and seed 1 produce different output', () => {
    const v0 = mkRng(0)();
    const v1 = mkRng(1)();
    assert(v0 !== v1, `seed 0 and seed 1 collide`);
  });
});

// ─── cVal ────────────────────────────────────────────────────────────────────

describe('cVal', () => {
  it('numeric ranks 2-10', () => {
    for (let n = 2; n <= 10; n++) assertEqual(cVal(String(n)), n, `rank ${n}`);
  });

  it('J, Q, K = 10', () => {
    assertEqual(cVal('J'), 10);
    assertEqual(cVal('Q'), 10);
    assertEqual(cVal('K'), 10);
  });

  it('Ace = 11', () => {
    assertEqual(cVal('A'), 11);
  });
});

// ─── hVal ────────────────────────────────────────────────────────────────────

describe('hVal', () => {
  const c = (r, s) => ({ r, s });

  it('basic two-card totals', () => {
    assertEqual(hVal([c('7','♠'), c('8','♥')]), 15);
    assertEqual(hVal([c('10','♠'), c('K','♥')]), 20);
    assertEqual(hVal([c('5','♦'), c('4','♣')]), 9);
  });

  it('soft hand — Ace counts as 11 when safe', () => {
    assertEqual(hVal([c('A','♠'), c('6','♥')]), 17);
    assertEqual(hVal([c('A','♠'), c('9','♥')]), 20);
    assertEqual(hVal([c('A','♠'), c('2','♥')]), 13);
  });

  it('Ace collapses to 1 to avoid bust', () => {
    assertEqual(hVal([c('A','♠'), c('9','♥'), c('5','♦')]), 15);
    assertEqual(hVal([c('A','♠'), c('7','♥'), c('6','♦')]), 14);
    assertEqual(hVal([c('A','♠'), c('K','♥'), c('Q','♦')]), 21);
  });

  it('two Aces: one stays soft', () => {
    assertEqual(hVal([c('A','♠'), c('A','♥')]), 12);
  });

  it('three Aces', () => {
    assertEqual(hVal([c('A','♠'), c('A','♥'), c('A','♦')]), 13);
  });

  it('bust value is preserved exactly', () => {
    assertEqual(hVal([c('K','♠'), c('Q','♥'), c('5','♦')]), 25);
    assertEqual(hVal([c('9','♠'), c('8','♥'), c('7','♦')]), 24);
  });

  it('Ace + two 10-value cards = 21', () => {
    assertEqual(hVal([c('A','♠'), c('K','♥'), c('10','♦')]), 21);
  });

  it('five-card hand', () => {
    assertEqual(hVal([c('2','♠'), c('3','♥'), c('4','♦'), c('5','♣'), c('6','♠')]), 20);
  });
});

// ─── hValDisplay ─────────────────────────────────────────────────────────────

describe('hValDisplay', () => {
  const c = (r, s) => ({ r, s });

  it('hard hand returns plain number', () => {
    assertEqual(hValDisplay([c('7','♠'), c('8','♥')]), '15');
    assertEqual(hValDisplay([c('K','♠'), c('5','♥')]), '15');
    assertEqual(hValDisplay([c('10','♠'), c('9','♥')]), '19');
  });

  it('soft hand shows "hard / soft" format', () => {
    assertEqual(hValDisplay([c('A','♠'), c('6','♥')]), '7 / 17');
    assertEqual(hValDisplay([c('A','♠'), c('4','♥')]), '5 / 15');
    assertEqual(hValDisplay([c('A','♠'), c('9','♥')]), '10 / 20');
    assertEqual(hValDisplay([c('A','♠'), c('2','♥')]), '3 / 13');
  });

  it('soft 21 (Ace + K) shows dual format', () => {
    assertEqual(hValDisplay([c('A','♠'), c('K','♥')]), '11 / 21');
  });

  it('Ace collapses — shows hard total only', () => {
    assertEqual(hValDisplay([c('A','♠'), c('9','♥'), c('5','♦')]), '15');
    assertEqual(hValDisplay([c('A','♠'), c('K','♥'), c('Q','♦')]), '21');
  });

  it('bust shows bust value', () => {
    assertEqual(hValDisplay([c('K','♠'), c('Q','♥'), c('5','♦')]), '25');
  });
});

// ─── isBJ ────────────────────────────────────────────────────────────────────

describe('isBJ', () => {
  const c = (r, s) => ({ r, s });

  it('Ace + face card is blackjack', () => {
    assert(isBJ([c('A','♠'), c('K','♥')]), 'A+K');
    assert(isBJ([c('A','♠'), c('Q','♥')]), 'A+Q');
    assert(isBJ([c('A','♠'), c('J','♥')]), 'A+J');
    assert(isBJ([c('A','♠'), c('10','♥')]), 'A+10');
  });

  it('Ace can be second card', () => {
    assert(isBJ([c('K','♠'), c('A','♥')]), 'K+A');
  });

  it('21 from three cards is not blackjack', () => {
    assert(!isBJ([c('A','♠'), c('5','♥'), c('5','♦')]), 'A+5+5 = 21, not BJ');
    assert(!isBJ([c('7','♠'), c('7','♥'), c('7','♦')]), '7+7+7 = 21, not BJ');
  });

  it('two face cards (20) is not blackjack', () => {
    assert(!isBJ([c('K','♠'), c('Q','♥')]), 'K+Q = 20');
  });

  it('pair of Aces (soft 12) is not blackjack', () => {
    assert(!isBJ([c('A','♠'), c('A','♥')]), 'A+A = 12');
  });
});

// ─── buildDeck ───────────────────────────────────────────────────────────────

describe('buildDeck', () => {
  it('has exactly 52 cards', () => {
    assertEqual(buildDeck().length, 52);
  });

  it('contains all 4 suits × 13 ranks', () => {
    const deck = buildDeck();
    for (const s of ['♠','♥','♦','♣']) {
      for (const r of ['2','3','4','5','6','7','8','9','10','J','Q','K','A']) {
        assert(deck.some(c => c.s === s && c.r === r), `missing ${r}${s}`);
      }
    }
  });

  it('no duplicate cards', () => {
    const deck = buildDeck();
    const seen = new Set(deck.map(c => `${c.r}${c.s}`));
    assertEqual(seen.size, 52, 'all 52 cards are unique');
  });
});

// ─── shuffle ─────────────────────────────────────────────────────────────────

describe('shuffle', () => {
  it('same seed produces same order', () => {
    const deck = buildDeck();
    const a = shuffle(deck, mkRng(999));
    const b = shuffle(deck, mkRng(999));
    assertDeepEqual(a.map(c => c.r + c.s), b.map(c => c.r + c.s));
  });

  it('preserves all 52 cards', () => {
    const deck = buildDeck();
    const s = shuffle(deck, mkRng(1));
    assertEqual(s.length, 52);
    const origKeys = new Set(deck.map(c => c.r + c.s));
    for (const c of s) assert(origKeys.has(c.r + c.s), `unexpected card ${c.r}${c.s}`);
  });

  it('different seeds produce different orders', () => {
    const deck = buildDeck();
    const a = shuffle(deck, mkRng(1)).map(c => c.r + c.s).join(',');
    const b = shuffle(deck, mkRng(2)).map(c => c.r + c.s).join(',');
    assert(a !== b, 'different seeds should produce different orderings');
  });

  it('does not mutate the input array', () => {
    const deck = buildDeck();
    const before = deck.map(c => c.r + c.s).join(',');
    shuffle(deck, mkRng(42));
    assertEqual(deck.map(c => c.r + c.s).join(','), before, 'original deck unchanged');
  });
});

// ─── getTier ─────────────────────────────────────────────────────────────────

describe('getTier', () => {
  it('2500+ is Whale', () => {
    assertEqual(getTier(2500).label, 'Whale');
    assertEqual(getTier(9999).label, 'Whale');
  });

  it('1500–2499 is High Roller', () => {
    assertEqual(getTier(1500).label, 'High Roller');
    assertEqual(getTier(2499).label, 'High Roller');
  });

  it('1000–1499 is Apprentice', () => {
    assertEqual(getTier(1000).label, 'Apprentice');
    assertEqual(getTier(1499).label, 'Apprentice');
  });

  it('1–999 is Survivor', () => {
    assertEqual(getTier(1).label, 'Survivor');
    assertEqual(getTier(999).label, 'Survivor');
  });

  it('0 is Bozo', () => {
    assertEqual(getTier(0).label, 'Bozo');
  });

  it('exact boundary 1500', () => {
    assert(getTier(1499).label !== getTier(1500).label, 'boundary at 1500');
  });
});

// ─── genDeal / DEAL ──────────────────────────────────────────────────────────

describe('genDeal (DEAL)', () => {
  it('DEAL.bjShoe has 208 cards (base 2 decks + 2 appended for the no-run-dry safety net)', () => {
    assertEqual(DEAL.bjShoe.length, 208);
  });

  it('DEAL.bjShoe composition: base 104 has each card ×2, full 208 has each ×4', () => {
    const count = (arr) => arr.reduce((m, c) => { const k = c.r + c.s; m[k] = (m[k] || 0) + 1; return m; }, {});
    const base = count(DEAL.bjShoe.slice(0, 104));
    assertEqual(Object.keys(base).length, 52, 'base shoe has all 52 distinct cards');
    for (const [k, v] of Object.entries(base)) assertEqual(v, 2, `base shoe: ${k} appears ${v}×, expected 2`);
    const full = count(DEAL.bjShoe);
    for (const [k, v] of Object.entries(full)) assertEqual(v, 4, `extended shoe: ${k} appears ${v}×, expected 4`);
  });

  it('DEAL.uthDeck has 52 cards', () => {
    assertEqual(DEAL.uthDeck.length, 52);
  });

  it('DEAL.pokerDecks is 3 decks of 52', () => {
    assertEqual(DEAL.pokerDecks.length, 3);
    for (const d of DEAL.pokerDecks) assertEqual(d.length, 52, 'poker deck length');
  });

  it('same RNG seed always produces same first BJ card', () => {
    const seed = 20260101;
    const rng1 = mkRng(seed);
    const rng2 = mkRng(seed);
    const shoe = []; for (let i = 0; i < 2; i++) shoe.push(...buildDeck());
    const s1 = shuffle([...shoe], rng1);
    const s2 = shuffle([...shoe], rng2);
    assertEqual(s1[0].r, s2[0].r, 'first card rank matches');
    assertEqual(s1[0].s, s2[0].s, 'first card suit matches');
  });

  it('different seeds produce different first BJ cards (with very high probability)', () => {
    const rng1 = mkRng(111), rng2 = mkRng(222);
    const shoe = []; for (let i = 0; i < 2; i++) shoe.push(...buildDeck());
    const s1 = shuffle([...shoe], rng1);
    const s2 = shuffle([...shoe], rng2);
    // Check at least one of the first 5 cards differs
    const a5 = s1.slice(0,5).map(c=>c.r+c.s).join(',');
    const b5 = s2.slice(0,5).map(c=>c.r+c.s).join(',');
    assert(a5 !== b5, 'different seeds should produce different card sequences');
  });
});

describe('computeStreak', () => {
  // Day-index → YYYYMMDD seed, so we can build histories relative to "today".
  const idxToSeed = idx => { const d = new Date(START_DATE_UTC + idx * 86400000); return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); };
  const TODAY = _seedDayIndex(getDailySeed());
  // Runs fn with gambdle_history seeded from the given day-offsets (0 = today, -1 = yesterday…).
  function withHistory(offsets, fn) {
    const prev = _ls.getItem('gambdle_history');
    const hist = {}; for (const off of offsets) hist[idxToSeed(TODAY + off)] = 1000;
    _ls.setItem('gambdle_history', JSON.stringify(hist));
    try { fn(); } finally { prev === null ? _ls.removeItem('gambdle_history') : _ls.setItem('gambdle_history', prev); }
  }

  it('no history → current 0, best 0', () => {
    withHistory([], () => { const s = computeStreak(); assertEqual(s.current, 0, 'current'); assertEqual(s.best, 0, 'best'); });
  });

  it('includeEnd counts today even when not yet persisted', () => {
    withHistory([], () => assertEqual(computeStreak(getDailySeed(), true).current, 1));
  });

  it('consecutive days ending today → current = run length', () => {
    withHistory([-2, -1, 0], () => assertEqual(computeStreak().current, 3));
  });

  it('a missed day breaks the current run', () => {
    // played today, yesterday, and 3 days ago: the 2-days-ago gap caps current at 2.
    withHistory([-3, -1, 0], () => { const s = computeStreak(); assertEqual(s.current, 2, 'current'); assertEqual(s.best, 2, 'best'); });
  });

  it('current is 0 when the most recent played day is not today (and includeEnd off)', () => {
    withHistory([-5, -4, -3], () => { const s = computeStreak(); assertEqual(s.current, 0, 'current'); assertEqual(s.best, 3, 'best'); });
  });

  it('best is the longest run anywhere in history', () => {
    withHistory([-8, -7, -6, -5, -2, -1, 0], () => { const s = computeStreak(); assertEqual(s.current, 3, 'current'); assertEqual(s.best, 4, 'best'); });
  });

  it('ignores corrupt history JSON without throwing', () => {
    const prev = _ls.getItem('gambdle_history');
    _ls.setItem('gambdle_history', '{not valid');
    try { assertEqual(computeStreak().current, 0); } finally { prev === null ? _ls.removeItem('gambdle_history') : _ls.setItem('gambdle_history', prev); }
  });
});

describe('buildShareText — top-percentile line', () => {
  function withTopPct(v, fn) { const prev = _lbTopPct; _lbTopPct = v; try { fn(); } finally { _lbTopPct = prev; } }

  it('appends "(Top X%)" to the chips line when in the top half', () => {
    withTopPct(12, () => assert(/Finished with [\d,]+ chips \(Top 12%\)/.test(buildShareText()), 'top-12% appended inline'));
  });

  it('is not added as a separate line', () => {
    withTopPct(12, () => assert(!buildShareText().includes('🏆 Finished Top'), 'no standalone top-percentile line'));
  });

  it('omits the suffix outside the top half', () => {
    withTopPct(75, () => assert(!buildShareText().includes('(Top'), 'no top suffix for bottom half'));
  });

  it('omits the suffix when the percentile is unknown', () => {
    withTopPct(null, () => assert(!buildShareText().includes('(Top'), 'no top suffix before fetch'));
  });

  it('includes the suffix exactly at the 50% boundary', () => {
    withTopPct(50, () => assert(buildShareText().includes('(Top 50%)'), 'top-50% is included'));
  });

  it('still ends with the gambdle.net footer', () => {
    withTopPct(5, () => assert(buildShareText().trim().endsWith('gambdle.net'), 'footer stays last'));
  });
});

// ─── credit / debit · the single chip-accounting chokepoint ─────────────────
describe('credit / debit', () => {
  function withChips(start, fn) { const prev = S.chips; S.chips = start; try { fn(); } finally { S.chips = prev; } }

  it('credit adds to the balance', () => {
    withChips(1000, () => { credit(250, 'test'); assertEqual(S.chips, 1250); });
  });

  it('debit subtracts from the balance', () => {
    withChips(1000, () => { debit(300, 'test'); assertEqual(S.chips, 700); });
  });

  it('debit never drives the balance negative (clamps at 0)', () => {
    withChips(50, () => { debit(200, 'test'); assertEqual(S.chips, 0, 'overdraw clamps to 0'); });
  });

  it('credit rounds fractional amounts to whole chips', () => {
    withChips(1000, () => { credit(74.5, 'test'); assertEqual(S.chips, 1075, '74.5 rounds to 75'); });
  });

  it('debit rounds fractional amounts to whole chips', () => {
    withChips(1000, () => { debit(74.4, 'test'); assertEqual(S.chips, 926, '74.4 rounds to 74'); });
  });

  it('the balance stays an integer after a fractional credit', () => {
    withChips(1000, () => { credit(0.5, 'test'); assert(Number.isInteger(S.chips), 'chips remain integer'); });
  });
});

// Candidate 5: the accountant is now a dumb replayer of a settlement ledger. applyLedger is the ONE
// place a payout touches chips; order is preserved verbatim (each entry rounds independently).
describe('applyLedger — replays a settlement ledger through an accountant in order', () => {
  it('applies each credit/debit op in sequence with its amount + reason', () => {
    const calls = [];
    const acct = { credit: (n, r) => calls.push(['credit', n, r]), debit: (n, r) => calls.push(['debit', n, r]) };
    applyLedger(acct, [
      { op: 'credit', n: 10, reason: 'a' },
      { op: 'debit', n: 3, reason: 'b' },
      { op: 'credit', n: 5, reason: 'c' },
    ]);
    assertDeepEqual(calls, [['credit', 10, 'a'], ['debit', 3, 'b'], ['credit', 5, 'c']]);
  });
  it('an empty ledger touches the accountant zero times', () => {
    let n = 0;
    applyLedger({ credit: () => n++, debit: () => n++ }, []);
    assertEqual(n, 0);
  });
});

// ledgerEntry/mkCredit/mkDebit: the validating factory the *Award builders use instead of hand-writing
// {op,n,reason} literals. Strict mode is on for the whole suite (test.html sets window.__GAMBDLE_TEST__),
// so a typo'd op or an undeclared reason should throw the moment the entry is built. Mirrors the
// round-record.test.js _throws pattern used for mkOutcome's own strict-mode validation.
describe('ledgerEntry — validates op/n/reason in strict mode (typo guard)', () => {
  const _throws = fn => { try { fn(); return false; } catch { return true; } };
  it('builds the same {op,n,reason} shape as the old hand-written literals', () => {
    assertDeepEqual(mkCredit(100, 'bj-win'), { op: 'credit', n: 100, reason: 'bj-win' });
    assertDeepEqual(mkDebit(50, 'ladder'), { op: 'debit', n: 50, reason: 'ladder' });
  });
  it("throws on a typo'd op", () => {
    assert(_throws(() => ledgerEntry('cerdit', 100, 'bj-win')), 'expected a throw on the cerdit typo');
  });
  it('throws on an undeclared reason', () => {
    assert(_throws(() => ledgerEntry('credit', 100, 'bj-wni')), 'expected a throw on the bj-wni typo');
  });
  it('throws on a non-finite or negative n', () => {
    assert(_throws(() => ledgerEntry('credit', NaN, 'bj-win')), 'expected a throw on NaN n');
    assert(_throws(() => ledgerEntry('credit', -5, 'bj-win')), 'expected a throw on negative n');
  });
});

describe('fmtK — compact k/m abbreviation', () => {
  const cases = [
    [0, '0'], [50, '50'], [999, '999'],
    [1000, '1k'], [1500, '1.5k'], [12500, '12.5k'], [125000, '125k'], [100000, '100k'],
    [1000000, '1m'], [1250000, '1.25m'], [2500000, '2.5m'], [999999, '1m'],
    [-1500, '-1.5k'],
  ];
  for (const [n, want] of cases) {
    it(`${n} -> ${want}`, () => assertEqual(fmtK(n), want, `fmtK(${n})`));
  }
  it('keeps full commas below 1,000', () => assertEqual(fmtK(750), '750'));
});
