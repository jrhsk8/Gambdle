// ─── Run-order (pure next()) tests ────────────────────────────────────────────
// Exercises the pure Run-order resolver next() in core.js directly — no DOM, no S.
// It owns three previously-scattered decisions: the game→game successor, the "stay on
// this game while it has hands left" case, and the ladder_free detour into the free
// bonus round before results. NEXT_SCREEN values are read live so the asserts don't
// couple to a particular GAME1/GAME2 slot config.

// Convenience: the full set of detour facts with the detour ARMED (fires → 'ladder').
const _armed = { ladderFree: 250, ladPlayed: false, rResolved: true, busted: false, borrowUsed: false };

describe('next — game→game Run order', () => {
  it('advances a finished game to its NEXT_SCREEN successor', () => {
    assertEqual(next(GAME1, { handsLeft: false }), NEXT_SCREEN[GAME1], 'GAME1 → its successor');
    assertEqual(next(GAME2, { handsLeft: false }), 'roulette', 'GAME2 → roulette (always last)');
  });
  it('stays on the current game while it still has hands left', () => {
    assertEqual(next(GAME1, { handsLeft: true }), GAME1, 'GAME1 hands left → stay');
    assertEqual(next(GAME2, { handsLeft: true }), GAME2, 'GAME2 hands left → stay');
    assertEqual(next('bj', { handsLeft: true }), 'bj', 'bj hands left → stay');
  });
  it('sends a screen with no successor (roulette / results) to results', () => {
    assertEqual(next('roulette', {}), 'results', 'roulette → results');
    assertEqual(next('results', {}), 'results', 'results → results');
  });
});

describe('next — ladder_free detour', () => {
  it('detours a results-bound finish into the free Ladder round when fully armed', () => {
    assertEqual(next('results', _armed), 'ladder', 'armed detour → ladder');
    assertEqual(next('roulette', _armed), 'ladder', 'roulette→results also detours when armed');
  });
  it('does NOT detour once the bonus round has already run', () => {
    assertEqual(next('results', { ..._armed, ladPlayed: true }), 'results', 'ladPlayed → no detour');
  });
  it('does NOT detour before roulette has resolved', () => {
    assertEqual(next('results', { ..._armed, rResolved: false }), 'results', 'roulette unresolved → no detour');
  });
  it('does NOT detour on a non-bonus day', () => {
    assertEqual(next('results', { ..._armed, ladderFree: 0 }), 'results', 'no ladder_free mod → no detour');
  });
  it('only detours when bust and borrow agree', () => {
    // Clean finish (neither) and borrowed-and-still-busted (both) earn the bonus.
    assertEqual(next('results', { ..._armed, busted: false, borrowUsed: false }), 'ladder', 'clean finish → ladder');
    assertEqual(next('results', { ..._armed, busted: true,  borrowUsed: true  }), 'ladder', 'borrowed+busted → ladder');
    // The two disagreeing states (borrowed-and-recovered, busted-without-borrow) go straight to results.
    assertEqual(next('results', { ..._armed, busted: true,  borrowUsed: false }), 'results', 'busted, never borrowed → results');
    assertEqual(next('results', { ..._armed, busted: false, borrowUsed: true  }), 'results', 'borrowed, recovered → results');
  });
  it('hands-left short-circuits the detour (stay on the current screen)', () => {
    assertEqual(next(GAME1, { ..._armed, handsLeft: true }), GAME1, 'hands left wins over the detour');
  });
});

// ─── Game registry — behaviour-hook interface ─────────────────────────────────
// Every game entry satisfies the SAME behaviour interface: screen/reset/nextHand/resume/patchBet are
// all callable functions (no-op where the game doesn't implement one). This is what lets the lifecycle
// call any hook without a per-hook `?.` guard. The interface IS the test surface — assert it directly.
describe('Game registry — every game has the full behaviour interface', () => {
  const HOOKS = ['screen', 'reset', 'nextHand', 'resume', 'patchBet'];
  for (const key of Object.keys(GAMES)) {
    it(`${key} exposes all ${HOOKS.length} behaviour hooks as functions`, () => {
      for (const h of HOOKS) {
        assertEqual(typeof GAMES[key][h], 'function', `${key}.${h} should be a function`);
      }
    });
  }
  it('single-run games (roulette, ladder) carry a callable no-op reset/nextHand', () => {
    // No-ops must not throw and must return undefined — the borrow/advance flow calls them blind.
    assertEqual(GAMES.ladder.reset(), undefined, 'ladder.reset is a no-op');
    assertEqual(GAMES.roulette.nextHand(), undefined, 'roulette.nextHand is a no-op');
  });
});
