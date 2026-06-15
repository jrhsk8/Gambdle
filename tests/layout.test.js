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

// Every real play-day has an active modifier, so its banner (~2 lines, ~55px) is ALWAYS on screen.
// Fixtures that render without one under-measure real height and can pass while overflowing in
// production. Bake a representative worst-case banner — bj_wild_split ("Big Splitter", a 2-line
// desc, and thematically the day splits actually happen) — into the base snapshot so every screen
// is measured WITH a banner; fixtures that need a different mod (e.g. ladder_day) still override it.
const _ltSnap = JSON.stringify({ ...S, forcedMod: 'bj_wild_split', pkHeld: [...S.pkHeld] });
const _ltRestore = () => {
  const r = JSON.parse(_ltSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

const VERT_TOL        = 10; // px — mobile window overflow tolerance
const HORIZ_TOL       =  2; // px
const PANEL_SCROLL_TOL=  5; // px — desktop panel scroll tolerance

const _isDesktop = () => window.innerWidth >= 1024;

// On large displays `.app` gets a CSS `zoom` (see styles.css large-display block).
// getBoundingClientRect returns POST-zoom geometry while getComputedStyle returns
// PRE-zoom values (--btn-h, padding, line-height) — so any test that compares the
// two must normalize by this factor. (Window-vs-viewport overflow checks must NOT
// normalize: a zoomed window really does occupy zoomed pixels on the real screen.)
const _appZoom = () => {
  const a = document.querySelector('.app');
  return a ? (parseFloat(getComputedStyle(a).zoom) || 1) : 1;
};

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

// Max vertical gap allowed between consecutive panel children (CSS px, zoom-normalized).
// Catches leftover slack being pooled into one big band (e.g. the old dots→headline
// gap) instead of spread evenly. The 2-/3-hand split layouts distribute their slack,
// so no single gap should approach this.
const MAX_SPLIT_GAP = 50;

// Renders a screen and asserts no single gap between stacked panel children exceeds
// MAX_SPLIT_GAP — i.e. the layout fills the panel evenly rather than pooling slack.
function checkNoPooledSlack(label, overrides) {
  const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
  Object.assign(S, base, overrides);
  render();
  const panel = document.querySelector('.panel');
  assert(panel !== null, `${label}: .panel not found`);
  const zoom = _appZoom();
  const kids = [...panel.children].filter(el => el.getBoundingClientRect().height > 0);
  let maxGap = 0, where = '';
  for (let i = 1; i < kids.length; i++) {
    const gap = (kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom) / zoom;
    if (gap > maxGap) { maxGap = gap; where = `${kids[i - 1].className.split(' ')[0]}→${kids[i].className.split(' ')[0]}`; }
  }
  measure(label, Math.round(MAX_SPLIT_GAP - maxGap)); // headroom under the cap (higher = better)
  assert(maxGap <= MAX_SPLIT_GAP,
    `${label}: biggest gap ${Math.round(maxGap)}px (${where}) exceeds ${MAX_SPLIT_GAP}px — leftover slack is pooled, not distributed`);
  _ltRestore();
}

// The result headline ("Push") and its +chips sub-line must stay tight together as one
// unit — the slack distributor must not push them apart (and enlarging them must not
// reintroduce a gap). CSS px, zoom-normalized.
const MAX_HEADLINE_GAP = 16;

function checkHeadlineTight(label, overrides) {
  const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
  Object.assign(S, base, overrides);
  render();
  const hl = document.querySelector('.bj-split-result .result-hl');
  const sub = document.querySelector('.bj-split-result .result-sub');
  assert(hl !== null && sub !== null, `${label}: result headline/sub not found`);
  const zoom = _appZoom();
  const gap = (sub.getBoundingClientRect().top - hl.getBoundingClientRect().bottom) / zoom;
  measure(label, Math.round(MAX_HEADLINE_GAP - gap));
  assert(gap <= MAX_HEADLINE_GAP,
    `${label}: headline→sub gap ${Math.round(gap)}px exceeds ${MAX_HEADLINE_GAP}px — Push/+chips should read as one unit`);
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

  // 2- and 3-hand splits get larger (hand-count-aware) cards than the 4-way cap,
  // so they need their own fit guards.
  it('play — 2-way split fits viewport', () => checkScreen('bj-split-2', {
    screen:'bj', bjPhase:'play', chips:700, bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:[], bjDealer:_bjDealer,
    bjSplit:true, bjSplitActive:0,
    bjSplitHands:[_bjPair,_bjPair],
    bjSplitBets:[100,100],
    bjSplitDone:[false,false],
    bjSplitDoubled:[false,false],
    bjSplitAnimFrom:[0,0],
  }));

  it('play — 3-way split fits viewport', () => checkScreen('bj-split-3', {
    screen:'bj', bjPhase:'play', chips:650, bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:[], bjDealer:_bjDealer,
    bjSplit:true, bjSplitActive:1,
    bjSplitHands:[_bjPair,_bjPair,_bjPair],
    bjSplitBets:[100,100,100],
    bjSplitDone:[true,false,false],
    bjSplitDoubled:[false,false,false],
    bjSplitAnimFrom:[0,0,0],
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

  it('result — 2-way split fits viewport', () => checkScreen('bj-result-split-2', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:200, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0,
    bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust],
    bjSplitBets:[100,100],
    bjSplitResults:[
      { result:'win',  delta:100,  bet:100 },
      { result:'bust', delta:-100, bet:100 },
    ],
    bjResult:{ result:'split', delta:0 },
    bjHistory:[{ bet:200,result:'split',delta:0,player:[],dealer:[] }],
  }));

  it('result — 3-way split fits viewport', () => checkScreen('bj-result-split-3', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:300, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0,
    bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust, _bjBJ],
    bjSplitBets:[100,100,100],
    bjSplitResults:[
      { result:'win',       delta:100,  bet:100 },
      { result:'bust',      delta:-100, bet:100 },
      { result:'blackjack', delta:150,  bet:100 },
    ],
    bjResult:{ result:'split', delta:150 },
    bjHistory:[{ bet:300,result:'split',delta:150,player:[],dealer:[] }],
  }));

  // Slack distribution: 2-/3-hand splits have spare panel height; assert it's spread
  // across the gaps, not pooled into one band (esp. dots→headline on the result).
  it('play — 2-way split has no pooled slack', () => checkNoPooledSlack('bj-split-2-gap', {
    screen:'bj', bjPhase:'play', chips:700, bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:[], bjDealer:_bjDealer, bjSplit:true, bjSplitActive:0,
    bjSplitHands:[_bjPair,_bjPair], bjSplitBets:[100,100],
    bjSplitDone:[false,false], bjSplitDoubled:[false,false], bjSplitAnimFrom:[0,0],
  }));

  it('play — 3-way split has no pooled slack', () => checkNoPooledSlack('bj-split-3-gap', {
    screen:'bj', bjPhase:'play', chips:650, bjBet:100, bjHand:0, bjHistory:[],
    bjPlayer:[], bjDealer:_bjDealer, bjSplit:true, bjSplitActive:1,
    bjSplitHands:[_bjPair,_bjPair,_bjPair], bjSplitBets:[100,100,100],
    bjSplitDone:[true,false,false], bjSplitDoubled:[false,false,false], bjSplitAnimFrom:[0,0,0],
  }));

  it('result — 2-way split has no pooled slack', () => checkNoPooledSlack('bj-result-split-2-gap', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:200, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0, bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust], bjSplitBets:[100,100],
    bjSplitResults:[{ result:'win', delta:100, bet:100 }, { result:'bust', delta:-100, bet:100 }],
    bjResult:{ result:'split', delta:0 },
    bjHistory:[{ bet:200,result:'split',delta:0,player:[],dealer:[] }],
  }));

  it('result — 3-way split has no pooled slack', () => checkNoPooledSlack('bj-result-split-3-gap', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:300, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0, bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust, _bjBJ], bjSplitBets:[100,100,100],
    bjSplitResults:[
      { result:'win', delta:100, bet:100 },
      { result:'bust', delta:-100, bet:100 },
      { result:'blackjack', delta:150, bet:100 },
    ],
    bjResult:{ result:'split', delta:150 },
    bjHistory:[{ bet:300,result:'split',delta:150,player:[],dealer:[] }],
  }));

  // Headline + sub stay a tight unit (no pooled gap between Push and +chips).
  it('result — 2-way split headline is tight', () => checkHeadlineTight('bj-result-split-2-hl', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:200, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0, bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust], bjSplitBets:[100,100],
    bjSplitResults:[{ result:'win', delta:100, bet:100 }, { result:'bust', delta:-100, bet:100 }],
    bjResult:{ result:'split', delta:0 },
    bjHistory:[{ bet:200,result:'split',delta:0,player:[],dealer:[] }],
  }));

  it('result — 4-way split headline is tight', () => checkHeadlineTight('bj-result-split-4-hl', {
    screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
    bjBet:400, bjPlayer:[], bjDealer:_bjDealer, bjDealerAnimFrom:0, bjSplit:true,
    bjSplitHands:[_bjPair, _bjBust, _bjPair, _bjBJ], bjSplitBets:[100,100,100,100],
    bjSplitResults:[
      { result:'win', delta:100, bet:100 }, { result:'bust', delta:-100, bet:100 },
      { result:'win', delta:100, bet:100 }, { result:'blackjack', delta:150, bet:100 },
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
      // Rect height is post-zoom; fontSize (computed) is pre-zoom — normalize to match.
      const height = inner.getBoundingClientRect().height / _appZoom();
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
      // Normalize zoomed rect height back to pre-zoom space to match pad/lineHeight.
      const contentH = dot.getBoundingClientRect().height / _appZoom() - pad;
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

  // Five bets is the binding case for the spinning screen — the read-only "Your Bets" box
  // below the wheel lists the full set, so it (capped + scrollable) plus the wheel must still
  // fit the viewport without the panel itself scrolling.
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

// ─── The Ladder ───────────────────────────────────────────────────────────────
describe('layout — The Ladder screens', () => {
  it('bet phase (free entry) fits viewport', () => checkScreen('ladder-bet-free', {
    screen:'ladder', ladPhase:'bet', ladBet:0, ladFree:false, ladIdx:0, ladRung:0,
    ladResult:null, chips:1000, forcedMod:'ladder_day',
  }));

  it('bet phase (standalone, chip selector) fits viewport', () => checkScreen('ladder-bet', {
    screen:'ladder', ladPhase:'bet', ladBet:100, ladFree:false, ladIdx:0, ladRung:0,
    ladResult:null, chips:1000,
  }));

  it('climb phase fits viewport', () => checkScreen('ladder-climb', {
    screen:'ladder', ladPhase:'climb', ladBet:250, ladFree:true, ladIdx:3, ladRung:3,
    ladResult:null, chips:1000, forcedMod:'ladder_day',
  }));

  it('done phase (crash) fits viewport', () => checkScreen('ladder-crash', {
    screen:'ladder', ladPhase:'done', ladBet:250, ladFree:true, ladIdx:4, ladRung:3,
    ladResult:{delta:0,rung:3,outcome:'crash',free:true}, chips:1000, forcedMod:'ladder_day',
  }));

  it('done phase (cash out) fits viewport', () => checkScreen('ladder-cash', {
    screen:'ladder', ladPhase:'done', ladBet:250, ladFree:true, ladIdx:4, ladRung:4,
    ladResult:{delta:1250,rung:4,outcome:'cash',free:true}, chips:2250, forcedMod:'ladder_day',
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

  // The streak tag renders inline on the "chips" label line, so it must not wrap to a
  // new line or push content wider/taller. Seed a long consecutive run ENDING TODAY
  // (relative to whatever date the suite runs on) so the tag actually shows, then check
  // fit with the chart present — the realistic worst case for a returning player.
  it('with a long daily streak fits viewport', () => {
    const _savedHist = _ls.getItem('gambdle_history');
    const idxToSeed = idx => { const d = new Date(START_DATE_UTC + idx * 86400000); return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); };
    const today = _seedDayIndex(getDailySeed());
    const hist = {}; for (let k = 0; k < 30; k++) hist[idxToSeed(today - k)] = 1200; // 30-day streak (2-digit)
    _ls.setItem('gambdle_history', JSON.stringify(hist));
    try {
      checkScreen('results-streak', { screen:'results', chips:1200, ..._fullHistory },
        () => _showHistoryChart(document.getElementById('dist-chart')));
    } finally {
      if (_savedHist === null) _ls.removeItem('gambdle_history');
      else _ls.setItem('gambdle_history', _savedHist);
    }
  });

  // Regression: the desktop results width-cap (max-width + auto margins on #dist-chart) must NOT
  // collapse the chart. Auto margins on a column flex item disable align-items:stretch, so without
  // an explicit width:100% the chart shrinks to its content — and since the bars are flex:1 with
  // absolutely-positioned labels (no intrinsic width), they render as ~2-4px slivers. Fit tests
  // miss this (a collapsed chart is smaller, so it "fits"); these assertions check real widths.
  it('score-distribution chart fills its width (bars are not collapsed by the width cap)', () => {
    const _savedHist = _ls.getItem('gambdle_history');
    const idxToSeed = idx => { const d = new Date(START_DATE_UTC + idx * 86400000); return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); };
    const today = _seedDayIndex(getDailySeed());
    const hist = {}; for (let k = 0; k < 7; k++) hist[idxToSeed(today - k)] = 800 + k * 160;
    _ls.setItem('gambdle_history', JSON.stringify(hist));
    try {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, { screen:'results', chips:1200, ..._fullHistory });
      render();
      _showHistoryChart(document.getElementById('dist-chart'));

      const chart = document.getElementById('dist-chart');
      const barsWrap = chart.querySelector('.dist-bars');
      const bars = [...chart.querySelectorAll('.dist-bar')].filter(b => b.getBoundingClientRect().height > 0);
      const panel = document.querySelector('.panel');
      const chartW = chart.getBoundingClientRect().width;
      const barsW  = barsWrap.getBoundingClientRect().width;
      const panelW = panel.getBoundingClientRect().width;
      const minBar = Math.min(...bars.map(b => b.getBoundingClientRect().width));

      assert(bars.length >= 5, `expected the 7-day history to draw several bars, got ${bars.length}`);
      // Chart must span most of the available width (collapse shrank it to ~content → slivers).
      assert(chartW >= panelW * 0.5, `dist-chart collapsed: ${Math.round(chartW)}px in a ${Math.round(panelW)}px panel`);
      // The bar row must fill the chart container.
      assert(barsW >= chartW * 0.85, `dist-bars (${Math.round(barsW)}px) doesn't fill the chart (${Math.round(chartW)}px)`);
      // Each bar must be a real bar, not a sliver (collapsed bars measured ~2-4px; healthy ≥ ~45px).
      assert(minBar >= 14, `bars collapsed to slivers: thinnest bar is ${minBar.toFixed(1)}px`);
    } finally {
      if (_savedHist === null) _ls.removeItem('gambdle_history');
      else _ls.setItem('gambdle_history', _savedHist);
      _ltRestore();
    }
  });

  // Regression: the chart's bucket labels (0/250/500/1k/… and #day labels) are absolutely
  // positioned ~22px BELOW the bars (out of flow), so .dist-bars needs enough bottom margin to
  // both clear them and leave a gap before the share box. With too-small a margin the labels
  // overlap the share box (measured down to -9px). Desktop only — the 375 mobile viewport is
  // intentionally tighter and the 360 floor is covered by the WebKit suite. Gap is mod-independent.
  it('bucket labels clear the share box with breathing room (desktop)', () => {
    if (!_isDesktop()) return; // 375×812 mobile viewport is intentionally tighter; checked in WebKit
    const _savedHist = _ls.getItem('gambdle_history');
    const idxToSeed = idx => { const d = new Date(START_DATE_UTC + idx * 86400000); return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); };
    const today = _seedDayIndex(getDailySeed());
    const hist = {}; for (let k = 0; k < 7; k++) hist[idxToSeed(today - k)] = 800 + k * 160;
    _ls.setItem('gambdle_history', JSON.stringify(hist));
    try {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, { screen:'results', chips:1200, ..._fullHistory });
      render();
      _showHistoryChart(document.getElementById('dist-chart'));

      const share = document.querySelector('.share-box');
      const labels = [...document.querySelectorAll('#dist-chart .dist-lbl')];
      assert(share && labels.length, 'share box and chart bucket labels present');
      const lowestLabel = Math.max(...labels.map(l => l.getBoundingClientRect().bottom));
      const gap = share.getBoundingClientRect().top - lowestLabel;
      assert(gap >= 8, `only ${Math.round(gap)}px between the chart bucket labels and the share box (min 8)`);
    } finally {
      if (_savedHist === null) _ls.removeItem('gambdle_history');
      else _ls.setItem('gambdle_history', _savedHist);
      _ltRestore();
    }
  });

  // Regression: the "You (N)" marker label sits ~20px ABOVE the bars (out of flow, on .dist-you-line),
  // so .dist-bars needs enough TOP margin or the label overlaps the "Score Distribution" title. It did
  // on desktop (gap measured down to -10px) while mobile was fine. Uses _renderScoreDist directly since
  // the real chart is fetched async (can't run offline). Desktop only — mobile is intentionally tighter.
  it('the You label clears the Score Distribution title (desktop)', () => {
    if (!_isDesktop()) return;
    try {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, { screen:'results', chips:1500, ..._fullHistory });
      render();
      // chips 1500 → bucket 3 (1k–2k); bucket 2 (count 80) is tallest, so the player is NOT in the
      // tallest bucket → the standard -20px You line (the case the user reported).
      _renderScoreDist(document.getElementById('dist-chart'), [12, 40, 80, 55, 30, 12, 5]);

      const title = document.getElementById('dist-title');
      const youLbl = document.querySelector('#dist-chart .dist-you-lbl');
      assert(title && youLbl, 'Score Distribution title and You label present');
      const gap = youLbl.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
      assert(gap >= 4, `only ${Math.round(gap)}px between the Score Distribution title and the You label (min 4)`);
    } finally {
      _ltRestore();
    }
  });
});

// ─── Dev stats ────────────────────────────────────────────────────────────────
describe('layout — devstats', () => {
  it('fits viewport', () => checkScreen('devstats', { screen:'devstats' }));
});

// ─── iOS safe-area insets ───────────────────────────────────────────────────────
// Safe-area handling (viewport-fit=cover + env() padding + the dvh/scroll fallback for
// phones smaller than a screen is designed for) is tested authoritatively in WebKit —
// Safari's real engine — by `npm run test:webkit` (tests/webkit-layout.js). It simulates
// realistic iPhone chrome and checks overlap, out-of-bounds, reachability, and that any
// scrolling is vertical-only. That belongs in WebKit, not headless Chromium, which
// reports env() as 0 and can't reproduce Safari's scroll/inset behaviour.

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
    'borrow':   { screen:'borrow', chips:0, borrowReturnScreen:'uth' }, // Accept-defeat (.ch-clear) must be --btn-h, not grow to fill the column
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
    // --btn-h is read from <html> (pre-zoom); button heights come from
    // getBoundingClientRect (post-zoom), so scale the expectation by the app zoom.
    const expected = Math.round(parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--btn-h')) * _appZoom());
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

// ─── Bet box parity ───────────────────────────────────────────────────────────
// The bet box (.bet-amt) must be pixel-identical — same size AND format — on EVERY screen it appears
// (bet phase, play, reveal, result, across all games), and every in-game button must share one height
// across those screens. Runs once per viewport (the harness re-runs this file at each binding size),
// comparing screens AT that viewport.
describe('layout - bet box parity', () => {
  const BOX_SCREENS = [
    ['bj-bet',       { screen:'bj', bjPhase:'bet', chips:1000, bjBet:500, bjHand:0, bjHistory:[] }],
    ['uth-bet',      { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:500, uthHand:0, uthHistory:[] }],
    ['poker-bet',    { screen:'poker', pkPhase:'bet', chips:1000, pkBet:500, pkHand:0, pkHistory:[] }],
    ['ladder-bet',   { screen:'ladder', ladPhase:'bet', ladBet:200, ladFree:false, ladIdx:0, ladRung:0, ladResult:null, chips:1000 }],
    // NOTE: roulette-bet is intentionally NOT here — its box is shrunk to pack Clear + box + Place Bet
    // + All In onto one line, so the pixel-width parity is a bj/uth/poker/ladder guarantee, not roulette.
    ['bj-play',      { screen:'bj', bjPhase:'play', chips:950, bjBet:150, bjHand:0, bjHistory:[], bjPlayer:_bjPair, bjDealer:_bjDealer }],
    ['bj-split',     { screen:'bj', bjPhase:'play', chips:600, bjBet:100, bjHand:0, bjHistory:[], bjPlayer:[], bjDealer:_bjDealer, bjSplit:true, bjSplitActive:0, bjSplitHands:[_bjPair,_bjPair], bjSplitBets:[100,100], bjSplitDone:[false,false], bjSplitDoubled:[false,false], bjSplitAnimFrom:[0,0] }],
    ['uth-preflop',  { screen:'uth', uthPhase:'preflop', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0, uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm, uthRaised:false, uthRevealComm:0, uthPrevRevealComm:0, uthHand:0, uthHistory:[] }],
    ['uth-flop',     { screen:'uth', uthPhase:'flop', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0, uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm, uthRaised:false, uthRevealComm:3, uthPrevRevealComm:3, uthHand:0, uthHistory:[] }],
    ['uth-turn',     { screen:'uth', uthPhase:'turn', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0, uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm, uthRaised:false, uthRevealComm:5, uthPrevRevealComm:5, uthHand:0, uthHistory:[] }],
    ['uth-reveal',   { screen:'uth', uthPhase:'reveal', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0, uthHole:_uthHole, uthDealer:_uthDlrCds, uthComm:_uthComm, uthRaised:false, uthRevealComm:5, uthPrevRevealComm:5, uthHand:1, uthHistory:[{ante:50,blind:50,play:0,playMult:0,result:'win',delta:0,anteDelta:0,blindDelta:0,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:true}] }],
    ['bj-result',    { screen:'bj', bjPhase:'result', chips:1100, bjBet:150, bjHand:1, bjSplit:false, bjDealerReveal:true, bjPlayer:_bjPair, bjDealer:_bjDealer, bjResult:{result:'win',delta:150}, bjHistory:[{bet:150,result:'win',delta:150,player:_bjPair,dealer:_bjDealer}] }],
  ];

  function measureBox(state) {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, state);
    render();
    const el = document.querySelector('.bet-amt');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      padTop: cs.paddingTop, padRight: cs.paddingRight, padBottom: cs.paddingBottom, padLeft: cs.paddingLeft,
      borderTop: cs.borderTopWidth, borderRight: cs.borderRightWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth,
      bg: cs.backgroundColor, color: cs.color, alignItems: cs.alignItems, justifyContent: cs.justifyContent
    };
  }

  it('bet box is the same size + format on every screen', () => {
    const measured = BOX_SCREENS.map(([label, st]) => ({ label, box: measureBox(st) }));
    for (const m of measured) {
      assert(m.box !== null, `bet box parity: no .bet-amt on screen "${m.label}"`);
    }
    const ref = measured[0];
    for (const m of measured.slice(1)) {
      assert(Math.abs(m.box.w - ref.box.w) <= 1, `bet box parity: "${m.label}" width ${m.box.w} != ${ref.box.w} (ref "${ref.label}")`);
      assert(Math.abs(m.box.h - ref.box.h) <= 1, `bet box parity: "${m.label}" height ${m.box.h} != ${ref.box.h} (ref "${ref.label}")`);
      const strProps = ['padTop','padRight','padBottom','padLeft','borderTop','borderRight','borderBottom','borderLeft','bg','color','alignItems','justifyContent'];
      for (const prop of strProps) {
        assert(m.box[prop] === ref.box[prop], `bet box parity: "${m.label}" ${prop} "${m.box[prop]}" != "${ref.box[prop]}" (ref "${ref.label}")`);
      }
    }
  });

  it('every in-game button shares one height across all bet-box screens', () => {
    const selector = '.act-btn, .btn-gold:not(.btn-lg), .ch-clear, .ch-allin, .bet-amt';
    const collected = [];
    for (const [label, st] of BOX_SCREENS) {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, st);
      render();
      document.querySelectorAll(selector).forEach(el => {
        const height = el.getBoundingClientRect().height;
        if (height > 0) {
          collected.push({ label, cls: el.className.split(' ')[0], h: Math.round(height) });
        }
      });
    }
    assert(collected.length > 0, 'button height parity: no buttons found with height > 0');
    const refH = collected[0].h;
    const refLabel = collected[0].label;
    for (const e of collected.slice(1)) {
      assert(e.h === refH, `button height parity: "${e.label}" .${e.cls} is ${e.h}px, expected ${refH}px (ref "${refLabel}")`);
    }
  });

  // The box must sit at the SAME vertical position on every BJ/UTH screen — it must not jump as you
  // move bet → play → reveal → result. Measured as the gap from the box bottom to the panel bottom
  // (the panel height is constant at a given viewport, so equal gap = identical absolute Y). Poker /
  // ladder / roulette bet screens are excluded: they intentionally place content (pay table, bet
  // boxes) below the box, so their box sits higher by design.
  // uth-reveal is a 2.3s auto-transition with no button row under the box, so its anchor differs; the
  // interactive bet/play/result screens are what must not jump.
  const VPOS_SCREENS = BOX_SCREENS.filter(([l]) => (l.startsWith('bj-') || l.startsWith('uth-')) && l !== 'uth-reveal');
  it('bet box sits at the same vertical position on every BJ/UTH screen', () => {
    if (!_isDesktop()) return; // phones stack Clear/All In below the box on the bet screen, so the
                               // bet box necessarily sits a row higher there than on play — a desktop guarantee.
    const measured = VPOS_SCREENS.map(([label, st]) => {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, st);
      render();
      const box = document.querySelector('.bet-amt');
      const panel = document.querySelector('.panel');
      assert(box && panel, `bet box vpos: box/panel missing on "${label}"`);
      const gap = Math.round(panel.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom);
      return { label, gap };
    });
    const ref = measured[0];
    for (const m of measured.slice(1)) {
      assert(Math.abs(m.gap - ref.gap) <= 1,
        `bet box vpos: "${m.label}" is ${m.gap}px from panel bottom, expected ${ref.gap}px (ref "${ref.label}") — the box jumped vertically`);
    }
  });

  // A LONE action button (the single advance: Next Hand/Game, See Results, etc.) must match the bet box
  // width; a MULTI-button play row (.act-btns: Hit/Stand/Double/Split, Raise/Check/Fold) stays wider, at
  // the near-full-panel control width, so 3-4 buttons don't cramp. Checked on the play/result screens
  // that stack a button (row) under the box inside .game-controls.
  it('lone action button == bet box width; multi-button rows stay wider (play/result)', () => {
    if (!_isDesktop()) return; // on phones the box fills the control width, so everything is equal there.
    const PLAY = BOX_SCREENS.filter(([l]) => ['bj-play','bj-split','uth-preflop','uth-flop','uth-turn','bj-result'].includes(l));
    for (const [label, st] of PLAY) {
      const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
      Object.assign(S, base, st);
      render();
      const gc = document.querySelector('.game-controls');
      assert(gc, `btn-width: no .game-controls on "${label}"`);
      const box = gc.querySelector('.bet-amt');
      assert(box, `btn-width: box missing on "${label}"`);
      const boxW = box.getBoundingClientRect().width;
      const actBtns = gc.querySelector('.act-btns');
      if (actBtns) {  // multi-button play row — stays wider than the box
        const w = actBtns.getBoundingClientRect().width;
        assert(w > boxW + 1,
          `btn-width: "${label}" multi-button row (${Math.round(w)}px) should be wider than the box (${Math.round(boxW)}px)`);
      } else {        // lone advance button — matches the box width
        const solo = gc.querySelector('.btn-gold');
        assert(solo, `btn-width: no action button on "${label}"`);
        const w = solo.getBoundingClientRect().width;
        assert(Math.abs(w - boxW) <= 1,
          `btn-width: "${label}" lone button (${Math.round(w)}px) should match the box (${Math.round(boxW)}px)`);
      }
    }
  });
});

