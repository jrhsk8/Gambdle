// ─── Layout DSL ───────────────────────────────────────────────────────────────
// A declarative assertion surface for codifying layout INTENT (not just "it fits"):
//
//   expectLayout('bj-bet', '1280x800', L => {
//     L.fits();                                   // no overflow / no scroll / no pooled slack
//     L.gap('.chip-row', '#db').atMost(80);       // controls stay tight under the chips
//     L.el('#db').sameLeft('.bet-amt');           // Deal button shares the bet box's left edge
//   });
//
// Built on the shared measurement core (tests/layout-measure.js) so an assertion measures the
// SAME geometry the suite's own fit checks do, and on the runner's describe/it/assert. Every
// assertion is zoom-normalized and tolerance-aware; failures name the Screen, size, selectors,
// and expected-vs-actual px. State is set via the shared Fixture registry (renderFixture), so an
// assertion runs against the exact named state you previewed in the UI Lab. See PRD-ui-tweak-pipeline.md.
//
// expectLayout self-gates to its target Viewport: the layout suite re-runs this same page at each
// binding size, so a call returns a no-op unless window.innerWidth/Height matches `size`.

(function (root) {
  'use strict';

  const LM = root.LayoutMeasure;
  const DEFAULT_TOL = 2; // px — default alignment/gap tolerance, overridable per matcher

  const $ = sel => document.querySelector(sel);
  const need = (ctx, ...pairs) => {
    for (const [sel, el] of pairs) {
      if (!el) throw new Error(`${ctx}: selector "${sel}" matched no element`);
    }
  };

  // Bare assertion surface: each matcher MEASURES via the core and asserts directly (throws on
  // violation, returns nothing on success). No it()/describe() — so the DSL's own meta-tests can
  // try/catch a matcher to prove it fires in both directions. expectLayout wraps these in it()s.
  function makeBareL(ctx) {
    function fits() {
      const m = LM.measureFit();
      const T = LM.FIT_TOL;
      if (!m.hasWindow) throw new Error(`${ctx}: .window not found`);
      if (m.modBannerTop !== null) {
        const maxTop = LM.isDesktop() ? T.modTopDesktop : T.modTopMobile;
        if (m.modBannerTop > maxTop) throw new Error(`${ctx}: modifier banner shifted down ${m.modBannerTop}px from panel top (max ${maxTop})`);
      }
      if (LM.isDesktop()) {
        if (m.panelScroll > T.panelScroll) throw new Error(`${ctx}: panel scrolls by ${m.panelScroll}px — content exceeds the fixed desktop window`);
      } else {
        if (m.vertOver > T.vert) throw new Error(`${ctx}: vertical overflow by ${Math.round(m.vertOver)}px`);
        if (m.lastBottomViewport > m.sbTop + T.vert) throw new Error(`${ctx}: content overflows into the status bar by ${m.lastBottomViewport - m.sbTop}px`);
      }
      if (m.horizOver > T.horiz) throw new Error(`${ctx}: horizontal overflow by ${Math.round(m.horizOver)}px`);
    }

    function gap(selA, selB) {
      const measure = () => {
        const a = $(selA), b = $(selB);
        need(ctx, [selA, a], [selB, b]);
        return LM.gapBetween(a, b);
      };
      const fmt = g => Math.round(g);
      return {
        is(px, tol = DEFAULT_TOL) {
          const g = measure();
          if (Math.abs(g - px) > tol) throw new Error(`${ctx}: gap ${selA}→${selB} is ${fmt(g)}px, expected ${px}px (±${tol})`);
        },
        atMost(px, tol = DEFAULT_TOL) {
          const g = measure();
          if (g > px + tol) throw new Error(`${ctx}: gap ${selA}→${selB} is ${fmt(g)}px, expected ≤ ${px}px (±${tol})`);
        },
        atLeast(px, tol = DEFAULT_TOL) {
          const g = measure();
          if (g < px - tol) throw new Error(`${ctx}: gap ${selA}→${selB} is ${fmt(g)}px, expected ≥ ${px}px (±${tol})`);
        },
      };
    }

    function el(sel) {
      return {
        sameLeft(sel2, tol = DEFAULT_TOL) {
          const a = $(sel), b = $(sel2);
          need(ctx, [sel, a], [sel2, b]);
          const d = LM.alignDeltas(a, b).leftDelta;
          if (Math.abs(d) > tol) throw new Error(`${ctx}: ${sel} and ${sel2} left edges differ by ${Math.round(d)}px (±${tol})`);
        },
        sameWidth(sel2, tol = DEFAULT_TOL) {
          const a = $(sel), b = $(sel2);
          need(ctx, [sel, a], [sel2, b]);
          const d = LM.alignDeltas(a, b).widthDelta;
          if (Math.abs(d) > tol) throw new Error(`${ctx}: ${sel} and ${sel2} widths differ by ${Math.round(d)}px (±${tol})`);
        },
        centered(within = '.panel', tol = DEFAULT_TOL) {
          const e = $(sel), c = $(within);
          need(ctx, [sel, e], [within, c]);
          const d = LM.centerDeltaWithin(e, c);
          if (Math.abs(d) > tol) throw new Error(`${ctx}: ${sel} center is ${Math.round(d)}px off ${within} center (±${tol})`);
        },
      };
    }

    return { fits, gap, el };
  }

  // The public entry point. Renders the named Fixture (worst-case banner default, matching the
  // suite) and wraps each matcher call in an it() so it shows as its own pass/fail line.
  function expectLayout(fixtureName, size, callback) {
    const [w, h] = size.split('x').map(Number);
    // Self-gate: the suite runs this page at every binding size; only act at the target one.
    if (window.innerWidth !== w || window.innerHeight !== h) return;

    describe(`DSL · ${fixtureName} @ ${size}`, () => {
      renderFixture(fixtureName, { defaultMod: 'bj_wild_split' });
      const ctx = `${fixtureName}@${size}`;
      const bare = makeBareL(ctx);

      const L = {
        fits: () => it(`${ctx} · fits`, () => bare.fits()),
        gap: (a, b) => ({
          is:      (px, tol) => it(`${ctx} · gap ${a}→${b} is ${px}`,    () => bare.gap(a, b).is(px, tol)),
          atMost:  (px, tol) => it(`${ctx} · gap ${a}→${b} ≤ ${px}`,     () => bare.gap(a, b).atMost(px, tol)),
          atLeast: (px, tol) => it(`${ctx} · gap ${a}→${b} ≥ ${px}`,     () => bare.gap(a, b).atLeast(px, tol)),
        }),
        el: (sel) => ({
          sameLeft:  (s2, tol) => it(`${ctx} · ${sel} sameLeft ${s2}`,  () => bare.el(sel).sameLeft(s2, tol)),
          sameWidth: (s2, tol) => it(`${ctx} · ${sel} sameWidth ${s2}`, () => bare.el(sel).sameWidth(s2, tol)),
          centered:  (wn, tol) => it(`${ctx} · ${sel} centered`,        () => bare.el(sel).centered(wn, tol)),
        }),
      };

      callback(L);
    });
  }

  root.expectLayout = expectLayout;
  root.makeBareL = makeBareL;
})(typeof window !== 'undefined' ? window : this);
