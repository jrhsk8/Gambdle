// ─── Canonical settled-round record (deepen-game-envelopes #2) ────────────────
// Every game records a settled round in ONE shape via mkOutcome({slot,delta,result,…detail}); the
// score basis (recalcChips, through settledOutcomes) and a future server replay read that single
// format instead of the old three (per-game history arrays, the rResult singleton, the ladResult
// singleton). These tests pin: the envelope mkOutcome builds; that settledOutcomes/recalcChips read it
// uniformly; that roulette's win-multiplier is folded into one net delta (one credit); that each
// game emits the canonical shape; and that the loadState shim upgrades pre-v1.42 saved records.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _rrSnap = () => JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _rrRestore = snap => { const r = JSON.parse(snap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r); };

// Pure/state-only tests: merge overrides into S, run, restore. No DOM/side effects touched.
function withRR(overrides, fn) {
  const snap = _rrSnap();
  Object.assign(S, overrides);
  try { fn(); } finally { _rrRestore(snap); }
}

// Resolve-driving tests: stub the side-effecting shell (render/save/sound/timers) so a real resolve
// runs synchronously with no DOM, network, or scheduled animation, then restore everything + S.
function withResolve(overrides, fn) {
  const snap = _rrSnap();
  const saved = {
    render: window.render, updateChipDisplay: window.updateChipDisplay, saveState: window.saveState,
    setTimeout: window.setTimeout, sndCard: window.sndCard, sndBigWin: window.sndBigWin, sndChip: window.sndChip,
  };
  window.render = () => {}; window.updateChipDisplay = () => {}; window.saveState = () => {};
  window.setTimeout = () => 0; window.sndCard = () => {}; window.sndBigWin = () => {}; window.sndChip = () => {};
  Object.assign(S, overrides);
  try { fn(); } finally { Object.assign(window, saved); _rrRestore(snap); }
}

// ─── mkOutcome — the canonical envelope ─────────────────────────────────────────
describe('mkOutcome — builds the {slot,delta,result,…detail} envelope', () => {
  it('spreads detail fields after the envelope', () => {
    assertDeepEqual(mkOutcome('bj', 100, 'win', { bet: 50, player: [], dealer: [] }),
                    { slot: 'bj', delta: 100, result: 'win', bet: 50, player: [], dealer: [] });
  });
  it('works with no detail (terminal envelope only)', () => {
    assertDeepEqual(mkOutcome('lad', -100, 'crash'), { slot: 'lad', delta: -100, result: 'crash' });
  });
  it('carries the roulette skip flag through detail', () => {
    assertDeepEqual(mkOutcome('r', 0, 'skipped', { skipped: true }),
                    { slot: 'r', delta: 0, result: 'skipped', skipped: true });
  });
});

// ─── mkOutcome — detail-shape validation (dev/test only) ────────────────────────
// The typo guard from PRD integrity Phase 2: a mistyped or stray detail key records silently today and
// only surfaces as a server-replay mismatch. Under the test harness (and ?dev=true) mkOutcome throws;
// production runtime stays lenient so an unanticipated shape can't crash a live Run mid-game.
describe('mkOutcome — rejects an off-schema detail (dev/test strict)', () => {
  const _throws = fn => { try { fn(); return false; } catch { return true; } };
  it("throws on a typo'd detail key", () => {
    assert(_throws(() => mkOutcome('uth', -100, 'lose', { antDelta: -50 })), 'expected a throw on the antDelta typo');
  });
  it('throws on an unknown slot', () => {
    assert(_throws(() => mkOutcome('zz', 0, 'x', {})), 'expected a throw on an unknown slot');
  });
  it('accepts the canonical uth detail shape', () => {
    assert(!_throws(() => mkOutcome('uth', 10, 'win', { ante: 50, blind: 50, play: 0, playMult: 1,
      anteDelta: 50, blindDelta: 0, playDelta: 0, playerBest: 'x', dealerBest: 'y', dealerQualifies: true })),
      'canonical uth shape should not throw');
  });
  it('accepts an empty detail (terminal envelope only)', () => {
    assert(!_throws(() => mkOutcome('lad', -100, 'crash')), 'empty detail should not throw');
  });
});

