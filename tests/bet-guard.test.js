// ─── Bet-phase guard tests ────────────────────────────────────────────────────
// Verifies that addChip / clearBet / allIn are no-ops outside the bet phase,
// and that *Deal() functions lock the phase immediately to close the race window
// where a delayed touch event could mutate the bet after chips are deducted.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _bgSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _bgSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _bgRestore = () => {
  const r = JSON.parse(_bgSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// Run fn() with S fields merged from overrides, then restore.
function withState(overrides, fn) {
  Object.assign(S, overrides);
  try { fn(); } finally { _bgRestore(); }
}

// ─── _inBetPhase ─────────────────────────────────────────────────────────────

describe('_inBetPhase — only true during the bet phase', () => {
  it('true for bj/bet', () => {
    withState({ screen:'bj', bjPhase:'bet' }, () => assert(_inBetPhase()));
  });
  it('false for bj/dealing', () => {
    withState({ screen:'bj', bjPhase:'dealing' }, () => assert(!_inBetPhase()));
  });
  it('false for bj/play', () => {
    withState({ screen:'bj', bjPhase:'play' }, () => assert(!_inBetPhase()));
  });
  it('false for bj/result', () => {
    withState({ screen:'bj', bjPhase:'result' }, () => assert(!_inBetPhase()));
  });

  it('true for uth/bet', () => {
    withState({ screen:'uth', uthPhase:'bet' }, () => assert(_inBetPhase()));
  });
  it('false for uth/dealing', () => {
    withState({ screen:'uth', uthPhase:'dealing' }, () => assert(!_inBetPhase()));
  });
  it('false for uth/preflop', () => {
    withState({ screen:'uth', uthPhase:'preflop' }, () => assert(!_inBetPhase()));
  });

  it('true for poker/bet', () => {
    withState({ screen:'poker', pkPhase:'bet' }, () => assert(_inBetPhase()));
  });
  it('false for poker/dealing', () => {
    withState({ screen:'poker', pkPhase:'dealing' }, () => assert(!_inBetPhase()));
  });

  it('true for roulette/bet', () => {
    withState({ screen:'roulette', rPhase:'bet' }, () => assert(_inBetPhase()));
  });
  it('false for roulette/spinning', () => {
    withState({ screen:'roulette', rPhase:'spinning' }, () => assert(!_inBetPhase()));
  });
});

// ─── addChip / clearBet / allIn ignore non-bet phases ────────────────────────

describe('addChip — no-op outside bet phase', () => {
  it('does not change bjBet during dealing phase', () => {
    withState({ screen:'bj', bjPhase:'dealing', bjBet:100, chips:900 }, () => {
      addChip(50);
      assertEqual(S.bjBet, 100, 'bjBet must not change during dealing');
    });
  });

  it('does not change uthAnte during dealing phase', () => {
    withState({ screen:'uth', uthPhase:'dealing', uthAnte:200, chips:800 }, () => {
      addChip(100);
      assertEqual(S.uthAnte, 200, 'uthAnte must not change during dealing');
    });
  });

  it('does not change pkBet during dealing phase', () => {
    withState({ screen:'poker', pkPhase:'dealing', pkBet:100, chips:900 }, () => {
      addChip(50);
      assertEqual(S.pkBet, 100, 'pkBet must not change during dealing');
    });
  });

  it('still works normally during bet phase', () => {
    withState({ screen:'bj', bjPhase:'bet', bjBet:0, chips:1000 }, () => {
      addChip(100);
      assertEqual(S.bjBet, 100, 'addChip should work during bet phase');
    });
  });
});

describe('clearBet — no-op outside bet phase', () => {
  it('does not clear uthAnte during dealing phase', () => {
    withState({ screen:'uth', uthPhase:'dealing', uthAnte:300, chips:700 }, () => {
      clearBet();
      assertEqual(S.uthAnte, 300, 'uthAnte must not be cleared during dealing');
    });
  });

  it('still clears during bet phase', () => {
    withState({ screen:'uth', uthPhase:'bet', uthAnte:300, chips:700 }, () => {
      clearBet();
      assertEqual(S.uthAnte, 0, 'clearBet should work during bet phase');
    });
  });
});

describe('allIn — no-op outside bet phase', () => {
  it('does not change uthAnte during dealing phase', () => {
    withState({ screen:'uth', uthPhase:'dealing', uthAnte:200, chips:800 }, () => {
      allIn();
      assertEqual(S.uthAnte, 200, 'uthAnte must not change during dealing');
    });
  });

  it('does not change bjBet during play phase', () => {
    withState({ screen:'bj', bjPhase:'play', bjBet:200, chips:800 }, () => {
      allIn();
      assertEqual(S.bjBet, 200, 'bjBet must not change during play');
    });
  });

  it('still works during bet phase', () => {
    withState({ screen:'bj', bjPhase:'bet', bjBet:0, chips:1000 }, () => {
      allIn();
      assertEqual(S.bjBet, 1000, 'allIn should work during bet phase');
    });
  });
});

// ─── *Deal() locks phase immediately ─────────────────────────────────────────

describe('uthDeal — locks phase before sndShuffle', () => {
  it('sets uthPhase to dealing synchronously before the shuffle callback', () => {
    // Set up a minimal valid bet state. sndShuffle fires its callback
    // asynchronously, so checking phase right after the call catches 'dealing'.
    withState({
      screen:'uth', uthPhase:'bet', uthAnte:100, chips:1000,
      uthHand:0, uthHistory:[],
      uthHole:[], uthDealer:[], uthComm:[],
    }, () => {
      uthDeal();
      assertEqual(S.uthPhase, 'dealing', 'uthPhase should be dealing immediately after uthDeal()');
      // Chips should be deducted right away too.
      assertEqual(S.chips, 900, 'chips deducted synchronously');
    });
  });

  it('does not re-enter when called a second time during dealing', () => {
    withState({
      screen:'uth', uthPhase:'bet', uthAnte:200, chips:1000,
      uthHand:0, uthHistory:[],
      uthHole:[], uthDealer:[], uthComm:[],
    }, () => {
      uthDeal();           // first call: chips → 800, phase → dealing
      uthDeal();           // second call: phase !== 'bet' → returns early
      assertEqual(S.chips, 800, 'chips should only be deducted once');
    });
  });
});

describe('bjDeal — locks phase before sndShuffle', () => {
  it('sets bjPhase to dealing synchronously', () => {
    withState({
      screen:'bj', bjPhase:'bet', bjBet:100, chips:1000,
      bjHand:0, bjHistory:[], bjIdx:0, bjPlayer:[], bjDealer:[],
    }, () => {
      bjDeal();
      assertEqual(S.bjPhase, 'dealing', 'bjPhase should be dealing immediately after bjDeal()');
      assertEqual(S.chips, 900, 'chips deducted synchronously');
    });
  });

  it('does not re-enter when called a second time during dealing', () => {
    withState({
      screen:'bj', bjPhase:'bet', bjBet:200, chips:1000,
      bjHand:0, bjHistory:[], bjIdx:0, bjPlayer:[], bjDealer:[],
    }, () => {
      bjDeal();
      bjDeal(); // second call: phase !== 'bet' → no-op
      assertEqual(S.chips, 800, 'chips should only be deducted once');
    });
  });
});

describe('pkDeal — locks phase before sndShuffle', () => {
  it('sets pkPhase to dealing synchronously', () => {
    withState({ screen:'poker', pkPhase:'bet', pkBet:100, chips:1000, pkHand:0 }, () => {
      pkDeal();
      assertEqual(S.pkPhase, 'dealing', 'pkPhase should be dealing immediately after pkDeal()');
      assertEqual(S.chips, 900, 'chips deducted synchronously');
    });
  });
});

// ─── End-to-end: bet can't be changed after deal fires ────────────────────────

describe('bet mutation race — ante is stable after uthDeal', () => {
  it('allIn after uthDeal does not change uthAnte', () => {
    withState({
      screen:'uth', uthPhase:'bet', uthAnte:200, chips:1000,
      uthHand:0, uthHistory:[],
      uthHole:[], uthDealer:[], uthComm:[],
    }, () => {
      uthDeal();                  // phase → dealing, chips → 800
      allIn();                    // _inBetPhase() === false → no-op
      assertEqual(S.uthAnte, 200, 'uthAnte must not be changed by allIn during dealing');
    });
  });

  it('addChip after uthDeal does not change uthAnte', () => {
    withState({
      screen:'uth', uthPhase:'bet', uthAnte:100, chips:1000,
      uthHand:0, uthHistory:[],
      uthHole:[], uthDealer:[], uthComm:[],
    }, () => {
      uthDeal();                  // phase → dealing, chips → 900
      addChip(500);               // _inBetPhase() === false → no-op
      assertEqual(S.uthAnte, 100, 'uthAnte must not be changed by addChip during dealing');
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_bgSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _bgSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_bgRestore();
