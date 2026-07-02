// ─── Layout measurement core ──────────────────────────────────────────────────
// Pure geometry for the currently-rendered Screen: zoom factor, fit/overflow deltas,
// element gaps, and alignment deltas. Every function returns NUMBERS and asserts NOTHING,
// and nothing here imports the test runner, so it's reusable and testable in isolation.
//
// Two consumers share this ONE code path so they can never disagree about what "fits":
//   • the layout suite's checkScreen()/checkNoPooledSlack()/checkHeadlineTight()
//   • the Layout DSL's L.fits()/L.gap()/L.el() matchers (tests/layout-dsl.js)
//
// Loaded as a browser <script> in the layout-test harness (and the UI Lab) AFTER the game
// scripts, so it can read the live DOM via getBoundingClientRect()/getComputedStyle().
// See PRD-ui-tweak-pipeline.md (Measurement core).

(function (root) {
  'use strict';

  // The fit tolerances the suite enforces, shared so checkScreen() and the DSL's L.fits()
  // can never drift on what "fits" means (px).
  const FIT_TOL = {
    vert: 10,          // mobile window/last-child vertical overflow
    horiz: 2,          // horizontal overflow (any viewport)
    panelScroll: 5,    // desktop panel internal scroll
    modTopDesktop: 16, // modifier banner max offset below panel top (desktop)
    modTopMobile: 12,  // …and mobile
  };

  // Desktop ≥1024px uses the fixed-height window; below that is the mobile shell.
  function isDesktop() { return window.innerWidth >= 1024; }

  // On large displays `.app` gets a CSS `zoom` (styles.css large-display block).
  // getBoundingClientRect returns POST-zoom geometry while getComputedStyle returns PRE-zoom
  // values, so any comparison between the two must normalize by this factor. Window-vs-viewport
  // overflow checks must NOT normalize: a zoomed window really occupies zoomed screen pixels.
  function appZoom() {
    const a = document.querySelector('.app');
    return a ? (parseFloat(getComputedStyle(a).zoom) || 1) : 1;
  }

  // Visible (height > 0) direct children of an element, in document order.
  function visibleChildren(el) {
    return [...el.children].filter(c => c.getBoundingClientRect().height > 0);
  }

  // Fit / overflow measurement of the currently-rendered Screen. Returns the exact primitives
  // checkScreen() asserts on: raw where it compares raw (overflow vs viewport) and rounded
  // where it compares rounded (panel-internal geometry). No assertions, no thresholds.
  function measureFit() {
    const win   = document.querySelector('.window');
    const panel = document.querySelector('.panel');
    const sb    = document.querySelector('.status-bar');
    const vw = window.innerWidth, vh = window.innerHeight;

    const rect      = win   ? win.getBoundingClientRect()   : null;
    const panelRect = panel ? panel.getBoundingClientRect() : null;
    const kids      = panel ? visibleChildren(panel) : [];
    const lastKid   = kids[kids.length - 1];
    const mod       = panel ? panel.querySelector('.mod-banner') : null;

    const lastBottomInPanel = (lastKid && panelRect)
      ? Math.round(lastKid.getBoundingClientRect().bottom - panelRect.top) : 0;

    return {
      hasWindow: !!win,
      hasPanel:  !!panel,
      vw, vh,
      // Raw overflow vs the real viewport (NOT zoom-normalized, see appZoom note).
      horizOver: rect ? rect.right - vw  : 0,
      vertOver:  rect ? rect.bottom - vh : 0,
      // Desktop: fixed-height window. Does panel content scroll, and how much slack is left?
      panelScroll: panel ? Math.round(panel.scrollHeight - panel.clientHeight) : 0,
      panelSlack:  (panelRect) ? Math.round(panelRect.height - lastBottomInPanel) : 0,
      lastBottomInPanel,
      // Mobile: absolute bottom of the last panel child vs the top of the status bar (taskbar).
      lastBottomViewport: lastKid ? Math.round(lastKid.getBoundingClientRect().bottom) : -1,
      sbTop: sb ? Math.round(sb.getBoundingClientRect().top) : vh,
      // Modifier banner: how far below the panel top it sits (null when no banner present).
      modBannerTop: (mod && panelRect)
        ? Math.round(mod.getBoundingClientRect().top - panelRect.top) : null,
    };
  }

  // Gap (px, zoom-normalized) between the bottom of elA and the top of elB.
  function gapBetween(elA, elB) {
    return (elB.getBoundingClientRect().top - elA.getBoundingClientRect().bottom) / appZoom();
  }

  // Largest gap (px, zoom-normalized) between consecutive visible panel children, plus a
  // `a→b` label of where it is. Catches leftover slack pooled into one band.
  function maxChildGap(panel) {
    const zoom = appZoom();
    const kids = visibleChildren(panel);
    let maxGap = 0, where = '';
    for (let i = 1; i < kids.length; i++) {
      const gap = (kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom) / zoom;
      if (gap > maxGap) { maxGap = gap; where = `${kids[i - 1].className.split(' ')[0]}→${kids[i].className.split(' ')[0]}`; }
    }
    return { maxGap, where };
  }

  // Alignment deltas (px, zoom-normalized) of elB relative to elA. Zero = aligned.
  function alignDeltas(elA, elB) {
    const zoom = appZoom();
    const a = elA.getBoundingClientRect(), b = elB.getBoundingClientRect();
    return {
      leftDelta:   (b.left  - a.left)  / zoom,
      rightDelta:  (b.right - a.right) / zoom,
      widthDelta:  (b.width - a.width) / zoom,
      centerDelta: ((b.left + b.right) - (a.left + a.right)) / 2 / zoom,
    };
  }

  // Horizontal center delta (px, zoom-normalized) of `el` within `container`.
  // Zero = el is horizontally centered in container; + = el center is to the right.
  function centerDeltaWithin(el, container) {
    const zoom = appZoom();
    const e = el.getBoundingClientRect(), c = container.getBoundingClientRect();
    return ((e.left + e.right) - (c.left + c.right)) / 2 / zoom;
  }

  root.LayoutMeasure = {
    FIT_TOL,
    isDesktop, appZoom, visibleChildren, measureFit,
    gapBetween, maxChildGap, alignDeltas, centerDeltaWithin,
  };
})(typeof window !== 'undefined' ? window : this);
