// ─── UI Lab boot smoke test ───────────────────────────────────────────────────
// Proves the dev server boots, serves the lab shell, injects the live-reload listener, and that
// the lab frame renders a chosen Fixture (the iframe produces a .panel), including the results
// Screen's distribution chart, which the frame stubs offline. A smoke check, not a full
// integration test (per PRD-ui-tweak-pipeline.md Testing Decisions).
//
// Run on demand:  npm run lab:smoke   (or: node tests/lab-smoke.js)
// Deliberately NOT part of `npm test`: the lab + dev server are on-demand dev tools.
// First time: npx playwright install chromium (npm install pulls it in).

process.env.LAB_PORT = process.env.LAB_PORT || '5188'; // isolated port so a running lab doesn't clash
const { chromium } = require('playwright');
const lab = require('../lab/lab-serve.js'); // requiring starts server.listen()
const BASE = `http://localhost:${lab.PORT}`;

(async () => {
  let fails = 0;
  const check = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

  await new Promise(r => setTimeout(r, 300)); // let listen() settle
  const browser = await chromium.launch();
  try {
    // 1: shell page is served, with its toolbar.
    const shell = await browser.newPage();
    await shell.goto(BASE + '/');
    check((await shell.title()) === 'Gambdle · UI Lab', 'dev server serves the lab shell');
    check(await shell.$('#sel-screen') !== null, 'shell toolbar has the Screen dropdown');
    check((await shell.$$('#sel-screen option')).length >= 20, 'Screen dropdown is populated from the registry');

    // 2: live-reload listener injected into served HTML.
    const raw = await (await fetch(BASE + '/')).text();
    check(raw.includes('__livereload'), 'live-reload listener injected into served HTML');

    // 3: the lab frame renders a chosen Fixture into a .panel.
    const frame = await browser.newPage();
    await frame.goto(BASE + '/lab/frame.html?fixture=bj-bet&size=1280x800');
    await frame.waitForSelector('.panel', { timeout: 8000 });
    check(await frame.$('.panel') !== null, 'lab frame renders bj-bet → .panel');

    // 4: the results Screen renders its distribution chart fully offline (stubbed Supabase).
    await frame.goto(BASE + '/lab/frame.html?fixture=results&size=1280x800');
    await frame.waitForSelector('#dist-chart .dist-bar', { timeout: 8000 });
    check(await frame.$('#dist-chart .dist-bar') !== null, 'results fixture renders the distribution chart offline');

    // 5: a pinned-modifier fixture shows its banner.
    await frame.goto(BASE + '/lab/frame.html?fixture=ladder-climb&size=1280x800');
    await frame.waitForSelector('.mod-banner', { timeout: 8000 });
    check(await frame.$('.mod-banner') !== null, 'ladder-climb fixture renders its pinned modifier banner');
  } finally {
    await browser.close();
  }

  console.log(fails ? `\n❌ lab smoke: ${fails} check(s) failed` : `\n✅ lab smoke: all checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
