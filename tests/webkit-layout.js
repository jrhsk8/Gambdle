// ─── WebKit (Safari engine) layout checks ──────────────────────────────────────
// Renders each interactive screen in WebKit — the engine iPhone Safari uses — across
// iPhone viewports, with and without simulated safe-area insets, and geometrically
// asserts that every tap target (buttons, chips, roulette tiles) is:
//   1. IN BOUNDS  — fully inside the window, above the status bar, not clipped.
//   2. NON-OVERLAPPING — no two tap targets sit on top of each other.
// This complements the Chromium suite (npm test), which can't reproduce Safari's
// exact metrics or the safe-area behaviour seen on real iPhones.
//
// Run: npm run test:webkit   (first time: npx playwright install webkit)

const { webkit } = require('playwright');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';

// Supported floor is iPhone 12/13-mini (360×780) and up — the user's reports are iPhone 15
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
//            Bottom = the floating Safari toolbar + home indicator (~55) — the emulator's
//            dvh does NOT shrink for the toolbar the way a real device does, so we model
//            it here to match what users actually see (the screenshots had it overlapping).
const INSETS = [
  { name: 'no-insets',  t: 0,  b: 0  },
  { name: 'ios-chrome', t: 59, b: 55 },
];

const FIXTURES = [
  'intro', 'bj-bet', 'bj-play', 'bj-result', 'bj-result-split',
  'uth-bet', 'uth-preflop', 'uth-flop', 'uth-turn', 'uth-result',
  'roulette-bet', 'roulette-bet-max', 'roulette-spinning-max', 'results', 'borrow',
];

