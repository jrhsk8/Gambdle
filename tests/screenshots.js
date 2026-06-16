// Generates iPhone review screenshots in WebKit (Safari's real engine).
// Each screen is rendered at iPhone 15 (393×852) with realistic Safari chrome reserved
// (Dynamic Island/status bar ~59px top, floating toolbar ~55px bottom) drawn as faint
// labeled bands, so you can confirm content clears the chrome.
// Run: npm run screenshots   →   writes screenshots/*.png  (the folder is git-ignored)
// First time: npx playwright install webkit
const fs = require('fs');
const path = require('path');
const { webkit } = require('playwright');
const { versionedOutDir } = require('./screenshot-versioning');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
// screenshots/<GAME_VERSION>/webkit/  — versioned + auto-pruned (see screenshot-versioning.js).
const OUT = versionedOutDir('webkit');
const SA_T = 59, SA_B = 55;

// Shared Fixture registry (tests/screen-fixtures.js), injected wholesale and driven by name.
const FIXTURES_SRC = fs.readFileSync(path.join(__dirname, 'screen-fixtures.js'), 'utf8');

// [outputName, fixtureName] in review order. The numbered output names preserve the original
// filenames; the state itself now lives once in the shared registry.
const FIXTURES = [
  ['01-intro',            'intro'],
  ['02-bj-bet',           'bj-bet'],
  ['03-bj-play',          'bj-play'],
  ['04-bj-result',        'bj-result'],
  ['05-bj-split-result',  'bj-split-result'],
  ['06-uth-bet',          'uth-bet'],
  ['07-uth-preflop',      'uth-preflop'],
  ['08-uth-flop',         'uth-flop'],
  ['09-uth-turn',         'uth-turn'],
  ['10-uth-showdown',     'uth-showdown'],
  ['11-uth-fold',         'uth-fold'],
  ['12-roulette-bet',     'roulette-bet'],
  ['13-roulette-bet-max', 'roulette-bet-max'],
  ['14-roulette-result',  'roulette-result'],
  ['15-results',          'results'],
  ['16-borrow',           'borrow'],
];

(async () => {
  const browser = await webkit.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Generic routes first, specific RPC mocks last — Playwright uses the LAST matching
  // route, so the score-distribution / percentile mocks must win over **/rest/v1/**.
  await page.route('**/functions/v1/**', json({}));
  await page.route('**/rest/v1/**', json([]));
  await page.route('**/rpc/get_score_distribution', json([3, 5, 8, 12, 9, 4, 2].map((count, bucket) => ({ bucket, count }))));
  await page.route('**/rpc/get_percentile', json([{ top_pct: 28, total: 142 }]));
  await page.goto(BASE);
  await page.addScriptTag({ content: FIXTURES_SRC }); // defines SCREEN_FIXTURES + renderFixture
  await page.evaluate(({ t, b }) => {
    document.documentElement.style.setProperty('--sa-t', t + 'px');
    document.documentElement.style.setProperty('--sa-b', b + 'px');
  }, { t: SA_T, b: SA_B });

  for (const [name, fixture] of FIXTURES) {
    const settle = await page.evaluate((fx) => {
      renderFixture(fx, { defaultMod: 'easy_dealer' });
      return SCREEN_FIXTURES[fx].settle || 1500;
    }, fixture);
    await page.waitForTimeout(settle); // settle deal animation / async chart
    // Faint labeled bands marking the iOS chrome zones content must stay clear of.
    await page.evaluate(({ t, b }) => {
      document.querySelectorAll('.__chrome').forEach(e => e.remove());
      const band = (css, label) => { const d = document.createElement('div'); d.className = '__chrome'; d.style.cssText = 'position:fixed;left:0;right:0;z-index:99999;pointer-events:none;background:rgba(220,40,40,.22);color:#fff;font:600 10px sans-serif;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 2px #000;' + css; d.textContent = label; document.body.appendChild(d); };
      band(`top:0;height:${t}px`, 'Dynamic Island / status bar');
      band(`bottom:0;height:${b}px`, 'Safari toolbar / home indicator');
    }, { t: SA_T, b: SA_B });
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await browser.close();
  console.log('wrote', FIXTURES.length, 'screenshots to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
