// ─── Layout smoke tests ───────────────────────────────────────────────────────
// Mobile (375×812): window must not extend past viewport edges.
// Desktop (1280×800): window has fixed height = 100svh - 20px, so it never
//   overflows the viewport. The real check is that panel content fits without
//   scrolling — panel.scrollHeight must not exceed panel.clientHeight.

section(`Layout [${window.innerWidth}×${window.innerHeight}]`);

// ─── Setup ────────────────────────────────────────────────────────────────────
const _ltSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _ltSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _ltRestore = () => {
  const r = JSON.parse(_ltSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

const VERT_TOL        = 10; // px — mobile window overflow tolerance
const HORIZ_TOL       =  2; // px
const PANEL_SCROLL_TOL=  5; // px — desktop panel scroll tolerance

const _isDesktop = () => window.innerWidth >= 1024;

// Merges clean state with overrides, renders, checks bounds, restores.
// afterRender (optional) runs after render() but before measurement — used to
// force async content (e.g. the score-distribution chart) to render synchronously
// so its real height is measured.
function checkScreen(label, overrides, afterRender) {
  const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
  Object.assign(S, base, overrides);
  render();
  if (afterRender) afterRender();

  const win = document.querySelector('.window');
  assert(win !== null, `${label}: .window not found`);

  const rect = win.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const horizOver = rect.right - vw;

  const panel = document.querySelector('.panel');
  const panelRect = panel ? panel.getBoundingClientRect() : null;
  const kids = panel ? [...panel.children].filter(el => el.getBoundingClientRect().height > 0) : [];
  const lastKid = kids[kids.length - 1];
  const mod = panel ? panel.querySelector('.mod-banner') : null;
  if (mod && panelRect) {
    const modTop = Math.round(mod.getBoundingClientRect().top - panelRect.top);
    const maxTop = _isDesktop() ? 16 : 12;
    assert(modTop <= maxTop, `${label}: modifier banner shifted down ${modTop}px from panel top`);
  }

  if (_isDesktop()) {
    // Desktop: window is fixed height — check that panel content doesn't scroll.
    const panelScroll = panel ? Math.round(panel.scrollHeight - panel.clientHeight) : 0;
    const lastBottom = lastKid && panelRect ? Math.round(lastKid.getBoundingClientRect().bottom - panelRect.top) : 0;
    const panelSlack = panelRect ? Math.round(panelRect.height - lastBottom) : 0;
    measure(label, panelScroll > 0 ? -panelScroll : panelSlack);
    assert(panelScroll <= PANEL_SCROLL_TOL,
      `panel scrolls by ${panelScroll}px — reduce content to fit fixed desktop window`);
  } else {
    // Mobile: the window is CSS-capped at 100svh (.app max-height + .window
    // overflow:hidden), so its own box never reports overflow. The real failure
    // mode is panel content spilling under the status bar (the XP taskbar) — the
    // panel is flex:1 with min-height:0, so over-tall content overflows its box
    // and overlaps the status bar that follows it. Assert the last panel child
    // sits above the status bar, not merely inside the viewport.
    const vertOver = rect.bottom - vh;
    const sb = document.querySelector('.status-bar');
    const sbTop = sb ? Math.round(sb.getBoundingClientRect().top) : vh;
    const lastBottom = lastKid ? Math.round(lastKid.getBoundingClientRect().bottom) : -1;
    measure(label, sbTop - lastBottom);
    assert(vertOver <= VERT_TOL,
      `vertical overflow by ${Math.round(vertOver)}px — bottom=${Math.round(rect.bottom)} viewport=${vh}`);
    assert(lastBottom <= sbTop + VERT_TOL,
      `content overflows into status bar by ${lastBottom - sbTop}px — last child bottom=${lastBottom}, status-bar top=${sbTop}`);
  }

  assert(horizOver <= HORIZ_TOL,
    `horizontal overflow by ${Math.round(horizOver)}px — right=${Math.round(rect.right)} viewport=${vw}`);

  _ltRestore();
}

// ─── Card fixtures ────────────────────────────────────────────────────────────
const _h = (...specs) => specs.map(([r, s]) => card(r, s));

const _bjPair   = _h(['K','s'],['9','h']);
const _bjBust   = _h(['K','s'],['Q','h'],['5','d']);
const _bjBJ     = _h(['A','s'],['K','d']);
const _bjDealer = _h(['7','d'],['J','c']);

const _uthComm   = _h(['K','s'],['Q','c'],['J','s'],['J','d'],['8','h']);
const _uthHole   = _h(['A','s'],['A','c']);
const _uthDlrCds = _h(['2','d'],['7','h']);
const _pb = bestOf7([..._uthHole,   ..._uthComm]);
const _db = bestOf7([..._uthDlrCds, ..._uthComm]);

const _winEntry  = { ante:50,blind:50,play:200,playMult:4,result:'win', delta:350, anteDelta:50,  blindDelta:150, playDelta:200,  playerBest:_pb,dealerBest:_db,dealerQualifies:true };
const _loseEntry = { ante:50,blind:50,play:200,playMult:4,result:'lose',delta:-300,anteDelta:-50, blindDelta:-50, playDelta:-200, playerBest:_db,dealerBest:_pb,dealerQualifies:true };
const _foldEntry = { ante:50,blind:50,play:0,  playMult:0,result:'fold',delta:-100,anteDelta:-50, blindDelta:-50, playDelta:0,    playerBest:null,dealerBest:null,dealerQualifies:false };
const _pkCards   = _h(['A','s'],['A','d'],['K','s'],['Q','c'],['J','h']);

// ─── Intro ────────────────────────────────────────────────────────────────────
describe('layout — intro', () => {
  it('fits viewport', () => checkScreen('intro', { screen:'intro' }));
});

// ─── Blackjack ────────────────────────────────────────────────────────────────
describe('layout — BJ screens', () => {
  it('bet phase fits viewport', () => checkScreen('bj-bet', {
    screen:'bj', bjPhase:'bet', chips:1000, bjBet:0, bjHand:0, bjHistory:[],
  }));

  it('chip selector stays on a single row on the bet screen', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, { screen:'bj', bjPhase:'bet', chips:1000, bjBet:0, bjHand:0, bjHistory:[] });
    render();
    const chips = [...document.querySelectorAll('.chip-row .chbtn')];
    assert(chips.length >= 2, `bj-bet-chips: expected ≥2 chips, got ${chips.length}`);
    const firstTop = chips[0].getBoundingClientRect().top;
    for (const c of chips) {
      const t = c.getBoundingClientRect().top;
      assert(Math.abs(t - firstTop) < 5,
        `bj-bet-chips: chip wrapped to a new row — top ${Math.round(t)} vs first ${Math.round(firstTop)} (denomination ${c.dataset.v})`);
    }
  });

  it('play — normal hand fits viewport', () => checkScreen('bj-play', {
    screen:'bj', bjPhase:'play', chips:900,
    bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:_bjPair, bjDealer:_bjDealer,
  }));

  it('play — 4-way split fits viewport', () => checkScreen('bj-split-4', {
    screen:'bj', bjPhase:'play', chips:600, bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:[], bjDealer:_bjDealer,
    bjSplit:true, bjSplitActive:2,
    bjSplitHands:[_bjPair,_bjBust,_bjPair,_bjPair],
    bjSplitBets:[100,100,100,100],
    bjSplitDone:[true,true,false,false],
    bjSplitDoubled:[false,false,false,false],
    bjSplitAnimFrom:[0,0,0,0],
  }));

  it('result — win fits viewport', () => checkScreen('bj-result-win', {
    screen:'bj', bjPhase:'result', chips:1100, bjHand:1,
    bjBet:100, bjPlayer:_bjPair, bjDealer:_bjDealer,
    bjResult:{ result:'win', delta:100 },
    bjHistory:[{ bet:100,result:'win',delta:100,player:[],dealer:[] }],
  }));

  it('result — 4-way split fits viewport', () => checkScreen('bj-result-split-4', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:400, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0,
    bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust, _bjPair, _bjBJ],
    bjSplitBets:[100,100,100,100],
    bjSplitResults:[
      { result:'win',       delta:100,  bet:100 },
      { result:'bust',      delta:-100, bet:100 },
      { result:'win',       delta:100,  bet:100 },
      { result:'blackjack', delta:150,  bet:100 },
    ],
    bjResult:{ result:'split', delta:250 },
    bjHistory:[{ bet:400,result:'split',delta:250,player:[],dealer:[] }],
  }));
});

