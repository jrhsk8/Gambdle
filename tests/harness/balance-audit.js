// ─── Balance audit sweep ──────────────────────────────────────────────────────
// Measures every Screen fixture at every binding size with balance-metrics.js and prints
// two ranked reports: the worst-balanced cells (score, higher = worse) and the biggest
// cross-screen role drifts (elements that should stay put but move between Screens; roles
// and groups come from balance-roles.js). Report-only: nothing here gates npm test.
//
// Run:   npm run audit:balance
//        node tests/harness/balance-audit.js 1280 uth          # filter by size label / fixture name
//        node tests/harness/balance-audit.js uth-reveal --json # machine-readable (verifier use)
// Args match size labels and fixture names automatically, like window-screenshots.js.
// Full results also land in screenshots/balance/report.json (screenshots/ is git-ignored).
//
// Drives lab/frame.html (which stubs fetch itself) via file:// in headless Chromium, injecting
// VT323 as a fully-loaded local FontFace so geometry is deterministic and offline, same as
// webkit-layout.js. See .claude/LAYOUT.md.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { BALANCE_ROLES, BALANCE_GROUPS } = require('./balance-roles');
const { SCREEN_FIXTURES } = require('./screen-fixtures');
const { SCORE } = require('./balance-metrics').BalanceMetrics;

const FRAME = 'file:///' + path.join(__dirname, '..', '..', 'lab', 'frame.html').replace(/\\/g, '/');
const VT323_DATA_URL = 'data:font/woff2;base64,' +
  fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'vt323-latin.woff2')).toString('base64');

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
const FIXTURES = Object.keys(SCREEN_FIXTURES);

// Cross-screen drift per size × group × role: how far the role's anchored edge ranges
// across the group's fixtures. Reported when it exceeds the role's declared tolerance.
function computeDrifts(cells) {
  const bySizeFixture = {};
  for (const c of cells) bySizeFixture[c.sizeLabel + '|' + c.fixture] = c;
  const drifts = [];
  for (const size of [...new Set(cells.map(c => c.sizeLabel))]) {
    for (const [group, fixtures] of Object.entries(BALANCE_GROUPS)) {
      for (const [roleName, role] of Object.entries(BALANCE_ROLES)) {
        const per = [];
        for (const fx of fixtures) {
          const cell = bySizeFixture[size + '|' + fx];
          const r = cell && cell.roles[roleName];
          if (r) per.push({ fixture: fx, value: r[role.anchor] });
        }
        if (per.length < 2) continue;
        const vals = per.map(p => p.value);
        const drift = Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10;
        if (drift > role.tol) drifts.push({ size, group, role: roleName, anchor: role.anchor, drift, tol: role.tol, per });
      }
    }
  }
  return drifts.sort((a, b) => (b.drift / b.tol) - (a.drift / a.tol));
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

(async () => {
  const rawArgs = process.argv.slice(2).filter(Boolean);
  const asJson = rawArgs.includes('--json');
  const args = rawArgs.filter(a => a !== '--json');
  const sizeArgs    = args.filter(a => SIZES.some(s => s.label.includes(a)));
  const fixtureArgs = args.filter(a => FIXTURES.some(n => n.includes(a)));
  const bad = args.filter(a => !sizeArgs.includes(a) && !fixtureArgs.includes(a));
  if (bad.length) {
    console.error(`Unknown filter(s): ${bad.join(', ')}.\n` +
      `Sizes: ${SIZES.map(s => s.label).join(', ')}\nFixtures: ${FIXTURES.join(', ')}`);
    process.exit(1);
  }
  const sizes = sizeArgs.length ? SIZES.filter(s => sizeArgs.some(a => s.label.includes(a))) : SIZES;
  const fixtures = FIXTURES.filter(n => !fixtureArgs.length || fixtureArgs.some(a => n.includes(a)));

  const browser = await chromium.launch();
  const cells = [], errors = [];
  for (const size of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1,
      isMobile: !!size.mobile, hasTouch: !!size.mobile,
    });
    const page = await ctx.newPage();
    await page.route('**/fonts.googleapis.com/**', r => r.abort());
    await page.route('**/fonts.gstatic.com/**', r => r.abort());
    await page.goto(FRAME + '?fixture=intro');
    await page.evaluate(async (url) => {
      const ff = new FontFace('VT323', `url(${url})`);
      await ff.load();
      document.fonts.add(ff);
      await document.fonts.ready;
    }, VT323_DATA_URL);

    for (const name of fixtures) {
      // One broken fixture shouldn't sink a 297-cell sweep: record the error and move on.
      try {
        const settle = await page.evaluate((n) => {
          renderFixture(n, { defaultMod: 'easy_dealer' });
          return SCREEN_FIXTURES[n].settle || 1500;
        }, name);
        await page.waitForTimeout(settle);
        const rep = await page.evaluate((n) => window.__computeBalance({ fixture: n }), name);
        if (rep) { rep.sizeLabel = size.label; cells.push(rep); }
      } catch (e) {
        errors.push({ size: size.label, fixture: name, error: String(e.message || e).split('\n')[0] });
      }
      if (!asJson) process.stdout.write(`\r${pad(size.label, 18)} ${pad(name, 22)} (${cells.length})   `);
    }
    await ctx.close();
  }
  await browser.close();
  if (!asJson) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const drifts = computeDrifts(cells);
  const report = { generated: null, cells, drifts, errors }; // caller stamps time if it needs one
  const outDir = path.join(__dirname, '..', '..', 'screenshots', 'balance');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));

  if (asJson) { console.log(JSON.stringify(report)); return; }

  const ranked = [...cells].sort((a, b) => b.score - a.score);
  const flagged = ranked.filter(c => c.flagged);
  const shown = ranked.slice(0, Math.max(15, flagged.length));
  console.log(`\n=== Worst cells (score ≥ ${SCORE.flagAt} flagged; ${flagged.length}/${cells.length} flagged) ===`);
  console.log(pad('score', 6) + pad('fixture', 22) + pad('size', 18) + pad('flags', 30) + 'worst band');
  for (const c of shown) {
    console.log(pad(c.score, 6) + pad(c.fixture, 22) + pad(c.sizeLabel, 18) +
      pad(c.flags.join(','), 30) + `${c.metrics.maxBandPct}% ${c.metrics.maxBandAt}`);
  }

  console.log(`\n=== Role drift (moves between Screens; over tolerance only; ${drifts.length} found) ===`);
  console.log(pad('drift', 7) + pad('tol', 5) + pad('role', 11) + pad('anchor', 8) + pad('group', 16) + pad('size', 18) + 'per fixture');
  for (const d of drifts.slice(0, 40)) {
    console.log(pad(d.drift, 7) + pad(d.tol, 5) + pad(d.role, 11) + pad(d.anchor, 8) + pad(d.group, 16) + pad(d.size, 18) +
      d.per.map(p => `${p.fixture}:${p.value}`).join(' '));
  }
  if (drifts.length > 40) console.log(`… ${drifts.length - 40} more in screenshots/balance/report.json`);
  if (errors.length) {
    console.log(`\n=== Fixtures that failed to render (${errors.length}) ===`);
    for (const e of errors) console.log(`${pad(e.size, 18)}${pad(e.fixture, 22)}${e.error}`);
  }
  console.log(`\nfull report: screenshots/balance/report.json (${cells.length} cells)`);
})().catch(e => { console.error(e); process.exit(1); });