// ─── settledOutcomes + recalcChips — one read path for the score basis ──────────
describe('settledOutcomes — the unified record list', () => {
  it('concatenates the two played slots plus roulette and ladder, in order', () => {
    withRR({
      bjHistory: [{ slot: 'bj', delta: 100, result: 'win' }],
      uthHistory: [{ slot: 'uth', delta: -50, result: 'lose' }],
      rResult: { slot: 'r', delta: 300, result: 'win' },
      ladResult: { slot: 'lad', delta: 220, result: 'cash' },
    }, () => {
      const rounds = settledOutcomes();
      assertEqual(rounds.length, 4);
      assertDeepEqual(rounds.map(r => r.slot), ['bj', 'uth', 'r', 'lad']);
    });
  });
  it('omits roulette/ladder when their singletons are null', () => {
    withRR({ bjHistory: [{ delta: 1 }], uthHistory: [{ delta: 2 }], rResult: null, ladResult: null },
      () => assertEqual(settledOutcomes().length, 2));
  });
});

describe('recalcChips — sums every settled record uniformly', () => {
  it('totals histories + roulette + ladder deltas the same way', () => {
    withRR({
      borrowUsed: false, bjHistory: [{ delta: 100 }], uthHistory: [{ delta: -50 }],
      rResult: { delta: 300 }, ladResult: { delta: 220 },
    }, () => assertEqual(recalcChips(), 1000 + 100 - 50 + 300 + 220));
  });
  it('skips non-finite deltas instead of poisoning the sum', () => {
    withRR({ bjHistory: [{ delta: 100 }, { delta: NaN }, {}], uthHistory: [], rResult: null, ladResult: null },
      () => assertEqual(recalcChips(), 1100));
  });
  it('counts the borrow as part of the starting stack', () => {
    withRR({ borrowUsed: true, borrowAmount: 50, bjHistory: [{ delta: 0 }], uthHistory: [], rResult: null, ladResult: null },
      () => assertEqual(recalcChips(), 1050));
  });
});

// ─── Roulette — win-multiplier folded into one net delta, one credit ──────────
// Regression intent: the multiplier used to be a SECOND credit() on top of the per-bet payouts.
// Folding it into the single delta must leave both the recorded delta and the balance identical.
describe('_resolveRoulette — win-multiplier is one folded delta', () => {
  it('a winMult day records delta×mult and credits stake+delta exactly once', () => {
    withResolve({
      forcedMod: { all_in_or_skip: true }, // winMult() ⇒ 2
      rResult: null, rReSpun: false, rPhase: 'spinning',
      rBets: [{ pick: 14, bet: 100 }], rSpin: 14, chips: 0,
    }, () => {
      _resolveRoulette();
      assertEqual(S.rResult.delta, 7000, 'net delta = (100×35) × 2, folded into one number');
      assertEqual(S.chips, 7100, 'one credit of stake(100) + delta(7000); not double-counted');
      assertEqual(S.rResult.slot, 'r');
      assertEqual(S.rResult.result, 'win');
    });
  });
  it('no-winMult win is unchanged (stake+profit), canonical shape', () => {
    withResolve({
      forcedMod: {}, rResult: null, rReSpun: false, rPhase: 'spinning',
      rBets: [{ pick: 14, bet: 2375 }], rSpin: 14, chips: 0,
    }, () => {
      _resolveRoulette();
      assertEqual(S.rResult.delta, 83125, 'net delta = 2375 × 35');
      assertEqual(S.chips, 85500, 'stake + delta');
      assertEqual(S.rResult.result, 'win');
    });
  });
  it('a losing spin records a negative delta and credits nothing back', () => {
    withResolve({
      forcedMod: {}, rResult: null, rReSpun: false, rPhase: 'spinning',
      rBets: [{ pick: 14, bet: 500 }], rSpin: 7, chips: 0,
    }, () => {
      _resolveRoulette();
      assertEqual(S.rResult.delta, -500);
      assertEqual(S.chips, 0, 'stake + (−stake) = 0');
      assertEqual(S.rResult.result, 'lose');
    });
  });
  it('rSkip records the canonical skipped envelope', () => {
    withResolve({ rResult: null, rPhase: 'respin' }, () => {
      rSkip();
      assertDeepEqual({ slot: S.rResult.slot, delta: S.rResult.delta, result: S.rResult.result, skipped: S.rResult.skipped },
                      { slot: 'r', delta: 0, result: 'skipped', skipped: true });
    });
  });
});