// ─── UTH ─────────────────────────────────────────────────────────────────────
describe('layout — UTH screens', () => {
  const _uthBase = {
    screen:'uth', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0,
    uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm,
    uthRaised:false, uthRevealComm:0, uthPrevRevealComm:0, uthHand:0, uthHistory:[],
  };

  it('bet phase fits viewport',   () => checkScreen('uth-bet',     { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:0 }));

  it('bet summary stays on one line at every bet size', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    for (const ante of [10, 100, 1000, 10000, 100000, 999999]) {
      Object.assign(S, base, { screen:'uth', uthPhase:'bet', chips:ante, uthAnte:ante, uthHand:0, uthHistory:[] });
      render();
      const summary = document.querySelector('#uth-summary');
      assert(summary !== null, `uth-bet-summary: #uth-summary not found at ante=${ante}`);
      const inner = summary.querySelector('span') || summary;
      const height = inner.getBoundingClientRect().height;
      const fontSize = parseFloat(getComputedStyle(inner).fontSize);
      // A single line of text is ≤ ~1.6× font-size. 2× catches any wrap to 2+ lines.
      assert(height <= fontSize * 2,
        `uth-bet-summary: text wraps at ante=${ante} — height ${Math.round(height)}px vs font-size ${Math.round(fontSize)}px (content: "${inner.textContent}")`);
    }
    _ltRestore();
  });

  it('blind pay table has a positive gap below it', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:0, uthHand:0, uthHistory:[] });
    render();
    const panel = document.querySelector('.panel');
    const ptable = document.querySelector('.ptable');
    assert(panel && ptable, 'uth-bet-gap: panel or .ptable not found');
    const panelRect = panel.getBoundingClientRect();
    const ptableRect = ptable.getBoundingClientRect();
    const gap = Math.round(panelRect.bottom - ptableRect.bottom);
    // Require at least 4px between the bottom of the pay table and the bottom of
    // the panel (matches the breathing room around other panel sections).
    assert(gap >= 4,
      `uth-bet-gap: only ${gap}px between ptable bottom and panel bottom (need ≥ 4px)`);
  });

  it('chip selector stays on a single row on the bet screen', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:0, uthHand:0, uthHistory:[] });
    render();
    const chips = [...document.querySelectorAll('.chip-row .chbtn')];
    assert(chips.length >= 2, `uth-bet-chips: expected ≥2 chips, got ${chips.length}`);
    const firstTop = chips[0].getBoundingClientRect().top;
    for (const c of chips) {
      const t = c.getBoundingClientRect().top;
      assert(Math.abs(t - firstTop) < 5,
        `uth-bet-chips: chip wrapped to a new row — top ${Math.round(t)} vs first ${Math.round(firstTop)} (denomination ${c.dataset.v})`);
    }
  });

  it('progress dots stay on one line on the bet screen', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:0, uthHand:0, uthHistory:[] });
    render();
    const dots = [...document.querySelectorAll('#uth-dots-container .hand-dot')];
    assert(dots.length === 3, `uth-bet-dots: expected 3 hand-dots, got ${dots.length}`);
    for (const dot of dots) {
      const cs = getComputedStyle(dot);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const contentH = dot.getBoundingClientRect().height - pad;
      // Allow some sub-pixel tolerance — 1.5× line-height still counts as one line.
      const lines = Math.round(contentH / lineHeight);
      assert(lines <= 1,
        `uth-bet-dots: dot wraps to ${lines} lines — content height ${Math.round(contentH)}px / line-height ${Math.round(lineHeight)}px (content: "${dot.textContent}")`);
    }
    _ltRestore();
  });

  it('preflop fits viewport',     () => checkScreen('uth-preflop', { ..._uthBase, uthPhase:'preflop' }));
  it('flop fits viewport',        () => checkScreen('uth-flop',    { ..._uthBase, uthPhase:'flop', uthRevealComm:3 }));
  it('turn fits viewport',        () => checkScreen('uth-turn',    { ..._uthBase, uthPhase:'turn', uthRevealComm:5 }));

  it('result — win (showdown) fits viewport', () => checkScreen('uth-result-win', {
    ..._uthBase, uthPhase:'result', uthRevealComm:5, uthHand:1,
    uthHistory:[_winEntry],
  }));

  it('result — lose fits viewport', () => checkScreen('uth-result-lose', {
    ..._uthBase, uthPhase:'result', uthRevealComm:5, uthHand:1, chips:700,
    uthHistory:[_loseEntry],
  }));

  it('result — fold fits viewport', () => checkScreen('uth-result-fold', {
    ..._uthBase, uthPhase:'result', uthRevealComm:5, uthHand:1,
    uthHistory:[_foldEntry],
  }));
});

