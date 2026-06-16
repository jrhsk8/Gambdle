// ─── Bet-intake (pure core) tests ─────────────────────────────────────────────
// Exercises the pure bet-cap / all-in math in src/bet.js directly — no DOM, no S, no
// fake clicks. Each case reads as a table of (game, chips, modifiers) → expected stake.
// The bet-phase guard around the live handlers is covered separately in bet-guard.test.js.

// ─── maxFor — the per-game cap ─────────────────────────────────────────────────
describe('maxFor — per-game stake cap', () => {
  it('lets bj / poker / roulette stake the whole stack', () => {
    assertEqual(maxFor('bj', 1000, {}), 1000, 'bj caps at the full stack');
    assertEqual(maxFor('poker', 1000, {}), 1000, 'poker caps at the full stack');
    assertEqual(maxFor('roulette', 1000, {}), 1000, 'roulette caps at the full stack');
    assertEqual(maxFor('bj', 0, {}), 0, 'an empty stack caps at 0');
  });

  it('caps UTH at floor(chips * 2/3) so a 1x raise is always affordable', () => {
    assertEqual(maxFor('uth', 1000, {}), 666, '1000 → 666');
    assertEqual(maxFor('uth', 1001, {}), 667, '1001 → 667');
    assertEqual(maxFor('uth', 3, {}), 2, '3 → 2');
    assertEqual(maxFor('uth', 2, {}), 1, '2 → 1');
    assertEqual(maxFor('uth', 1, {}), 0, '1 → 0 (no whole-chip 2/3)');
    assertEqual(maxFor('uth', 0, {}), 0, '0 → 0');
  });

  it('caps the Ladder at its 25% rule when no free-entry stake is set', () => {
    assertEqual(maxFor('ladder', 1000, {}), 250, '1000 → 250');
    assertEqual(maxFor('ladder', 200, {}), 50, '200 → 50');
    assertEqual(maxFor('ladder', 100, {}), 25, '100 → 25 (floor)');
    assertEqual(maxFor('ladder', 80, {}), 25, '80 → 25 (20 < 25 floor)');
    assertEqual(maxFor('ladder', 10, {}), 10, '10 → 10 (never above the stack)');
    assertEqual(maxFor('ladder', 1000, { ladderFree: 0 }), 250, 'falsy ladderFree falls through to the cap');
  });

  it('locks the Ladder to the free-entry stake on a ladder_free day, ignoring the stack', () => {
    assertEqual(maxFor('ladder', 1000, { ladderFree: 250 }), 250, 'free stake wins over the 25% cap');
    assertEqual(maxFor('ladder', 10, { ladderFree: 250 }), 250, 'free stake ignores a tiny stack');
  });
});

// ─── ladderMaxStake — the raw 25% cap shared with ladder.js ────────────────────
describe('ladderMaxStake — 25% of stack, floored at 25, never above the stack', () => {
  it('returns 25% of the stack above the floor', () => {
    assertEqual(ladderMaxStake(1000), 250, '1000 → 250');
    assertEqual(ladderMaxStake(200), 50, '200 → 50');
  });
  it('floors at 25 chips', () => {
    assertEqual(ladderMaxStake(100), 25, '100 → 25 (25% == floor)');
    assertEqual(ladderMaxStake(80), 25, '80 → 25 (20 < floor)');
  });
  it('never exceeds the stack itself', () => {
    assertEqual(ladderMaxStake(10), 10, '10 → 10 (cap floor 25 > stack)');
    assertEqual(ladderMaxStake(0), 0, '0 → 0');
  });
});

// ─── addToBet — clamp into [0, max] ────────────────────────────────────────────
describe('addToBet — adds a chip, clamped into [0, max]', () => {
  it('adds the chip value below the cap', () => {
    assertEqual(addToBet(0, 100, 1000), 100, '0 + 100 → 100');
    assertEqual(addToBet(500, 25, 1000), 525, '500 + 25 → 525');
  });
  it('never exceeds the cap', () => {
    assertEqual(addToBet(900, 200, 1000), 1000, '900 + 200 clamps to 1000');
    assertEqual(addToBet(950, 50, 1000), 1000, 'lands exactly on the cap');
    assertEqual(addToBet(1000, 50, 1000), 1000, 'already at the cap stays put');
  });
  it('never drops below zero (defensive lower clamp)', () => {
    assertEqual(addToBet(0, -100, 1000), 0, 'a negative delta can never go below 0');
  });
});

// ─── clearedBet ────────────────────────────────────────────────────────────────
describe('clearedBet — always zero', () => {
  it('returns 0', () => assertEqual(clearedBet(), 0, 'cleared bet is 0'));
});

// ─── allInAmount — the all-in stake ────────────────────────────────────────────
describe('allInAmount — stakes the cap per game', () => {
  it('matches maxFor for every game today', () => {
    for (const g of ['bj', 'uth', 'poker', 'roulette', 'ladder']) {
      assertEqual(allInAmount(g, 1000, {}), maxFor(g, 1000, {}), `${g}: all-in == cap`);
    }
  });
  it('stakes the whole stack on bj and 2/3 on uth', () => {
    assertEqual(allInAmount('bj', 1000, {}), 1000, 'bj all-in = full stack');
    assertEqual(allInAmount('uth', 1000, {}), 666, 'uth all-in = 2/3 cap');
  });
  it('respects the Ladder free-entry stake', () => {
    assertEqual(allInAmount('ladder', 1000, { ladderFree: 250 }), 250, 'free-entry all-in = locked stake');
    assertEqual(allInAmount('ladder', 1000, {}), 250, '25% cap all-in');
  });
});
