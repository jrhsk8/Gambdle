// Headless test runner: opens tests/harness/test.html and tests/harness/layout-test.html in Chromium.
// Usage: npm test  (or:  node tests/harness/run.js)
// Quiet by default: on all-pass it prints one line per suite; failing pages always
// print full detail. Pass --verbose (or set GAMBDLE_TEST_VERBOSE=1) for the full
// per-section + per-screen layout-slack report.
// First run: npm install (installs playwright)

const { chromium } = require('playwright');

// Static module-boundary check first: it needs no browser and fails fast.
const boundaryProblems = require('./check-boundaries').check();
if (boundaryProblems.length) {
  console.error(`❌ MODULE BOUNDARIES: ${boundaryProblems.length} violation(s)`);
  for (const p of boundaryProblems) console.error('  • ' + p);
  process.exit(1);
}
console.log('MODULE BOUNDARIES: ✅ clean\n');

// Engine bundle (server-replay) must be regenerated whenever a bundled src file changes: the
// submit-score Edge Function imports it, so a stale bundle means client and server disagree.
// tests/harness/verify-bundle.js exposes the same check as a standalone pre-deploy CLI (run that before any
// `supabase functions deploy submit-score`, since a deploy can happen without `npm test` running).
const bundleCheck = require('./verify-bundle').verifyBundleFresh();
if (!bundleCheck.fresh) {
  console.error(`❌ ENGINE BUNDLE: ${bundleCheck.message}`);
  process.exit(1);
}

const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/';

// Opens a page, optionally at a specific viewport, waits for tests to finish,
// and returns the section data for reporting.
async function runPage(browser, file, viewport) {
  const page = await browser.newPage();
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(BASE + file);
  await page.waitForFunction(() => {
    const s = document.getElementById('summary');
    return s && s.className && s.className !== '';
  }, { timeout: 15000 });

  const data = await page.evaluate(() => ({
    summary: document.getElementById('summary').textContent.trim(),
    measurements: [...document.querySelectorAll('#measure-data > div')].map(el => ({
      label: el.dataset.label,
      value: parseInt(el.dataset.value),
    })),
    sections: [...document.querySelectorAll('.section-block')].map(el => ({
      name:  el.querySelector('.section-name')?.textContent  || '?',
      count: el.querySelector('.section-count')?.textContent || '',
      fails: [...el.querySelectorAll('.test-fail')].map(f => ({
        group: f.closest('.group-row')?.querySelector('.group-name')?.textContent || '',
        msg:   f.querySelector('.fail-msg')?.textContent || '',
        err:   f.querySelector('.fail-err')?.textContent || '',
      })),
    })),
  }));

  await page.close();
  return data;
}

function printSections(sections) {
  for (const sec of sections) {
    console.log(`[${sec.name}] ${sec.count}`);
    for (const f of sec.fails) {
      console.log(`  FAIL [${f.group}] ${f.msg}`);
      if (f.err) console.log(`       ${f.err}`);
    }
  }
}

function printMeasurements(measurements) {
  if (!measurements || !measurements.length) return;
  const sorted = [...measurements].sort((a, b) => a.value - b.value);
  console.log('  slack ↑ tightest first:');
  for (const m of sorted) {
    const flag = m.value < 40 ? '⚠ ' : m.value < 100 ? '· ' : '  ';
    console.log(`  ${flag}${m.label.padEnd(26)} ${m.value}px`);
  }
}

const anyFail = sections => sections.some(s => s.fails.length > 0);

const VERBOSE = process.argv.includes('--verbose') || !!process.env.GAMBDLE_TEST_VERBOSE;

// Parse {pass, fail} from a page's #summary text ("✅ All N tests passed" or "❌ N failed · M passed").
function summaryCounts(summary) {
  const allPass = summary.match(/All (\d+) tests passed/);
  if (allPass) return { pass: +allPass[1], fail: 0 };
  const f = summary.match(/(\d+) failed/), p = summary.match(/(\d+) passed/);
  return { pass: p ? +p[1] : 0, fail: f ? +f[1] : 0 };
}

(async () => {
  // Server-replay engine bundle: load it in Node and check it has everything it needs, plus the
  // RNG-independent goldens and seed-parameterized modifier resolution (tests/engine-bundle.node.test.js).
  const bundle = await require('../engine-bundle.node.test').run();
  console.log(bundle.fail
    ? `❌ ENGINE BUNDLE: ${bundle.fail}/${bundle.total} failed`
    : `ENGINE BUNDLE: ✅ all ${bundle.total} checks passed\n`);
  for (const f of bundle.fails) console.log(`  FAIL ${f.name}  ${f.extra}`);
  if (bundle.fail) process.exit(1);

  const browser = await chromium.launch();

  // Desktop sizes: covers the fluid clamp range and the narrow-but-tall case
  // (1024×1080) where the panel hits its width minimum but still needs to fit
  // the chip row and pay table without wrapping or overflow.
  const DESKTOP_SIZES = [
    { width: 1024, height: 1080 },
    // Short desktop window (laptop split-screen, or a user with enlarged browser/OS fonts): the
    // window must GROW past its clamp floor so tall screens (UTH showdown, 4-way split, results
    // chart) scroll into reach rather than clipping the bottom button. Guards the desktop
    // grow-on-overflow fix (.window min-height + .panel flex:1 0 auto, no overflow clip).
    { width: 1024, height:  640 },
    { width: 1280, height:  800 },
    { width: 1440, height:  900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },  // 1440p / 4K-at-150%: first zoom step (1.25×)
    { width: 3840, height: 2160 },  // true 4K-at-100%: second zoom step (1.5×)
  ];

  const [main, mobile, ...desktops] = await Promise.all([
    runPage(browser, 'test.html',        null),
    runPage(browser, 'layout-test.html', { width: 375, height: 812 }),
    ...DESKTOP_SIZES.map(s => runPage(browser, 'layout-test.html', s)),
  ]);

  await browser.close();

  // Grand total across every test type (unit and layout at every viewport) on the very top line.
  const unitC = summaryCounts(main.summary);
  const layoutC = [mobile, ...desktops].reduce((a, p) => {
    const c = summaryCounts(p.summary); a.pass += c.pass; a.fail += c.fail; return a;
  }, { pass: 0, fail: 0 });
  const totalPass = unitC.pass + layoutC.pass, totalFail = unitC.fail + layoutC.fail;
  console.log(totalFail
    ? `❌ SOME TESTS FAILED — ${totalPass} passed, ${totalFail} failed  (${unitC.pass} unit + ${layoutC.pass} layout)`
    : `✅ ALL ${totalPass} TESTS PASSED  (${unitC.pass} unit + ${layoutC.pass} layout)\n`);

  // Per-page detail: failing pages always print in full; passing pages print a
  // one-line summary unless --verbose.
  const printPage = (label, page, isLayout) => {
    const failed = anyFail(page.sections);
    console.log(`\n${label}: ${page.summary}`);
    if (failed || VERBOSE) {
      printSections(page.sections);
      if (isLayout) printMeasurements(page.measurements);
    }
  };

  printPage('UNIT', main, false);
  printPage('LAYOUT [375×812]', mobile, true);
  for (let i = 0; i < desktops.length; i++) {
    const s = DESKTOP_SIZES[i];
    printPage(`LAYOUT [${s.width}×${s.height}]`, desktops[i], true);
  }
  if (!VERBOSE) console.log('\n(--verbose for per-section detail and layout slack)');

  const failed = anyFail(main.sections) || anyFail(mobile.sections)
    || desktops.some(d => anyFail(d.sections));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