// ── In-page: build a screen's state (uses the page's own card()/bestOf7()/render()) ──
function buildFixture(label) {
  Object.assign(S, JSON.parse(window.__SNAP));
  S.pkHeld = new Set();
  S.forcedMod = 'easy_dealer'; // a banner is always present on real days; doesn't change buttons
  const c = (r, s) => card(r, s);
  const hole = [c('7', 'h'), c('3', 'c')], dlr = [c('2', 'c'), c('A', 'c')];
  const comm = [c('8', 'h'), c('6', 's'), c('Q', 'h'), c('6', 'h'), c('A', 'd')];
  const F = {
    'intro':       () => { S.screen = 'intro'; S.chips = 1000; },
    'bj-bet':      () => { S.screen = 'bj'; S.bjPhase = 'bet'; S.chips = 1000; S.bjBet = 50; S.bjHand = 0; S.bjHistory = []; },
    'bj-play':     () => { S.screen = 'bj'; S.bjPhase = 'play'; S.chips = 950; S.bjBet = 50; S.bjHand = 0; S.bjHistory = []; S.bjPlayer = [c('K', 's'), c('7', 'h')]; S.bjDealer = [c('9', 'd'), c('5', 'c')]; S.bjDealerReveal = false; S.bjSplit = false; },
    'bj-result':   () => {
      S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 950; S.bjBet = 50; S.bjHand = 1; S.bjSplit = false; S.bjDealerReveal = true;
      S.bjPlayer = [c('K', 's'), c('9', 'h')]; S.bjDealer = [c('10', 'd'), c('9', 'c')];
      S.bjResult = { result: 'lose', delta: -50 };
      S.bjHistory = [{ bet: 50, result: 'lose', delta: -50, player: [...S.bjPlayer], dealer: [...S.bjDealer] }];
    },
    'bj-result-split': () => {
      S.screen = 'bj'; S.bjPhase = 'result'; S.chips = 1000; S.bjBet = 50; S.bjHand = 1; S.bjSplit = true; S.bjDealerReveal = true;
      S.bjSplitHands = [[c('8', 's'), c('K', 'h')], [c('8', 'h'), c('9', 'd')], [c('8', 'd'), c('Q', 'c')], [c('8', 'c'), c('J', 's')]];
      S.bjSplitResults = [{ result: 'win', delta: 50, bet: 50 }, { result: 'lose', delta: -50, bet: 50 }, { result: 'push', delta: 0, bet: 50 }, { result: 'win', delta: 50, bet: 50 }];
      S.bjSplitBets = [50, 50, 50, 50];
      S.bjDealer = [c('10', 'd'), c('9', 'c')];
      S.bjResult = { result: 'split', delta: 50 };
      S.bjHistory = [{ bet: 200, result: 'split', delta: 50, player: S.bjSplitHands.map(h => [...h]), dealer: [...S.bjDealer] }];
    },
    'uth-bet':     () => { S.screen = 'uth'; S.uthPhase = 'bet'; S.chips = 1000; S.uthAnte = 50; S.uthHand = 0; S.uthHistory = []; },
    'uth-preflop': () => { S.screen = 'uth'; S.uthPhase = 'preflop'; S.chips = 1200; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = []; S.uthHole = hole; S.uthDealer = dlr; S.uthComm = comm; S.uthRevealComm = 0; S.uthRaised = false; },
    'uth-flop':    () => { S.screen = 'uth'; S.uthPhase = 'flop'; S.chips = 1100; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = []; S.uthHole = hole; S.uthDealer = dlr; S.uthComm = comm; S.uthRevealComm = 3; S.uthRaised = false; },
    'uth-turn':    () => { S.screen = 'uth'; S.uthPhase = 'turn'; S.chips = 1100; S.uthAnte = 100; S.uthHand = 0; S.uthHistory = []; S.uthHole = hole; S.uthDealer = dlr; S.uthComm = comm; S.uthRevealComm = 5; S.uthRaised = false; },
    'uth-result':  () => {
      S.screen = 'uth'; S.uthPhase = 'result'; S.chips = 1050; S.uthHand = 1;
      S.uthHole = hole; S.uthDealer = dlr; S.uthComm = comm;
      const pb = bestOf7([...hole, ...comm]), db = bestOf7([...dlr, ...comm]);
      S.uthHistory = [{ ante: 25, blind: 25, play: 50, playMult: 1, result: 'lose', delta: -100, anteDelta: -25, blindDelta: -25, playDelta: -50, playerBest: pb, dealerBest: db, dealerQualifies: true }];
    },
    'roulette-bet':     () => { S.screen = 'roulette'; S.rPhase = 'bet'; S.chips = 500; S.rBet = 50; S.rPick = 17; S.rBets = []; },
    'roulette-bet-max': () => { S.screen = 'roulette'; S.rPhase = 'bet'; S.chips = 1000; S.rBet = 0; S.rPick = null; S.rBets = [{ pick: 45, bet: 50 }, { pick: 17, bet: 50 }, { pick: 40, bet: 50 }, { pick: 2, bet: 50 }, { pick: 31, bet: 50 }]; },
    'roulette-spinning-max': () => { S.screen = 'roulette'; S.rPhase = 'spinning'; S.chips = 0; S.rSpin = 17; S.rBets = [{ pick: 45, bet: 50 }, { pick: 17, bet: 50 }, { pick: 40, bet: 50 }, { pick: 37, bet: 50 }, { pick: 44, bet: 50 }]; },
    'results':          () => { S.screen = 'results'; S.chips = 1200; S.bjHand = 3; S.uthHand = 3; S.bjHistory = [{ delta: 200 }]; S.uthHistory = [{ delta: -50 }]; S.rResult = { delta: 0, skipped: true }; },
    'borrow':           () => { S.screen = 'borrow'; S.chips = 0; S.borrowReturnScreen = 'uth'; },
  };
  if (!F[label]) return false;
  F[label]();
  render();
  return true;
}

