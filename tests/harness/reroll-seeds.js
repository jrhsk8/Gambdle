// ─── Seed reroll ───────────────────────────────────────────────────────────────
// Scans future days with the Seed Checker (src/seedcheck.js) and, for every day whose combined
// forced-loss score (UTH showdown losses + BJ basic-strategy losses, 0-6) is above the cap,
// tries random replacement decks until one scores at or under the cap under that day's modifier.
// Results are written into DAILY_SEED_OVERRIDES in src/modifiers.js between the
// `reroll-seeds:begin` / `reroll-seeds:end` marker lines. Entries for days already past are kept.
//
// Run:   npm run reroll:seeds                  # tomorrow through +365 days, cap 3
//        node tests/harness/reroll-seeds.js 180 --max 2
//        node tests/harness/reroll-seeds.js --dry   # report only, don't write
// Starts at tomorrow (Phoenix time) so the day being played right now never changes.
//
// Replacement seeds are drawn from 90000000-99999999: never a real calendar date, and above
// BJ_SEGMENT_CUTOVER so blackjack deals in per-hand segments like every other current day.
// After writing, redeploy submit-score: the overrides are baked into its engine bundle.
// See .claude/SUPABASE.md.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const MODS_FILE = path.join(ROOT, 'src', 'modifiers.js');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?dev=true';
const BEGIN = '// reroll-seeds:begin', END = '// reroll-seeds:end';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? +args[maxIdx + 1] : 3;
const DAYS = +(args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--max') || 365);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof scanSeedDays === 'function');

  const res = await page.evaluate(({ DAYS, MAX }) => {
    const score = seed => { const r = scanSeedDays(seed, 1)[0]; return { t: r.uth.hi + r.bj.hi, mod: r.modTitle }; };
    const used = new Set(Object.values(DAILY_SEED_OVERRIDES).map(Number));
    const start = _nextDailySeed();
    const picks = [], stuck = [];
    for (let k = 0; k < DAYS; k++) {
      const seed = _scAddDays(start, k);
      const before = score(seed);
      if (before.t <= MAX) continue;
      const prev = DAILY_SEED_OVERRIDES[seed];
      let got = null;
      for (let tries = 0; tries < 1000 && !got; tries++) {
        const cand = 90000000 + Math.floor(Math.random() * 10000000);
        if (used.has(cand)) continue;
        DAILY_SEED_OVERRIDES[seed] = cand;
        const after = score(seed);
        if (after.t <= MAX) got = { seed, cand, was: before.t, now: after.t, mod: before.mod };
      }
      if (got) { used.add(got.cand); picks.push(got); }
      else { if (prev === undefined) delete DAILY_SEED_OVERRIDES[seed]; else DAILY_SEED_OVERRIDES[seed] = prev; stuck.push(seed); }
    }
    return { start, picks, stuck };
  }, { DAYS, MAX });
  await browser.close();

  console.log(`scanned ${DAYS} days from ${res.start}, cap ${MAX}/6: ${res.picks.length} rerolled` +
    (res.stuck.length ? `, ${res.stuck.length} with no deck found: ${res.stuck.join(', ')}` : ''));
  for (const p of res.picks) console.log(`  ${p.seed} ${p.mod}: ${p.was} -> ${p.now}`);
  if (dry || !res.picks.length) return;

  const src = fs.readFileSync(MODS_FILE, 'utf8');
  const b = src.indexOf(BEGIN), e = src.indexOf(END);
  if (b < 0 || e < b) throw new Error('reroll-seeds markers not found in src/modifiers.js');
  const lineStart = src.lastIndexOf('\n', b) + 1;
  const indent = src.slice(lineStart, b);
  const inner = src.slice(b + BEGIN.length, src.lastIndexOf('\n', e) + 1);

  // Keep earlier entries (past days, or future days that still pass), replaced by any new pick.
  const lines = new Map();
  for (const m of inner.matchAll(/^\s*(\d{8}): (\d+),(.*)$/gm)) lines.set(+m[1], `${m[1]}: ${m[2]},${m[3]}`);
  for (const p of res.picks) lines.set(p.seed, `${p.seed}: ${p.cand}, // was ${p.was}/6 (${p.mod})`);
  const body = [...lines.keys()].sort((x, y) => x - y).map(k => indent + lines.get(k)).join('\n');

  const out = src.slice(0, b + BEGIN.length) + '\n' + body + '\n' + indent + src.slice(e);
  fs.writeFileSync(MODS_FILE, out, 'utf8');
  console.log(`wrote ${lines.size} entries to src/modifiers.js. Redeploy submit-score.`);
})();