// ─── 5-Card Poker ─────────────────────────────────────────────────────────────
describe('layout — poker screens', () => {
  it('bet phase (with paytable) fits viewport', () => checkScreen('poker-bet', {
    screen:'poker', pkPhase:'bet', chips:1000, pkBet:0,
  }));

  it('hold phase fits viewport', () => checkScreen('poker-hold', {
    screen:'poker', pkPhase:'hold', chips:900, pkBet:100,
    pkCards:_pkCards, pkHeld:new Set(),
  }));

  it('result fits viewport', () => checkScreen('poker-result', {
    screen:'poker', pkPhase:'result', chips:1200, pkBet:100,
    pkHand:1, pkHistory:[{ bet:100,result:'Two Pair',pts:2,delta:200 }],
    pkFinal:_pkCards,
  }));
});

// ─── Roulette ─────────────────────────────────────────────────────────────────
describe('layout — roulette screens', () => {
  it('bet phase — empty board fits viewport', () => checkScreen('roulette-bet', {
    screen:'roulette', rPhase:'bet', chips:500, rBet:0, rBets:[], rPick:null,
  }));

  it('bet phase — with placed bets fits viewport', () => checkScreen('roulette-bet-placed', {
    screen:'roulette', rPhase:'bet', chips:400, rBet:0, rPick:null,
    rBets:[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50}],
  }));

  // A full set of bets is the binding case — the placed-bets list is at its
  // tallest. The old 3-bet fixture fit fine while 5 bets overflowed, so adding
  // bets could grow/clip the window. Always test the max.
  const _rMaxBets = { screen:'roulette', rPhase:'bet', chips:1000, rBet:0, rPick:null,
    rBets:[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}] };
  it('bet phase — full set of bets fits viewport', () => checkScreen('roulette-bet-max', _rMaxBets));

  // The betting board must NEVER scroll on any view. .r-board-wrap has
  // overflow-x:auto, which makes overflow-y compute to `auto` too — so when the
  // flex panel shrinks it (e.g. with a full bet list on a short window), the
  // lower betting rows silently scroll out of reach. The panel-level scroll
  // check can't see this nested scroll, so assert it directly, with max bets.
  it('betting board never scrolls (tiles always reachable)', () => {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, _rMaxBets);
    render();
    const wrap = document.querySelector('.r-board-wrap');
    assert(wrap !== null, 'roulette-board: .r-board-wrap not found');
    const overY = Math.round(wrap.scrollHeight - wrap.clientHeight);
    const overX = Math.round(wrap.scrollWidth  - wrap.clientWidth);
    assert(overY <= HORIZ_TOL,
      `roulette-board: board scrolls vertically by ${overY}px — lower betting rows are hidden`);
    assert(overX <= HORIZ_TOL,
      `roulette-board: board scrolls horizontally by ${overX}px — tiles off-screen at this viewport`);
    _ltRestore();
  });

  it('spinning phase fits viewport', () => checkScreen('roulette-spinning', {
    screen:'roulette', rPhase:'spinning',
    chips:450, rSpin:36, rBets:[{pick:46,bet:50}],
  }));

  // Five bets is the binding case for the spinning screen — the per-bet list used
  // to extend past the bottom of a mobile window (and under the status bar). The
  // screen must summarize, not list every bet, so this fits like the 1-bet case.
  it('spinning phase with a full set of bets fits viewport', () => checkScreen('roulette-spinning-max', {
    screen:'roulette', rPhase:'spinning', chips:0, rSpin:17,
    rBets:[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}],
  }));

  it('result — lose fits viewport', () => checkScreen('roulette-result-lose', {
    screen:'roulette', rPhase:'result', chips:450, rSpin:36,
    rResult:{ delta:-50, bets:[{pick:46,won:false,delta:-50,pay:1,bet:50}] },
  }));

  it('result — win fits viewport', () => checkScreen('roulette-result-win', {
    screen:'roulette', rPhase:'result', chips:550, rSpin:45,
    rResult:{ delta:50, bets:[{pick:45,won:true,delta:50,pay:1,bet:50}] },
  }));
});

