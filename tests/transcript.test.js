// ─── Run transcript (S.tx / txLog) — integrity Phase 1 ───────────────────────
// Every replay-relevant player decision must land in S.tx in order, with the shape
// the submit-score Edge Function stores (and Phase 2 will replay). See
// .claude/LEADERBOARD-INTEGRITY.md.

// Snapshot/restore S around each test (pattern from modifiers.test.js).
const _txSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
function _txRestore() {
  const r = JSON.parse(_txSnap);
  r.pkHeld = new Set(r.pkHeld);
  Object.assign(S, r);
  S.forcedMod = null;
}
const _lastTx = () => S.tx[S.tx.length - 1];

describe('txLog — basics', () => {
  it('appends events in order', () => {
    S.tx = [];
    try {
      txLog({ g: 'lad', a: 'hi' });
      txLog({ g: 'lad', a: 'cash' });
      assertEqual(S.tx.length, 2);
      assertEqual(S.tx[0].a, 'hi');
      assertEqual(S.tx[1].a, 'cash');
    } finally { _txRestore(); }
  });

  it('tolerates a stale save without S.tx (no throw, no-op)', () => {
    S.tx = undefined;
    try { txLog({ g: 'lad', a: 'cash' }); assertEqual(S.tx, undefined); }
    finally { _txRestore(); }
  });

  it('rejects a mistyped transcript field in strict mode (write-time, not at replay)', () => {
    S.tx = [];
    try {
      let threw = null;
      try { txLog({ g: 'uth', a: 'deal', h: 0, antee: 150 }); } catch (e) { threw = e; } // 'antee' typo
      assert(threw, 'expected txLog to reject the missing ante field');
      assertEqual(S.tx.length, 0, 'the malformed event was not appended');
    } finally { _txRestore(); }
  });
});

describe('transcript — Blackjack actions', () => {
  it('bjDeal logs the hand and bet', () => {
    S.forcedMod = {};
    Object.assign(S, { screen: 'bj', bjPhase: 'bet', bjBet: 150, bjHand: 0, chips: 1000, tx: [] });
    try {
      bjDeal();
      assertDeepEqual(_lastTx(), { g: 'bj', a: 'deal', h: 0, bet: 150 });
    } finally { _txRestore(); }
  });

  it('bjHit / bjStand log the hand and split sub-hand index', () => {
    S.forcedMod = {};
    // Suppress the post-action timers so the dealer turn doesn't run against restored state.
    const savedDefer = _bjDefer, savedAfter = _bjAfterCard;
    _bjDefer = () => {}; _bjAfterCard = () => {};
    Object.assign(S, {
      screen: 'bj', bjPhase: 'play', bjHand: 1, chips: 900, bjBet: 100, tx: [],
      bjPlayer: [card('2', 's'), card('3', 'h')], bjDealer: [card('9', 'd'), card('5', 'c')],
      bjSplit: false, bjIdx: 4,
    });
    try {
      bjHit();
      assertDeepEqual(_lastTx(), { g: 'bj', a: 'hit', h: 1, s: 0 });
      bjStand();
      assertDeepEqual(_lastTx(), { g: 'bj', a: 'stand', h: 1, s: 0 });
      assertEqual(S.tx.length, 2, 'exactly one event per action');
    } finally {
      _bjDefer = savedDefer; _bjAfterCard = savedAfter;
      _bjResolving = false;
      _txRestore();
    }
  });

  it('bjDouble and bjSplit log with their sub-hand index', () => {
    S.forcedMod = {};
    const savedDefer = _bjDefer, savedAfter = _bjAfterCard;
    _bjDefer = () => {}; _bjAfterCard = () => {};
    Object.assign(S, {
      screen: 'bj', bjPhase: 'play', bjHand: 0, chips: 1000, bjBet: 100, tx: [],
      bjPlayer: [card('8', 's'), card('8', 'h')], bjDealer: [card('9', 'd'), card('5', 'c')],
      bjSplit: false, bjIdx: 4, bjAnimFrom: 0, bjSplitAnimFrom: [],
    });
    try {
      bjSplit();
      assertDeepEqual(S.tx[0], { g: 'bj', a: 'split', h: 0, s: 0 });
      bjDouble(); // doubles the active split hand (index 0)
      assertDeepEqual(_lastTx(), { g: 'bj', a: 'double', h: 0, s: 0 });
    } finally {
      _bjDefer = savedDefer; _bjAfterCard = savedAfter;
      _bjResolving = false;
      _txRestore();
    }
  });

  it('bjSkip logs the skipped hand', () => {
    S.forcedMod = 'all_in_or_skip';
    Object.assign(S, { screen: 'bj', bjPhase: 'bet', bjHand: 0, bjHistory: [], chips: 1000, tx: [] });
    try {
      bjSkip();
      assertDeepEqual(S.tx[0], { g: 'bj', a: 'skip', h: 0 });
    } finally { _txRestore(); }
  });
});

