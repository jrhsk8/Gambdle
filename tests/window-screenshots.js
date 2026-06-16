// Generates review screenshots of the game at a range of window sizes, in Chromium.
// Companion to tests/screenshots.js (which is iPhone/WebKit-only). Use this to eyeball
// desktop layout and the large-display zoom steps (2560×1440 → 1.25×, 3840×2160 → 1.8×;
// see the large-display block in styles.css).
//
// Run:   npm run screenshots:windows
//        node tests/window-screenshots.js                 # every screen × every size
//        node tests/window-screenshots.js 2560            # only sizes whose label matches "2560"
//        node tests/window-screenshots.js uth             # all sizes, only screens matching "uth"
//        node tests/window-screenshots.js 3840 uth-flop   # 3840-wide size, only the uth-flop screen
// Args are matched against size labels and screen names automatically, so order
// doesn't matter and you never need to pass an empty placeholder (PowerShell drops
// empty-string args, which made positional filters fragile).
//
// Writes screenshots/<GAME_VERSION>/windows/<size>__<screen>.png  (screenshots/ is git-ignored).
// Renders are tagged by game version and version folders >3 versions old are auto-pruned; see
// tests/screenshot-versioning.js. First time: npx playwright install chromium  (npm install pulls it in).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { versionedOutDir } = require('./screenshot-versioning');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';

// Shared Fixture registry (tests/screen-fixtures.js) — injected wholesale into the page,
// then driven by name via renderFixture(). The inline per-screen state that used to live
// here is gone; this script just chooses WHICH fixtures to capture and in what order.
const FIXTURES_SRC = fs.readFileSync(path.join(__dirname, 'screen-fixtures.js'), 'utf8');

// Window sizes to capture. Mobile uses the phone shell; everything ≥1024 uses the
// desktop chrome; the last two exercise the large-display zoom steps.
const SIZES = [
  { label: '0360x780-mobile', w:  360, h:  780, mobile: true },
  { label: '0375x812-mobile', w:  375, h:  812, mobile: true },
  { label: '0393x852-mobile', w:  393, h:  852, mobile: true },
  { label: '1024x1080',       w: 1024, h: 1080 },
  { label: '1280x800',        w: 1280, h:  800 },
  { label: '1440x900',        w: 1440, h:  900 },
  { label: '1920x1080',       w: 1920, h: 1080 },
  { label: '2560x1440-z1.25', w: 2560, h: 1440 },
  { label: '3840x2160-z1.8',  w: 3840, h: 2160 },
];

// Which fixtures this Chromium pass captures, in review order. State lives in the shared
// registry (screen-fixtures.js); this is just the selection + ordering. The PNG filename is
// the fixture name, so this set reproduces the same review shots as before.
const SCREENS = [
  'intro', 'choice', 'bj-bet', 'bj-play', 'bj-result', 'bj-result-last',
  'uth-bet', 'uth-flop', 'uth-showdown',
  'roulette-bet', 'roulette-bet-max', 'roulette-spinning', 'roulette-result',
  'results', 'ladder-bet-free', 'ladder-climb', 'ladder-crash', 'ladder-cash',
];

(async () => {
  // Match each arg against size labels and screen names; order-independent.
  const args = process.argv.slice(2).filter(Boolean);
  const sizeArgs   = args.filter(a => SIZES.some(s => s.label.includes(a)));
  const screenArgs = args.filter(a => SCREENS.some(n => n.includes(a)));
  const bad = args.filter(a => !sizeArgs.includes(a) && !screenArgs.includes(a));
  if (bad.length) {
    console.error(`Unknown filter(s): ${bad.join(', ')}.\n` +
      `Sizes: ${SIZES.map(s => s.label).join(', ')}\nScreens: ${SCREENS.join(', ')}`);
    process.exit(1);
  }
  const sizes   = sizeArgs.length   ? SIZES.filter(s => sizeArgs.some(a => s.label.includes(a)))
                                    : SIZES;
  const screens = SCREENS.filter(name =>
    !screenArgs.length || screenArgs.some(a => name.includes(a)));

  // Resolve screenshots/<version>/windows, fresh each run so it only holds the current set
  // (stale/renamed shots otherwise pile up), and prune version folders >3 versions old. Only this
  // version's windows/ subfolder is wiped — the WebKit shots and other versions are left alone.
  const OUT = versionedOutDir('windows');
  const browser = await chromium.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  let count = 0;

  for (const size of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1,
      isMobile: !!size.mobile, hasTouch: !!size.mobile,
    });
    const page = await ctx.newPage();
    // Stub Supabase so the leaderboard / distribution chart resolve offline.
    await page.route('**/functions/v1/**', json({}));
    await page.route('**/rest/v1/**', json([]));
    await page.route('**/rpc/get_score_distribution', json([3,5,8,12,9,4,2].map((count, bucket) => ({ bucket, count }))));
    await page.route('**/rpc/get_percentile', json([{ top_pct: 28, total: 142 }]));
    await page.goto(BASE);
    await page.addScriptTag({ content: FIXTURES_SRC }); // defines SCREEN_FIXTURES + renderFixture

    for (const name of screens) {
      // renderFixture owns reset → setup → mod → render → afterRender; 'easy_dealer' is the
      // review default for states that don't pin their own modifier. Returns the settle hint.
      const settle = await page.evaluate((n) => {
        renderFixture(n, { defaultMod: 'easy_dealer' });
        return SCREEN_FIXTURES[n].settle || 1500;
      }, name);
      await page.waitForTimeout(settle); // settle deal anim / async chart
      await page.screenshot({ path: `${OUT}/${size.label}__${name}.png` });
      count++;
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`wrote ${count} screenshots to ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