// ─── Final results screen ─────────────────────────────────────────────────────
describe('layout — final results', () => {
  const _fullHistory = {
    bjHistory:  [{ delta:200 },{ delta:-50 },{ delta:100 }],
    uthHistory: [_winEntry, _loseEntry, _foldEntry],
    rResult:    { delta:-50, bets:[{pick:46,won:false,delta:-50,pay:1,bet:50}] },
    bjHand:3, uthHand:3,
  };

  it('normal score fits viewport', () => checkScreen('results-normal', {
    screen:'results', chips:1200, ..._fullHistory,
  }));

  it('0 chips (bust) fits viewport', () => checkScreen('results-bust', {
    screen:'results', chips:0,
    bjHistory:[{ delta:-1000 }], uthHistory:[], rResult:{ delta:0,skipped:true },
    bjHand:3, uthHand:3,
  }));

  it('high score (whale) fits viewport', () => checkScreen('results-whale', {
    screen:'results', chips:3500, ..._fullHistory,
  }));

  // The score-distribution chart is fetched async, so the headless env normally
  // shows only the short "Loading…" placeholder — hiding ~110px of real chart
  // height (title + bars + axis labels). On a real completed game this pushed the
  // Copy & Share button under the status bar on mobile. Seed local history and
  // render the chart synchronously so its true height is in the measurement.
  it('with score-distribution chart fits above status bar', () => {
    const _savedHist = _ls.getItem('gambdle_history');
    _ls.setItem('gambdle_history', JSON.stringify({
      20260505:800, 20260506:1200, 20260507:600, 20260508:1500,
      20260509:1000, 20260510:2000, 20260511:900,
    }));
    try {
      checkScreen('results-chart', { screen:'results', chips:1000, ..._fullHistory },
        () => _showHistoryChart(document.getElementById('dist-chart')));
    } finally {
      if (_savedHist === null) _ls.removeItem('gambdle_history');
      else _ls.setItem('gambdle_history', _savedHist);
    }
  });
});

