// ─── WebKit (Safari engine) layout checks ──────────────────────────────────────
// Renders each interactive screen in WebKit (the engine iPhone Safari uses) across
// iPhone viewports, with and without simulated safe-area insets, and geometrically
// asserts that every tap target (buttons, chips, roulette tiles) is:
//   1. IN BOUNDS: fully inside the window, above the status bar, not clipped.
//   2. NON-OVERLAPPING: no two tap targets sit on top of each other.
// This complements the Chromium suite (npm test), which can't reproduce Safari's
// exact metrics or the safe-area behavior seen on real iPhones.
//
// Run: npm run test:webkit   (first time: npx playwright install webkit)

const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../../index.html';

// VT323 (the game's pixel font) self-hosted as a data: URL so the harness never races the Google Fonts
// CDN. Headless WebKit would sometimes report the CDN font as loaded yet never apply it to LAYOUT for a
// whole session, leaving text in the wider Courier-New fallback and spuriously tripping the no-scroll
// check. Injecting a fully-loaded FontFace from these bytes (see runOnce) makes every pass deterministic
// and the run fully offline. This is the latin subset, the only glyphs the English UI renders in VT323;
// chars outside it (e.g. →) fall back identically on a real device, so the metrics match. Font: VT323
// (Google Fonts, SIL OFL 1.1, see assets/VT323-OFL.txt), the exact woff2 the live CDN serves WebKit.
const VT323_DATA_URL = 'data:font/woff2;base64,' +
  fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'vt323-latin.woff2')).toString('base64');

// Shared Fixture registry (tests/harness/screen-fixtures.js): same source screenshots.js and
// window-screenshots.js inject. Fixture state lives there once; this file only picks which
// named states to geometry-check and drives them via renderFixture(). A new Screen state
// only has to be defined once to be covered by screenshots, the lab, and this suite.

// Supported floor is iPhone 12/13-mini (360×780) and up: the user's reports are iPhone 15
// (393×852). iPhone SE (375×667) is intentionally NOT tested yet.
// FUTURE IDEA: support iPhone SE (375×667). Several screens don't fit that short a window
// even before browser chrome; would need a more aggressive mobile-result compaction pass.
const VIEWPORTS = [
  { name: 'iPhone 12-mini 360×780', width: 360, height: 780 },
  { name: 'iPhone 15 393×852',      width: 393, height: 852 },
];

// Inset conditions drive --sa-t/--sa-b directly (env() is 0 in the emulator):
//   - none:  baseline, full window.
//   - ios:   worst realistic iPhone-Safari chrome. Top = Dynamic Island/status bar (~59).
//            Bottom = the floating Safari toolbar + home indicator (~55). The emulator's
//            dvh does NOT shrink for the toolbar the way a real device does, so we model
//            it here to match what users actually see (the screenshots had it overlapping).
const INSETS = [
  { name: 'no-insets',  t: 0,  b: 0  },
  { name: 'ios-chrome', t: 59, b: 55 },
];

// Which SCREEN_FIXTURES entries this pass geometry-checks, in review order. This is the union
// of what screenshots.js and window-screenshots.js already treat as review-worthy states, so a
// Screen doesn't need to be re-listed per script to get WebKit tap-target coverage. Two registry
// entries are deliberately left out: see the comment below the list.
const FIXTURES = [
  'intro', 'choice', 'borrow',
  'bj-bet', 'bj-play', 'bj-pick', 'bj-split-2', 'bj-split-3', 'bj-split-4', 'bj-result', 'bj-result-last', 'bj-split-result',
  'uth-bet', 'uth-preflop', 'uth-flop', 'uth-turn', 'uth-sixth', 'uth-showdown', 'uth-fold',
  'roulette-bet', 'roulette-bet-max', 'roulette-spinning', 'roulette-respin', 'roulette-result',
  'results',
  'ladder-bet-free', 'ladder-climb', 'ladder-crash', 'ladder-cash',
];
// Intentionally excluded (present in SCREEN_FIXTURES, not here):
//   - 'uth-reveal': the transient "Dealer Reveals" auto-advance frame (~2.3s, then moves itself
//     to the result). Neither screenshot script captures it either; it exists in the registry so
//     the lab can pin and eyeball it, not so an automated pass measures a frame that never holds still.
//   - 'bj-result-split-2' / '-3' / '-4': worst-case split-result states, but the registry's own
//     comment marks them "not in the screenshot sets, but available to the Layout DSL": they pin
//     bjDealerAnimFrom to force the mid-reveal dealer-card-slide animation frame, which the Chromium
//     Layout DSL is built to reason about (see layout-dsl.js) but this pass isn't. 'bj-split-result'
//     below already covers the settled 4-way split result geometry.