// ─── Chip selector parity ─────────────────────────────────────────────────────
// The chip selector (the denomination buttons) must be the same size + position on every bet screen,
// so it never moves or resizes from game to game. Runs once per viewport.
describe('layout - chip selector parity', () => {
  // SPEC: the chip selector must be the same size + position on EVERY bet screen (all games). Asserted
  // here on BJ / UTH / Roulette; Poker + Ladder should match too and can be added once verified.
  const CHIP_SCREENS = [
    ['bj-bet',       { screen:'bj', bjPhase:'bet', chips:1000, bjBet:500, bjHand:0, bjHistory:[] }],
    ['uth-bet',      { screen:'uth', uthPhase:'bet', chips:1000, uthAnte:500, uthHand:0, uthHistory:[] }],
    ['roulette-bet', { screen:'roulette', rPhase:'bet', chips:1000, rBet:50, rPick:17, rBets:[{pick:45,bet:50}] }],
  ];

  function measureChips(state) {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, state);
    render();
    const row = document.querySelector('.chip-row');
    const btn = document.querySelector('.chip-row .chbtn');
    const panel = document.querySelector('.panel');
    if (!row || !btn || !panel) return null;
    const rr = row.getBoundingClientRect(), br = btn.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    return {
      rowW: Math.round(rr.width),
      vGap: Math.round(pr.bottom - rr.bottom),     // chip row bottom → panel bottom (bottom-anchored controls)
      leftInset: Math.round(rr.left - pr.left),     // horizontal position / centering inside the panel
      btnW: Math.round(br.width),
      btnH: Math.round(br.height)
    };
  }

  it('chip selector is the same size + position on every bet screen', () => {
    const measured = CHIP_SCREENS.map(([label, st]) => ({ label, chips: measureChips(st) }));
    for (const m of measured) {
      assert(m.chips !== null, `chip parity: no .chip-row/.chbtn on "${m.label}"`);
    }
    const ref = measured[0];
    const props = ['rowW', 'vGap', 'leftInset', 'btnW', 'btnH'];
    for (const m of measured.slice(1)) {
      for (const prop of props) {
        assert(Math.abs(m.chips[prop] - ref.chips[prop]) <= 1,
          `chip parity: "${m.label}" ${prop} ${m.chips[prop]} != ${ref.chips[prop]} (ref "${ref.label}") — the chip selector moved/resized between screens`);
      }
    }
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ltSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _ltSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_ltRestore();