// ─── Dev stats ────────────────────────────────────────────────────────────────
describe('layout — devstats', () => {
  it('fits viewport', () => checkScreen('devstats', { screen:'devstats' }));
});

// ─── Button uniformity ────────────────────────────────────────────────────────
// Every in-game button (act-btn, btn-gold, clear/all-in, bet box) must share ONE
// height and ONE font size per window size — the same control can't be a different
// size from one game to the next. Heights are checked against the --btn-h variable
// across screens drawn from all three games.
describe('layout — buttons share one height + font per window size', () => {
  const HEIGHT_SEL = '.act-btn, .btn-gold:not(.btn-lg), .ch-clear, .ch-allin, .bet-amt';
  const FONT_SEL   = '.act-btn, .btn-gold:not(.btn-lg), .ch-clear, .ch-allin';
  // Screens chosen so the union surfaces every button type across BJ / UTH / Roulette.
  const _btnScreens = {
    'bj-play':  { screen:'bj', bjPhase:'play', chips:900, bjBet:100, bjHand:0, bjHistory:[], bjPlayer:_bjPair, bjDealer:_bjDealer },
    'bj-bet':   { screen:'bj', bjPhase:'bet', chips:1000, bjBet:50, bjHand:0, bjHistory:[] },
    'uth-flop': { screen:'uth', chips:800, uthAnte:100, uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm, uthPhase:'flop', uthRevealComm:3, uthRaised:false, uthHand:0, uthHistory:[] },
    'uth-bet':  { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:50, uthHand:0, uthHistory:[] },
    'rlt-bet':  { screen:'roulette', rPhase:'bet', chips:500, rBet:50, rBets:[], rPick:17 },
    'rlt-res':  { screen:'roulette', rPhase:'result', chips:550, rSpin:45, rResult:{ delta:50, bets:[{pick:45,won:true,delta:50,pay:1,bet:50}] } },
  };

  // Collect {label, sel, h, fs} for every visible button across all screens.
  const _collect = (selector, withFont) => {
    const out = [];
    for (const [name, ov] of Object.entries(_btnScreens)) {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, ov);
      render();
      for (const el of document.querySelectorAll(selector)) {
        const h = el.getBoundingClientRect().height;
        if (h <= 0) continue; // skip hidden
        const cs = getComputedStyle(el);
        out.push({ where: `${name}:${el.className.split(' ')[0]}`, h: Math.round(h),
          fs: withFont ? Math.round(parseFloat(cs.fontSize)) : 0,
          txt: (el.textContent || '').trim().slice(0, 14) });
      }
    }
    _ltRestore();
    return out;
  };

  it('all button heights equal --btn-h at this viewport', () => {
    const expected = Math.round(parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--btn-h')));
    assert(expected > 0, `--btn-h must resolve to a positive px value, got ${expected}`);
    const btns = _collect(HEIGHT_SEL, false);
    assert(btns.length >= 8, `expected to sample ≥8 buttons across games, got ${btns.length}`);
    for (const b of btns) {
      // 1px tolerance for sub-pixel rounding.
      assert(Math.abs(b.h - expected) <= 1,
        `button height drift: ${b.where} ("${b.txt}") is ${b.h}px, expected --btn-h ${expected}px`);
    }
  });

  it('all single-text button fonts equal --btn-fs at this viewport', () => {
    const root = getComputedStyle(document.documentElement);
    // --btn-fs is in rem; resolve against the root font-size to get px.
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const expected = Math.round(parseFloat(root.getPropertyValue('--btn-fs')) * rootPx);
    const btns = _collect(FONT_SEL, true);
    assert(btns.length >= 8, `expected ≥8 buttons, got ${btns.length}`);
    for (const b of btns) {
      assert(Math.abs(b.fs - expected) <= 1,
        `button font drift: ${b.where} ("${b.txt}") is ${b.fs}px, expected --btn-fs ${expected}px`);
    }
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ltSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _ltSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_ltRestore();