// ─── Each game emits the canonical shape ──────────────────────────────────────
describe('per-game records carry slot/delta/result', () => {
  it('the ladder records {slot:lad, result, rung, free} on cash out', () => {
    withResolve({ screen: null, forcedMod: {}, ladPhase: 'climb', ladBet: 100, ladRung: 3, ladFree: false, ladResult: null, chips: 1000 },
      () => {
        ladCashOut(); // pot = 100 × 3.2 = 320 ⇒ delta 220
        assertDeepEqual({ slot: S.ladResult.slot, delta: S.ladResult.delta, result: S.ladResult.result, rung: S.ladResult.rung, free: S.ladResult.free },
                        { slot: 'lad', delta: 220, result: 'cash', rung: 3, free: false });
      });
  });
  it('5-card poker records {slot:pk, result, bet, pts}', () => {
    withResolve({ screen: 'poker', forcedMod: {}, pkPhase: 'hold', pkBet: 100, pkHand: 0, pkHistory: [], chips: 900,
                  pkCards: DEAL.pokerDecks[0].slice(0, 5), pkHeld: new Set([0, 1, 2, 3, 4]), pkFinal: [] },
      () => {
        pkDraw();
        const h = S.pkHistory[0];
        assertEqual(h.slot, 'pk');
        assertEqual(h.bet, 100);
        assertEqual(typeof h.result, 'string');
        assertEqual(typeof h.delta, 'number');
        assertEqual(typeof h.pts, 'number');
      });
  });
});

// ─── Backward-compat: _normalizeRounds upgrades pre-v1.42 saved records ────────
describe('_normalizeRounds — upgrades legacy records on load', () => {
  it('adds slot to history records and slot/result to the singletons', () => {
    withRR({
      bjHistory: [{ delta: 10 }], uthHistory: [], pkHistory: [],
      rResult: { delta: -100, bets: [] },                          // pre-v1.42: no slot/result
      ladResult: { delta: 0, rung: 3, outcome: 'crash', free: true }, // pre-v1.42: outcome, no result
    }, () => {
      _normalizeRounds();
      assertEqual(S.bjHistory[0].slot, 'bj');
      assertEqual(S.rResult.slot, 'r');
      assertEqual(S.rResult.result, 'lose', 'result inferred from a negative delta');
      assertEqual(S.ladResult.slot, 'lad');
      assertEqual(S.ladResult.result, 'crash', 'ladder outcome → canonical result');
    });
  });
  it('infers the skipped result for an old skipped roulette record', () => {
    withRR({ rResult: { delta: 0, skipped: true }, ladResult: null }, () => {
      _normalizeRounds();
      assertEqual(S.rResult.result, 'skipped');
    });
  });
  it('is idempotent (a second pass leaves canonical records untouched)', () => {
    withRR({ rResult: { delta: 50 }, ladResult: { delta: 0, outcome: 'cash' } }, () => {
      _normalizeRounds();
      const before = JSON.stringify([S.rResult, S.ladResult]);
      _normalizeRounds();
      assertEqual(JSON.stringify([S.rResult, S.ladResult]), before);
    });
  });
});
