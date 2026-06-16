// ─── Shared Fixture registry ──────────────────────────────────────────────────
// One source of truth mapping each Screen state-name to a Fixture: a setup() that puts
// the global `S` into a representative state, plus optional pinned Modifier (`mod`),
// settle hint (`settle`, ms), `afterRender` hook, and `group` label.
//
// Loadable two ways, both with zero build step:
//   • Browser <script src="screen-fixtures.js"> — the UI Lab frame and the layout-test
//     harness load it after the game scripts, so SCREEN_FIXTURES / renderFixture become
//     page globals that reference S, card(), bestOf7(), render(), etc.
//   • Injected into a headless Playwright page — the Chromium/WebKit screenshot scripts
//     fs.read this whole file and page.addScriptTag({content}) it, then call
//     renderFixture(name, opts) by name. (addScriptTag runs as a classic script, so the
//     top-level declarations attach to the page's global scope just like a <script>.)
//
// COVERAGE is the union of both screenshot scripts' states PLUS the worst-case states the
// layout suite exercises (2-/3-/4-way splits), so the lab, the screenshots, and the
// Layout DSL all draw from one place and can never drift. See PRD-ui-tweak-pipeline.md.
//
// A Fixture's setup() sets S fields ONLY — it never touches S.forcedMod. The active
// Modifier is owned by renderFixture: it applies `opts.mod ?? fixture.mod ?? opts.defaultMod`
// after setup so the modifier is authoritative. States that REQUIRE a specific modifier
// (ladder day, Player's Choice) pin it via the fixture's `mod` field.

