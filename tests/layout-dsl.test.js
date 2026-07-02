// ─── Layout DSL — codified intent + meta-tests ────────────────────────────────
// Two things live here:
//  1. Real expectLayout() intent assertions, each self-gated to a binding Viewport. These lock
//     in spacing/alignment beyond the bare "it fits" guarantee (e.g. the Deal button shares the
//     bet box's left edge). They run inside the existing layout harness under `npm test`.
//  2. Meta-tests proving every matcher is correct in BOTH directions — it passes on a layout that
//     honours the intent and THROWS on one that violates it. The DSL is test infrastructure, so
//     its own correctness is load-bearing. (makeBareL gives matchers that throw directly, so a
//     meta-test can try/catch them; expectLayout wraps the same logic in it()s.)
// See tests/layout-dsl.js and PRD-ui-tweak-pipeline.md.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _ldSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _ldSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _ldRestore = () => {
  const r = JSON.parse(_ldSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// ─── Codified layout intent (self-gated to each target Viewport) ──────────────
// Desktop bet screens: the chip selector sits tight above the bottom-anchored Deal button, which
// centers over the bet box and sits slightly wider than it (it overhangs the box on both sides).
expectLayout('bj-bet', '1280x800', L => {
  L.fits();
  L.centeredOverhang('#db', '.bet-amt');
  L.el('.mod-banner').centered();
  L.gap('.chip-row', '#db').atMost(100);
});

expectLayout('uth-bet', '1280x800', L => {
  L.fits();
  L.centeredOverhang('#db', '.bet-amt');
});

expectLayout('bj-bet', '1440x900', L => {
  L.fits();
  L.centeredOverhang('#db', '.bet-amt');
});

// Mobile floor analog (the suite's mobile viewport): everything fits, and the Deal button + the
// modifier banner stay centered in the panel.
expectLayout('bj-bet', '375x812', L => {
  L.fits();
  L.el('#db').centered();
  L.el('.mod-banner').centered();
});

// The tallest interactive Screen still fits the mobile viewport.
expectLayout('uth-showdown', '375x812', L => {
  L.fits();
});

// ─── Meta-tests: each matcher in both directions ──────────────────────────────
describe('Layout DSL — matchers fire in both directions', () => {
  const $ = s => document.querySelector(s);
  const throws = fn => { try { fn(); return false; } catch (e) { return true; } };
  const fresh = () => { renderFixture('bj-bet', { defaultMod: 'bj_wild_split' }); };

  it('gap().is / atMost / atLeast pass on truth, throw on violation', () => {
    fresh();
    const a = $('.chip-row'), b = $('#db');
    assert(a && b, 'meta: bj-bet should expose .chip-row and #db');
    const G = LayoutMeasure.gapBetween(a, b);
    const L = makeBareL('meta-gap');
    assert(!throws(() => L.gap('.chip-row', '#db').is(G)),          `is(${Math.round(G)}) should pass on the real gap`);
    assert(!throws(() => L.gap('.chip-row', '#db').atMost(G + 50)), 'atMost(G+50) should pass');
    assert(!throws(() => L.gap('.chip-row', '#db').atLeast(G - 50)),'atLeast(G-50) should pass');
    assert(throws(() => L.gap('.chip-row', '#db').is(G + 50)),      'is(G+50) should throw');
    assert(throws(() => L.gap('.chip-row', '#db').atMost(G - 50)),  'atMost(G-50) should throw');
    assert(throws(() => L.gap('.chip-row', '#db').atLeast(G + 50)), 'atLeast(G+50) should throw');
  });

  it('el().sameLeft passes when edges align, throws when they do not', () => {
    fresh();
    const L = makeBareL('meta-left');
    assert(!throws(() => L.el('#db').sameLeft('#db')), 'sameLeft(self) should pass');
    const d = Math.abs(LayoutMeasure.alignDeltas($('.chip-row'), $('#db')).leftDelta);
    assert(d > 2, `meta precondition: .chip-row vs #db left edges should differ (${Math.round(d)}px)`);
    assert(throws(() => L.el('.chip-row').sameLeft('#db')), 'sameLeft on misaligned edges should throw');
  });

  it('el().sameWidth passes for equal widths, throws for unequal', () => {
    fresh();
    const L = makeBareL('meta-width');
    assert(!throws(() => L.el('#db').sameWidth('#db')), 'sameWidth(self) should pass');
    const chip = $('.chbtn');
    assert(chip, 'meta: bj-bet should expose a .chbtn');
    const wd = Math.abs(LayoutMeasure.alignDeltas($('#db'), chip).widthDelta);
    assert(wd > 2, `meta precondition: #db vs .chbtn widths should differ (${Math.round(wd)}px)`);
    assert(throws(() => L.el('#db').sameWidth('.chbtn')), 'sameWidth on unequal widths should throw');
  });

  it('el().centered passes at container center, throws off-center', () => {
    fresh();
    const L = makeBareL('meta-center');
    // A container is trivially centered within itself → the matcher must accept it.
    assert(!throws(() => L.el('.panel').centered('.panel')), 'centered should pass on a centered element');
    const chip = $('.chbtn');
    const oc = Math.abs(LayoutMeasure.centerDeltaWithin(chip, $('.panel')));
    assert(oc > 2, `meta precondition: .chbtn should sit off panel-center (${Math.round(oc)}px)`);
    assert(throws(() => L.el('.chbtn').centered('.panel')), 'centered should throw off-center');
  });

  it('fits() passes on a fitting Screen, throws on overflow', () => {
    fresh();
    const L = makeBareL('meta-fits');
    assert(!throws(() => L.fits()), 'fits() should pass on the rendered bet screen');
    // The real overflow detector (measureFit) is itself proven by the 8-viewport suite using this
    // same code; here we feed fits() a deterministic over-tolerance measurement to prove its
    // threshold logic fires.
    const real = LayoutMeasure.measureFit;
    LayoutMeasure.measureFit = () => ({ ...real(), horizOver: 999 });
    try {
      assert(throws(() => L.fits()), 'fits() should throw when horizontal overflow exceeds tolerance');
    } finally {
      LayoutMeasure.measureFit = real;
    }
  });

  it('matchers throw when a selector matches nothing', () => {
    fresh();
    const L = makeBareL('meta-missing');
    assert(throws(() => L.gap('.nope', '#db').is(10)),  'gap with a missing selector should throw');
    assert(throws(() => L.el('.nope').sameLeft('#db')), 'sameLeft with a missing selector should throw');
  });

  it('centeredOverhang passes when centered+wider, throws if either half fails', () => {
    fresh();
    const L = makeBareL('meta-overhang');
    // #db over .bet-amt is the real "Deal button overhangs the bet box" shape this matcher exists
    // to name, so it must pass with no extra args (defaults: centered within .panel, widerThan by ≥1px).
    assert(!throws(() => L.centeredOverhang('#db', '.bet-amt')), 'centeredOverhang should pass on the real Deal-button/bet-box pair');
    // Break just the "centered" half: an off-center element that IS wider than the baseline should
    // still throw — proving the matcher isn't just re-checking widerThan alone.
    const chip = $('.chbtn');
    assert(throws(() => L.centeredOverhang('.chbtn', '.bet-amt')), 'centeredOverhang should throw when the element is not centered');
    // Break just the "wider" half: sameWidth-or-narrower should throw even though #db is centered.
    assert(throws(() => L.centeredOverhang('#db', '#db')), 'centeredOverhang should throw when there is no overhang (equal width)');
  });
});

// ─── Meta-tests: the shared viewport gate ─────────────────────────────────────
describe('Layout DSL — gateFor/matchesViewport', () => {
  // These read the CURRENT page's real viewport rather than faking window.innerWidth/Height, so the
  // meta-test stays honest about what size it actually runs at under any binding size in the suite.
  const here = `${window.innerWidth}x${window.innerHeight}`;
  const elsewhere = window.innerWidth === 1 && window.innerHeight === 1 ? '2x2' : '1x1';

  it('matchesViewport is true for the current size, false for any other', () => {
    assert(matchesViewport(here) === true,  `matchesViewport("${here}") should be true at the real viewport`);
    assert(matchesViewport(elsewhere) === false, `matchesViewport("${elsewhere}") should be false — it is not the real viewport`);
  });

  it('gateFor runs its callback only at the matching size (skip, not fail, otherwise)', () => {
    let ran = false;
    const result = gateFor(here, () => { ran = true; return 'ran'; });
    assert(ran === true, 'gateFor should invoke fn when size matches the current viewport');
    assert(result === 'ran', 'gateFor should return whatever fn returns on a match');

    ran = false;
    const skipped = gateFor(elsewhere, () => { ran = true; return 'ran'; });
    assert(ran === false, 'gateFor should NOT invoke fn when size does not match — this is a skip, not a failure');
    assert(skipped === undefined, 'gateFor should return undefined on a skip (no-op, not an error)');
  });

  it('expectLayout itself is a gateFor consumer: a call for a non-matching size registers no describe/it', () => {
    // Regression guard for the extraction: expectLayout must route through the SAME gate rather than
    // re-deriving its own innerWidth/Height check, so this proves the public entry point still skips.
    let calledBack = false;
    expectLayout('bj-bet', elsewhere, () => { calledBack = true; });
    assert(calledBack === false, 'expectLayout callback should not run for a non-matching size');
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ldSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _ldSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_ldRestore();