// ── In-page: geometric checks; returns an array of human-readable violations ──
// Rules: horizontal scroll is NEVER allowed; every tap target must be
// reachable (never clipped off-screen), it may sit below the fold on a phone smaller
// than a screen is designed for, reachable by vertical scroll; and on configs the game
// IS designed to fit (allowVScroll=false), the content must fit with no vertical scroll.
function runChecks(opts) {
  const allowVScroll = !!(opts && opts.allowVScroll);
  const R = n => Math.round(n);
  const TOL = 2;     // px slack for sub-pixel rounding
  const OVL = 2.5;   // px of intersection in BOTH axes before two targets "overlap"
  const panel = document.querySelector('.panel');
  const winEl = document.querySelector('.window');
  if (!panel || !winEl) return ['no .panel / .window rendered'];
  const win = winEl.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const docEl = document.documentElement, body = document.body;
  const pageH = Math.max(docEl.scrollHeight, body.scrollHeight); // full scrollable height
  const pageW = Math.max(docEl.scrollWidth, body.scrollWidth);   // full scrollable width

  const desc = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}${txt ? `"${txt}"` : ''}`;
  };

  const sel = 'button, .chbtn, .rn, .r2to1, .rout, .hold-wrap, [onclick]';
  let els = [...panel.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  });
  els = els.filter(el => el.classList.contains('hold-wrap') || !els.some(o => o !== el && el.contains(o)));
  const inBoard = el => !!el.closest('.r-board-wrap'); // roulette board scrolls horizontally inside itself by design

  const v = [];

  // RULE 1: no horizontal page scroll, ever.
  if (pageW > vw + TOL) v.push(`HORIZONTAL SCROLL: page width ${R(pageW)} > viewport ${vw}`);

  // RULE 3: on a config the game is designed to fit, content must not need vertical scroll.
  if (!allowVScroll && pageH > vh + TOL) v.push(`UNEXPECTED VERTICAL SCROLL: content ${R(pageH)} > viewport ${vh} (should fit without scrolling)`);

  for (const el of els) {
    const r = el.getBoundingClientRect();
    // RULE 2: reachable: a tap target must lie within the scrollable document (never clipped off).
    const pageBottom = r.bottom + window.scrollY;
    if (pageBottom > pageH + TOL) v.push(`CLIPPED/UNREACHABLE ↓  ${desc(el)}  bottom=${R(pageBottom)} > scrollHeight ${R(pageH)}`);
    // RULE 1 (per element): must fit within the window's width (board excluded; it scrolls internally).
    if (!inBoard(el)) {
      if (r.right > win.right + TOL) v.push(`OUT-OF-BOUNDS →  ${desc(el)}  right=${R(r.right)} > window right ${R(win.right)}`);
      if (r.left < win.left - TOL)   v.push(`OUT-OF-BOUNDS ←  ${desc(el)}  left=${R(r.left)} < window left ${R(win.left)}`);
    }
  }

  // Overlap: no two tap targets sit on top of each other.
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > OVL && oy > OVL) v.push(`OVERLAP  ${desc(a)}  ∩  ${desc(b)}  = ${R(ox)}×${R(oy)}px`);
  }
  return v;
}

// One full pass of the suite on a FRESH browser launch. Returns the failing check tags so the caller
// can re-run and drop per-launch flukes (see the call site). `verbose` streams the per-check ✓/✗.
async function runOnce(verbose) {
  const browser = await webkit.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  let totalChecks = 0;
  const failLines = [];

  // Read once per run, not per-page: page.addScriptTag({content}) below re-injects this same
  // text into each fresh WebKit page (Playwright pages don't share JS state across navigations).
  const fixturesSrc = fs.readFileSync(path.join(__dirname, 'screen-fixtures.js'), 'utf8');

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    // Generic routes first, specific RPC mocks last: Playwright uses the LAST matching
    // route, so these score-distribution / percentile mocks win over **/rest/v1/** and the
    // results screen actually renders its chart (its true, taller height).
    await page.route('**/functions/v1/**', json({}));
    await page.route('**/rest/v1/**', json([]));
    await page.route('**/rpc/get_score_distribution', json([5, 8, 12, 16, 10, 5, 2].map((count, bucket) => ({ bucket, count }))));
    await page.route('**/rpc/get_percentile', json([{ top_pct: 44, total: 142 }]));
    // Block the live font CDN: the page would otherwise race to fetch VT323 from Google Fonts. We serve
    // it deterministically from the local data: URL below instead, so the run is hermetic (and faster).
    await page.route('**/fonts.googleapis.com/**', r => r.abort());
    await page.route('**/fonts.gstatic.com/**', r => r.abort());
    await page.goto(BASE);
    await page.addScriptTag({ content: fixturesSrc }); // defines SCREEN_FIXTURES + renderFixture as page globals
    // Register VT323 as a fully-loaded FontFace before snapshotting, so every fixture lays out with the
    // real pixel-font metrics on the FIRST pass.
    await page.evaluate(async (url) => {
      const ff = new FontFace('VT323', `url(${url})`);
      await ff.load();
      document.fonts.add(ff);
      await document.fonts.ready;
    }, VT323_DATA_URL);

    for (const inset of INSETS) {
      await page.evaluate(({ t, b }) => {
        const s = document.documentElement.style;
        if (t || b) { s.setProperty('--sa-t', t + 'px'); s.setProperty('--sa-b', b + 'px'); }
        else { s.removeProperty('--sa-t'); s.removeProperty('--sa-b'); }
      }, inset);

      for (const fx of FIXTURES) {
        // Vertical scroll is the accepted fallback only when the usable area is smaller than
        // a screen is designed for: a short phone (<800px) with chrome, OR the terminal
        // results screen under chrome (it's chart-tall and only has Copy/Share; the toolbar
        // collapses on scroll). Gameplay screens on iPhone 15 must still FIT with no scroll.
        const allowVScroll = inset.b > 0 && (vp.height < 800 || fx === 'results');
        // renderFixture owns reset -> setup -> apply Modifier -> render() -> afterRender(); pin
        // 'easy_dealer' as the fallback banner (a banner is always present on a real day, this
        // doesn't change any button) for fixtures that don't pin their own via `mod`.
        const settle = await page.evaluate((n) => {
          renderFixture(n, { defaultMod: 'easy_dealer' });
          return SCREEN_FIXTURES[n].settle || 0;
        }, fx);
        if (settle) await page.waitForTimeout(settle); // e.g. 'results': let the async distribution chart render
        const violations = await page.evaluate(runChecks, { allowVScroll });
        // Results: the chart's bucket labels sit ~22px below the bars (out of flow); ensure they
        // clear the share box rather than overlapping it (the bug measured down to -9px on desktop;
        // here it guards the 360×780 floor, which has the smallest gaps).
        if (fx === 'results') {
          const gap = await page.evaluate(() => {
            const sb = document.querySelector('.share-box');
            const lbls = [...document.querySelectorAll('#dist-chart .dist-lbl')];
            if (!sb || !lbls.length) return null;
            const lowest = Math.max(...lbls.map(l => l.getBoundingClientRect().bottom));
            return Math.round(sb.getBoundingClientRect().top - lowest);
          });
          if (gap !== null && gap < 8) violations.push(`CHART GAP  bucket labels only ${gap}px from share box (min 8)`);
        }
        totalChecks++;
        const tag = `[${vp.name} · ${inset.name}${allowVScroll ? ' · scroll-ok' : ''} · ${fx}]`;
        if (violations.length) {
          if (verbose) { console.log(`✗ ${tag}`); violations.forEach(x => console.log(`     ${x}`)); }
          failLines.push(tag);
        } else if (verbose) {
          console.log(`✓ ${tag}`);
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  return { totalChecks, failLines };
}

(async () => {
  // First pass (normal streaming output).
  let { totalChecks, failLines } = await runOnce(true);
  // Safety net: confirm any failure on up to 2 fresh browser launches and keep only the ones that
  // persist (a real overflow fails every launch). VT323 is injected as a local fully-loaded FontFace
  // above, so the first pass is already deterministic, but the cheap re-check stays as insurance
  // against any other per-launch fluke. Re-runs happen ONLY after a failed first pass, so the
  // common all-pass run stays one fast pass.
  for (let i = 0; i < 2 && failLines.length; i++) {
    console.log(`\n… re-running ${failLines.length} failed check(s) on a fresh browser (per-launch font-flake guard ${i + 1}/2)…`);
    const again = await runOnce(false);
    failLines = failLines.filter(t => again.failLines.includes(t));
  }

  console.log('');
  if (!failLines.length) {
    console.log(`✅ All ${totalChecks} WebKit layout checks passed (overlap + out-of-bounds)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failLines.length} of ${totalChecks} WebKit layout checks failed:`);
    failLines.forEach(t => console.log(`   ${t}`));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