// ── In-page: geometric checks; returns an array of human-readable violations ──
// Rules (per design): horizontal scroll is NEVER allowed; every tap target must be
// reachable (never clipped off-screen) — it may sit below the fold on a phone smaller
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

  // RULE 1 — no horizontal page scroll, ever.
  if (pageW > vw + TOL) v.push(`HORIZONTAL SCROLL: page width ${R(pageW)} > viewport ${vw}`);

  // RULE 3 — on a config the game is designed to fit, content must not need vertical scroll.
  if (!allowVScroll && pageH > vh + TOL) v.push(`UNEXPECTED VERTICAL SCROLL: content ${R(pageH)} > viewport ${vh} (should fit without scrolling)`);

  for (const el of els) {
    const r = el.getBoundingClientRect();
    // RULE 2 — reachable: a tap target must lie within the scrollable document (never clipped off).
    const pageBottom = r.bottom + window.scrollY;
    if (pageBottom > pageH + TOL) v.push(`CLIPPED/UNREACHABLE ↓  ${desc(el)}  bottom=${R(pageBottom)} > scrollHeight ${R(pageH)}`);
    // RULE 1 (per element) — must fit within the window's width (board excluded; it scrolls internally).
    if (!inBoard(el)) {
      if (r.right > win.right + TOL) v.push(`OUT-OF-BOUNDS →  ${desc(el)}  right=${R(r.right)} > window right ${R(win.right)}`);
      if (r.left < win.left - TOL)   v.push(`OUT-OF-BOUNDS ←  ${desc(el)}  left=${R(r.left)} < window left ${R(win.left)}`);
    }
  }

  // Overlap — no two tap targets sit on top of each other.
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

(async () => {
  const browser = await webkit.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  let failChecks = 0, totalChecks = 0;
  const failLines = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    // Generic routes first, specific RPC mocks last — Playwright uses the LAST matching
    // route, so these score-distribution / percentile mocks win over **/rest/v1/** and the
    // results screen actually renders its chart (its true, taller height).
    await page.route('**/functions/v1/**', json({}));
    await page.route('**/rest/v1/**', json([]));
    await page.route('**/rpc/get_score_distribution', json([5, 8, 12, 16, 10, 5, 2].map((count, bucket) => ({ bucket, count }))));
    await page.route('**/rpc/get_percentile', json([{ top_pct: 44, total: 142 }]));
    await page.goto(BASE);
    await page.evaluate(() => { window.__SNAP = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] }); });

    for (const inset of INSETS) {
      await page.evaluate(({ t, b }) => {
        const s = document.documentElement.style;
        if (t || b) { s.setProperty('--sa-t', t + 'px'); s.setProperty('--sa-b', b + 'px'); }
        else { s.removeProperty('--sa-t'); s.removeProperty('--sa-b'); }
      }, inset);

      for (const fx of FIXTURES) {
        // Vertical scroll is the accepted fallback only when the usable area is smaller than
        // a screen is designed for: a short phone (<800px) with chrome, OR the terminal
        // results screen under chrome (it's chart-tall and only has Copy/Share — the toolbar
        // collapses on scroll). Gameplay screens on iPhone 15 must still FIT with no scroll.
        const allowVScroll = inset.b > 0 && (vp.height < 800 || fx === 'results');
        const built = await page.evaluate(buildFixture, fx);
        if (!built) continue;
        if (fx === 'results') await page.waitForTimeout(350); // let the async distribution chart render
        const violations = await page.evaluate(runChecks, { allowVScroll });
        totalChecks++;
        const tag = `[${vp.name} · ${inset.name}${allowVScroll ? ' · scroll-ok' : ''} · ${fx}]`;
        if (violations.length) {
          failChecks++;
          console.log(`✗ ${tag}`);
          violations.forEach(x => console.log(`     ${x}`));
          failLines.push(tag);
        } else {
          console.log(`✓ ${tag}`);
        }
      }
    }
    await ctx.close();
  }
  await browser.close();

  console.log('');
  if (failChecks === 0) {
    console.log(`✅ All ${totalChecks} WebKit layout checks passed (overlap + out-of-bounds)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failChecks} of ${totalChecks} WebKit layout checks failed:`);
    failLines.forEach(t => console.log(`   ${t}`));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