describe('transcript — UTH actions', () => {
  it('uthDeal logs the hand and ante', () => {
    S.forcedMod = {};
    Object.assign(S, { screen: 'uth', uthPhase: 'bet', uthAnte: 200, uthHand: 0, chips: 1000, tx: [] });
    try {
      uthDeal();
      assertDeepEqual(_lastTx(), { g: 'uth', a: 'deal', h: 0, ante: 200 });
    } finally { _txRestore(); }
  });

  it('check, raise, and fold log with their street', () => {
    S.forcedMod = {};
    Object.assign(S, {
      screen: 'uth', uthPhase: 'preflop', uthAnte: 100, uthHand: 0, chips: 900, tx: [],
      uthHole: [card('2', 'c'), card('7', 'd')], uthDealer: [card('K', 's'), card('Q', 'd')],
      uthComm: [card('A', 's'), card('5', 'h'), card('9', 'c'), card('J', 'd'), card('3', 'h')],
      uthRevealComm: 0, uthPrevRevealComm: 0, uthRaised: false, uthRaise: 0, uthHistory: [],
    });
    try {
      uthCheck(); // preflop → flop
      assertDeepEqual(_lastTx(), { g: 'uth', a: 'check', h: 0, st: 'preflop' });
      uthPlaceRaise(2); // flop raise
      assertDeepEqual(_lastTx(), { g: 'uth', a: 'raise', h: 0, mult: 2, st: 'flop' });
      S.uthPhase = 'turn'; S.uthFolded = false;
      uthFold();
      assertDeepEqual(_lastTx(), { g: 'uth', a: 'fold', h: 0, st: 'turn' });
    } finally { _txRestore(); }
  });

  it('a Time Travel re-deal is logged (it changes the cards)', () => {
    S.forcedMod = 'uth_time_travel';
    Object.assign(S, {
      screen: 'uth', uthPhase: 'flop', uthHand: 0, chips: 900, tx: [], timeTravelUsed: false,
      uthHole: [card('2', 'c'), card('7', 'd')], uthDealer: [card('K', 's'), card('Q', 'd')],
      uthComm: [card('A', 's'), card('5', 'h'), card('9', 'c'), card('J', 'd'), card('3', 'h')],
      uthRevealComm: 3, uthPrevRevealComm: 3, uthRedealPtr: 27, uthHistory: [],
    });
    try {
      doTimeTravel();
      assertDeepEqual(S.tx[0], { g: 'uth', a: 'timetravel', h: 0, st: 'flop' });
    } finally { _txRestore(); }
  });
});

describe('transcript — roulette actions', () => {
  it('rSpin snapshots the locked bets (and the respin flag) before fetching the words', () => {
    S.forcedMod = {};
    const savedWords = _spinWords;
    _spinWords = async () => [7, 0, 0, 0];
    Object.assign(S, {
      screen: 'roulette', rPhase: 'bet', chips: 800, tx: [], rReSpun: false,
      rBets: [{ pick: 17, bet: 100 }, { pick: 45, bet: 50 }], rSpin: null, rSpin2: null, rResult: null,
    });
    try {
      rSpin(); // async, but the transcript + phase flip happen synchronously before the await
      assertDeepEqual(_lastTx(), { g: 'r', a: 'spin', bets: [[17, 100], [45, 50]], respin: false });
      assertEqual(S.rPhase, 'spinning', 'bet UI locks immediately');
      rSpin(); // double-tap during the fetch must not log a second spin
      assertEqual(S.tx.length, 1, 'in-flight guard blocks a duplicate spin event');
    } finally {
      _spinWords = savedWords;
      _rSpinPending = false;
      _txRestore();
    }
  });

  it('rSkip and rKeepSpin log their decisions', () => {
    S.forcedMod = 'r_respin';
    Object.assign(S, {
      screen: 'roulette', rPhase: 'respin', chips: 800, tx: [], rReSpun: false,
      rBets: [{ pick: 17, bet: 100 }], rSpin: 17, rSpin2: null, rResult: null,
    });
    try {
      rKeepSpin();
      assertEqual(S.tx[0].g, 'r');
      assertEqual(S.tx[0].a, 'keep');
      S.rResult = { delta: 0, skipped: true }; // rSkip path next
      S.tx = [];
      rSkip();
      assertDeepEqual(S.tx[0], { g: 'r', a: 'skip' });
    } finally { _txRestore(); }
  });
});

describe('transcript — system events', () => {
  it('borrowChips logs the borrowed amount', () => {
    S.forcedMod = {};
    Object.assign(S, { screen: 'borrow', chips: 0, borrowUsed: false, borrowAmount: 0, borrowReturnScreen: 'uth', tx: [] });
    const dbg = _ls.getItem('gambdle_borrow_debt');
    try {
      borrowChips();
      assertDeepEqual(S.tx[0], { g: 'sys', a: 'borrow', amt: BORROW_AMOUNT });
    } finally {
      if (dbg === null) _ls.removeItem('gambdle_borrow_debt'); else _ls.setItem('gambdle_borrow_debt', dbg);
      _txRestore();
    }
  });

  it("pickModifier logs the Player's Choice pick (and only a valid one)", () => {
    S.forcedMod = 'players_choice';
    Object.assign(S, { screen: 'choice', pcPick: null, chips: 1000, tx: [] });
    try {
      pickModifier('not_a_real_choice');
      assertEqual(S.tx.length, 0, 'an unoffered key logs nothing');
      const key = PRESET_MODIFIERS.players_choice.choices[0];
      pickModifier(key);
      assertDeepEqual(S.tx[0], { g: 'sys', a: 'pick', mod: key });
    } finally { _txRestore(); }
  });
});

describe('transcript — persistence and submission shape', () => {
  it('S.tx survives a saveState/loadState round trip', () => {
    S.forcedMod = null;
    const events = [{ g: 'bj', a: 'deal', h: 0, bet: 100 }, { g: 'r', a: 'spin', bets: [[17, 50]], respin: false }];
    S.tx = [...events];
    try {
      saveState();
      S.tx = [];
      loadState();
      assertDeepEqual(S.tx, events, 'transcript restored from the saved state');
    } finally { _txRestore(); saveState(); }
  });

  it('a fresh day starts with an empty transcript and a verified spin', () => {
    assertEqual(JSON.parse(_txSnap).rUnverified, false);
    assert(Array.isArray(JSON.parse(_txSnap).tx), 'S.tx initialises as an array');
  });
});