(function (root) {
  'use strict';

  // Card-array helpers mirror the inline screenshot fixtures: card() and bestOf7() are
  // page globals (core.js / uth.js), so these closures resolve them lazily at setup time.
  const SCREEN_FIXTURES = {
    // ── General ──────────────────────────────────────────────────────────────
    'intro': {
      group: 'General',
      setup: () => { S.screen = 'intro'; S.chips = 1000; },
    },
    'choice': {
      group: 'General', mod: 'players_choice',
      setup: () => { S.screen = 'choice'; S.pcPick = null; S.chips = 1000; },
    },
    'borrow': {
      group: 'General',
      setup: () => { S.screen = 'borrow'; S.chips = 0; S.borrowReturnScreen = 'uth'; },
    },

    // ── Blackjack ────────────────────────────────────────────────────────────
    'bj-bet': {
      group: 'Blackjack',
      setup: () => { S.screen = 'bj'; S.bjPhase = 'bet'; S.chips = 1000; S.bjBet = 50; S.bjHand = 0; S.bjHistory = []; },
    },
    'bj-play': {
      group: 'Blackjack',
      // Mid-play: A♠ 10♥ 3♦ (soft 14) vs dealer Q♣ 7♠ down — a hand you'd hit.
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'play'; S.chips = 950; S.bjBet = 50; S.bjHand = 0; S.bjHistory = [];
        S.bjPlayer = [card('A','s'), card('10','h'), card('3','d')];
        S.bjDealer = [card('Q','c'), card('7','s')];
        S.bjDealerReveal = false; S.bjSplit = false;
      },
    },
    'bj-result': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 900; S.bjBet = 50; S.bjHand = 1; S.bjSplit = false; S.bjDealerReveal = true;
        S.bjPlayer = [card('K','s'), card('9','h')];
        S.bjDealer = [card('10','d'), card('8','c'), card('3','s')];
        S.bjResult = { result: 'win', delta: 50 };
        S.bjHistory = [{ bet: 50, result: 'win', delta: 50, player: [...S.bjPlayer], dealer: [...S.bjDealer] }];
      },
    },
    // Last hand of 3 → the inter-game advance button ("Round 2: Hold'em →"), the longest single-button label.
    'bj-result-last': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 900; S.bjBet = 50; S.bjHand = 3; S.bjSplit = false; S.bjDealerReveal = true;
        S.bjPlayer = [card('K','s'), card('9','h')];
        S.bjDealer = [card('10','d'), card('8','c'), card('3','s')];
        S.bjResult = { result: 'win', delta: 50 };
        S.bjHistory = [{ bet: 50, result: 'win', delta: 50, player: [...S.bjPlayer], dealer: [...S.bjDealer] }];
      },
    },
    // 4-way split result, mixed outcomes (win/lose/push/win) — the original WebKit review state.
    'bj-split-result': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 1050; S.bjBet = 50; S.bjHand = 1; S.bjSplit = true; S.bjDealerReveal = true;
        S.bjSplitHands = [[card('8','s'),card('K','h')], [card('8','h'),card('9','d')], [card('8','d'),card('Q','c')], [card('8','c'),card('J','s')]];
        S.bjSplitResults = [{ result:'win',delta:50,bet:50 }, { result:'lose',delta:-50,bet:50 }, { result:'push',delta:0,bet:50 }, { result:'win',delta:50,bet:50 }];
        S.bjSplitBets = [50, 50, 50, 50];
        S.bjDealer = [card('10','d'), card('9','c')];
        S.bjResult = { result: 'split', delta: 50 };
        S.bjHistory = [{ bet: 200, result: 'split', delta: 50, player: S.bjSplitHands.map(h => [...h]), dealer: [...S.bjDealer] }];
      },
    },

    // Worst-case split states the layout suite exercises (not in the screenshot sets, but
    // available to the Layout DSL). 2-/3-hand splits get larger cards than the 4-way cap.
    'bj-split-2': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'play'; S.chips = 700; S.bjBet = 100; S.bjHand = 0; S.bjHistory = [];
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')];
        S.bjSplit = true; S.bjSplitActive = 0;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('9','h')]];
        S.bjSplitBets = [100, 100]; S.bjSplitDone = [false, false];
        S.bjSplitDoubled = [false, false]; S.bjSplitAnimFrom = [0, 0];
      },
    },
    'bj-split-3': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'play'; S.chips = 650; S.bjBet = 100; S.bjHand = 0; S.bjHistory = [];
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')];
        S.bjSplit = true; S.bjSplitActive = 1;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('9','h')], [card('K','s'),card('9','h')]];
        S.bjSplitBets = [100, 100, 100]; S.bjSplitDone = [true, false, false];
        S.bjSplitDoubled = [false, false, false]; S.bjSplitAnimFrom = [0, 0, 0];
      },
    },
    'bj-split-4': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'play'; S.chips = 600; S.bjBet = 100; S.bjHand = 0; S.bjHistory = [];
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')];
        S.bjSplit = true; S.bjSplitActive = 2;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('Q','h'),card('5','d')], [card('K','s'),card('9','h')], [card('K','s'),card('9','h')]];
        S.bjSplitBets = [100, 100, 100, 100]; S.bjSplitDone = [true, true, false, false];
        S.bjSplitDoubled = [false, false, false, false]; S.bjSplitAnimFrom = [0, 0, 0, 0];
      },
    },
    'bj-result-split-2': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 1050; S.bjHand = 1; S.bjBet = 200;
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')]; S.bjDealerAnimFrom = 0; S.bjSplit = true;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('Q','h'),card('5','d')]];
        S.bjSplitBets = [100, 100];
        S.bjSplitResults = [{ result:'win',delta:100,bet:100 }, { result:'bust',delta:-100,bet:100 }];
        S.bjResult = { result: 'split', delta: 0 };
        S.bjHistory = [{ bet: 200, result: 'split', delta: 0, player: [], dealer: [] }];
      },
    },
    'bj-result-split-3': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 1050; S.bjHand = 1; S.bjBet = 300;
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')]; S.bjDealerAnimFrom = 0; S.bjSplit = true;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('Q','h'),card('5','d')], [card('A','s'),card('K','d')]];
        S.bjSplitBets = [100, 100, 100];
        S.bjSplitResults = [{ result:'win',delta:100,bet:100 }, { result:'bust',delta:-100,bet:100 }, { result:'blackjack',delta:150,bet:100 }];
        S.bjResult = { result: 'split', delta: 150 };
        S.bjHistory = [{ bet: 300, result: 'split', delta: 150, player: [], dealer: [] }];
      },
    },
    'bj-result-split-4': {
      group: 'Blackjack',
      setup: () => {
        S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 1050; S.bjHand = 1; S.bjBet = 400;
        S.bjPlayer = []; S.bjDealer = [card('7','d'), card('J','c')]; S.bjDealerAnimFrom = 0; S.bjSplit = true;
        S.bjSplitHands = [[card('K','s'),card('9','h')], [card('K','s'),card('Q','h'),card('5','d')], [card('K','s'),card('9','h')], [card('A','s'),card('K','d')]];
        S.bjSplitBets = [100, 100, 100, 100];
        S.bjSplitResults = [
          { result:'win',delta:100,bet:100 }, { result:'bust',delta:-100,bet:100 },
          { result:'win',delta:100,bet:100 }, { result:'blackjack',delta:150,bet:100 },
        ];
        S.bjResult = { result: 'split', delta: 250 };
        S.bjHistory = [{ bet: 400, result: 'split', delta: 250, player: [], dealer: [] }];
      },
    },

    // ── Ultimate Texas Hold'em ─────────────────────────────────────────────────
    'uth-bet': {
      group: "Hold'em",
      setup: () => { S.screen = 'uth'; S.uthPhase = 'bet'; S.chips = 1000; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = []; },
    },
    'uth-preflop': {
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'preflop'; S.chips = 1200; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = [];
        S.uthHole = [card('A','s'), card('K','d')]; S.uthDealer = [card('2','c'), card('7','h')];
        S.uthComm = [card('8','h'), card('6','s'), card('Q','h'), card('5','d'), card('A','d')];
        S.uthRevealComm = 0; S.uthRaised = false;
      },
    },
    'uth-flop': {
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'flop'; S.chips = 1100; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = [];
        S.uthHole = [card('A','s'), card('K','d')]; S.uthDealer = [card('2','c'), card('7','h')];
        S.uthComm = [card('8','h'), card('6','s'), card('Q','h'), card('5','d'), card('A','d')];
        S.uthRevealComm = 3; S.uthRaised = false;
      },
    },
    'uth-turn': {
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'turn'; S.chips = 1100; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = [];
        S.uthHole = [card('A','s'), card('K','d')]; S.uthDealer = [card('2','c'), card('7','h')];
        S.uthComm = [card('8','h'), card('6','s'), card('Q','h'), card('5','d'), card('A','d')];
        S.uthRevealComm = 5; S.uthRaised = false;
      },
    },
    'uth-reveal': {
      // The transient "Dealer Reveals" frame (auto-advances to the result after ~2.3s). Pinned fully
      // revealed so the lab/screenshots can review a screen that otherwise never sits still.
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'reveal'; S.chips = 1100; S.uthAnte = 100; S.uthHand = 1;
        S.uthHole = [card('A','s'), card('K','d')]; S.uthDealer = [card('2','c'), card('7','h')];
        S.uthComm = [card('8','h'), card('6','s'), card('Q','h'), card('5','d'), card('A','d')];
        S.uthRevealComm = 5; S.uthPrevRevealComm = 5; S.uthRaised = true;
        S.uthHistory = [{ ante:50, blind:50, play:100, playMult:1, result:'win', delta:200, anteDelta:50, blindDelta:0, playDelta:100, playerBest:null, dealerBest:null, dealerQualifies:true }];
      },
    },
    'uth-showdown': {
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'result'; S.chips = 1100; S.uthHand = 1;
        S.uthHole = [card('A','s'), card('K','d')]; S.uthDealer = [card('2','c'), card('7','h')];
        S.uthComm = [card('A','h'), card('K','s'), card('Q','h'), card('5','d'), card('3','c')];
        const pb = bestOf7([...S.uthHole, ...S.uthComm]), db = bestOf7([...S.uthDealer, ...S.uthComm]);
        S.uthHistory = [{ ante:50, blind:50, play:100, playMult:1, result:'win', delta:200, anteDelta:50, blindDelta:0, playDelta:100, playerBest:pb, dealerBest:db, dealerQualifies:true }];
      },
    },
    'uth-fold': {
      group: "Hold'em",
      setup: () => {
        S.screen = 'uth'; S.uthPhase = 'result'; S.chips = 900; S.uthHand = 1;
        S.uthHole = [card('7','h'), card('2','c')]; S.uthDealer = [card('A','c'), card('K','h')];
        S.uthComm = [card('A','d'), card('K','d'), card('Q','s'), card('5','d'), card('3','c')];
        S.uthHistory = [{ ante:50, blind:50, play:0, playMult:0, result:'fold', delta:-100, anteDelta:-50, blindDelta:-50, playDelta:0, playerBest:null, dealerBest:null, dealerQualifies:false }];
      },
    },

    // ── Roulette ───────────────────────────────────────────────────────────────
    'roulette-bet': {
      group: 'Roulette',
      setup: () => { S.screen = 'roulette'; S.rPhase = 'bet'; S.chips = 450; S.rBet = 50; S.rPick = 17; S.rBets = [{ pick:45, bet:50 }]; },
    },
    'roulette-bet-max': {
      group: 'Roulette',
      setup: () => { S.screen = 'roulette'; S.rPhase = 'bet'; S.chips = 750; S.rBet = 0; S.rPick = null; S.rBets = [{ pick:45,bet:50 },{ pick:17,bet:50 },{ pick:40,bet:50 },{ pick:2,bet:50 },{ pick:31,bet:50 }]; },
    },
    'roulette-spinning': {
      group: 'Roulette',
      // The wheel face is painted by rSpin, not render(); afterRender draws it onto the
      // canvas render() just created (replaces the old setTimeout(drawStaticWheel,0) trick).
      afterRender: () => { if (typeof drawStaticWheel === 'function') drawStaticWheel(); },
      setup: () => { S.screen = 'roulette'; S.rPhase = 'spinning'; S.chips = 0; S.rSpin = 17; S.rBets = [{ pick:45,bet:50 },{ pick:17,bet:50 },{ pick:40,bet:50 },{ pick:2,bet:50 },{ pick:31,bet:50 }]; },
    },
    'roulette-result': {
      group: 'Roulette',
      setup: () => { S.screen = 'roulette'; S.rPhase = 'result'; S.chips = 900; S.rSpin = 17; S.rResult = { delta:350, bets:[{ pick:17, won:true, delta:350, pay:35, bet:10 }] }; },
    },

    // ── Final results ──────────────────────────────────────────────────────────
    'results': {
      group: 'General', settle: 900,
      // The score-distribution chart loads async from Supabase. afterRender paints the same
      // canned community distribution the screenshot mocks serve, so the chart renders fully
      // offline (in the lab and the layout suite) and matches the screenshot content.
      afterRender: () => {
        const el = document.getElementById('dist-chart');
        if (el && typeof _renderScoreDist === 'function') _renderScoreDist(el, [3, 5, 8, 12, 9, 4, 2]);
      },
      setup: () => {
        S.screen = 'results'; S.chips = 1450; S.bjHand = 3; S.uthHand = 3;
        S.bjHistory = [{ delta:200 }, { delta:-50 }, { delta:100 }];
        S.uthHistory = [{ delta:150 }, { delta:-100 }, { delta:0 }];
        S.rResult = { delta:150, bets:[{ pick:17, won:true, delta:150, pay:35, bet:10 }] };
      },
    },

    // ── The Ladder (ladder_day bonus round) ────────────────────────────────────
    'ladder-bet-free': {
      group: 'The Ladder', mod: 'ladder_day',
      setup: () => { S.screen = 'ladder'; S.ladPhase = 'bet'; S.ladBet = 0; S.ladFree = false; S.ladIdx = 0; S.ladRung = 0; S.ladResult = null; S.chips = 1000; },
    },
    'ladder-climb': {
      group: 'The Ladder', mod: 'ladder_day',
      setup: () => { S.screen = 'ladder'; S.ladPhase = 'climb'; S.ladBet = 250; S.ladFree = true; S.ladIdx = 3; S.ladRung = 3; S.ladResult = null; S.chips = 1000; },
    },
    'ladder-crash': {
      group: 'The Ladder', mod: 'ladder_day',
      setup: () => { S.screen = 'ladder'; S.ladPhase = 'done'; S.ladBet = 250; S.ladFree = true; S.ladIdx = 4; S.ladRung = 3; S.ladResult = { delta:0, rung:3, result:'crash', free:true }; S.chips = 1000; },
    },
    'ladder-cash': {
      group: 'The Ladder', mod: 'ladder_day',
      setup: () => { S.screen = 'ladder'; S.ladPhase = 'done'; S.ladBet = 250; S.ladFree = true; S.ladIdx = 4; S.ladRung = 4; S.ladResult = { delta:1250, rung:4, result:'cash', free:true }; S.chips = 2250; },
    },
  };

  // Clean baseline of S, captured once on first renderFixture() call. pkHeld is a Set, so
  // it's snapshotted as an array and rebuilt on every reset (JSON can't carry a Set).
  let _baselineJSON = null;

  // resets S to baseline → runs setup() → applies the resolved Modifier → render() →
  // afterRender(). The reset-and-render dance, written once.
  //
  // opts:
  //   mod        — explicit Modifier override (preset key string, raw object, or {} for
  //                "no modifier / no banner"). `null`/missing falls through to the fixture.
  //   defaultMod — consumer's fallback Modifier when neither opts.mod nor fixture.mod is set
  //                (screenshots: 'easy_dealer'; layout suite: 'bj_wild_split'; lab: {}).
  //   afterRender— extra hook run after the fixture's own afterRender (consumer-specific).
  function renderFixture(name, opts) {
    opts = opts || {};
    const fx = SCREEN_FIXTURES[name];
    if (!fx) throw new Error('renderFixture: unknown fixture "' + name + '"');

    if (_baselineJSON === null) _baselineJSON = JSON.stringify({ ...S, pkHeld: [...(S.pkHeld || [])] });
    const base = JSON.parse(_baselineJSON);
    base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base);

    fx.setup();

    // opts.mod ?? fixture.mod ?? opts.defaultMod — '`mod` in opts/fixture' lets an explicit
    // {} or null win over the fallback (so the lab can force "no modifier").
    const mod = ('mod' in opts) ? opts.mod
              : ('mod' in fx)   ? fx.mod
              : opts.defaultMod;
    S.forcedMod = (mod == null) ? {} : mod;

    if (typeof saveState === 'function') saveState();
    render();
    if (fx.afterRender) fx.afterRender();
    if (opts.afterRender) opts.afterRender();
    return fx;
  }

  root.SCREEN_FIXTURES = SCREEN_FIXTURES;
  root.renderFixture = renderFixture;
})(typeof window !== 'undefined' ? window : this);
