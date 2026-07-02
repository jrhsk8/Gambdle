// Node-side verification of the Deno engine bundle (supabase/functions/_shared/engine-bundle.mjs)
// that submit-score imports for server replay (integrity Phase 2, Thread A). The browser suite
// (tests/engine.test.js) already proves replayRun === recalcChips against the LIVE game functions;
// this proves the SAME engine, once concatenated + stubbed for Deno, (a) loads fully, with every
// game's replay path reachable and no missing cross-file global, and (b) computes the
// RNG-independent goldens and the seed-parameterized modifier resolution the server depends on.
//
// Run standalone:  node tests/engine-bundle.node.test.js
// Also invoked by tests/run.js before the browser suite (so `npm test` covers it).

const path = require('path');
const { pathToFileURL } = require('url');

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']; // mirrors core.js for ladder calls
const SEED = 20260505; // Day 1 (CYCLE_ORDER[0] = r_hot_numbers); no seed override, deterministic deal

async function run() {
  const results = [];
  const ok = (name, cond, extra) => results.push({ name, pass: !!cond, extra: cond ? '' : (extra || '') });
  const throws = async (name, fn, reason) => {
    try { await fn(); ok(name, false, 'did not throw'); }
    catch (e) { ok(name, e && e.replayReason === reason, `reason=${e && e.replayReason} want=${reason}`); }
  };

  const url = pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'engine-bundle.mjs')).href;
  const E = await import(url);
  const { replayRun, replayDayMods, replayRngSeed, buildDeal, replayConfigHorizon } = E;

  // ── modifier resolution (the server's derivation of the day's preset) ──
  ok('day1 cycle → Hot Numbers', replayDayMods(20260505, null)?.title === 'Hot Numbers');
  const lad = replayDayMods(20260614, null); // DAILY_MODIFIERS override
  ok('20260614 override → The Ladder', lad?.title === 'The Ladder' && lad?.ladder_free === 250, JSON.stringify(lad));
  const pcNoPick = replayDayMods(20260611, null); // players_choice day, uncommitted
  ok('players_choice unpicked → has choices', Array.isArray(pcNoPick?.choices) && pcNoPick.choices.length === 3);
  const pcPicked = replayDayMods(20260611, 'bj_first_ace'); // committed pick resolves through
  ok('players_choice + pick → resolved preset', pcPicked?.bj_first_ace === true, JSON.stringify(pcPicked));
  ok('replayRngSeed override (20260615 → 20250422)', replayRngSeed(20260615) === 20250422, String(replayRngSeed(20260615)));
  ok('replayRngSeed passthrough', replayRngSeed(20260505) === 20260505);
  // config horizon: the enforce gate submit-score reads. Furthest day the bundled config covers.
  const horizon = replayConfigHorizon();
  ok('config horizon is a calendar seed >= a known configured day', Number.isInteger(horizon) && horizon >= 20260617, String(horizon));

  const rngSeed = replayRngSeed(SEED);
  const deal = buildDeal(rngSeed);
  ok('buildDeal shape', deal.bjShoe.length === 208 && deal.uthDeck.length === 52 && deal.ladderCards.length === 8);

  // ── GOLDEN 1: roulette, bet every number → exactly one 35:1 winner, 36 losers → net −1 (house edge) ──
  // RNG-INDEPENDENT: holds for whatever pocket the words map to. Validates spin mapping lands on a
  // valid pocket + straight-bet payout + stake/credit accounting, with mods=null (vanilla payouts).
  {
    const bets = Array.from({ length: 37 }, (_, p) => [p, 1]); // picks 0..36 = straight numbers
    const tx = [{ g: 'r', a: 'spin', bets, respin: false }];
    const r = replayRun(rngSeed, null, tx, { spinWords: { 0: [123, 456, 789, 101112] } });
    ok('roulette all-numbers → net −1', r.chips === 1000 - 1 && r.rNet === -1, JSON.stringify(r));
  }

  // ── GOLDEN 2: ladder, one correct hi/lo call then cash → pot(stake,1) − stake = +50 on a 100 stake ──
  // Deterministic: computed from the first two ladder cards under the game's own rank ordering.
  {
    const rv = c => RANKS.indexOf(c.r);
    const c0 = rv(deal.ladderCards[0]), c1 = rv(deal.ladderCards[1]);
    let tx, expChips;
    if (c1 === c0) { // tie → any call crashes; non-free crash = −stake
      tx = [{ g: 'lad', a: 'stake', v: 100 }, { g: 'lad', a: 'hi' }];
      expChips = 1000 - 100;
    } else {
      const call = c1 > c0 ? 'hi' : 'lo';
      tx = [{ g: 'lad', a: 'stake', v: 100 }, { g: 'lad', a: call }, { g: 'lad', a: 'cash' }];
      expChips = 1000 + (Math.round(100 * 1.5) - 100); // +50
    }
    const r = replayRun(rngSeed, null, tx, {});
    ok('ladder one-call settle', r.chips === expChips, `got ${r.chips} want ${expChips}`);
  }

  // ── CLOSURE: every game's replay path runs end-to-end without a missing-dependency ReferenceError ──
  {
    const mixed = [
      { g: 'bj', a: 'deal', h: 0, bet: 100 }, { g: 'bj', a: 'stand' },
      { g: 'bj', a: 'deal', h: 1, bet: 100 }, { g: 'bj', a: 'hit' }, { g: 'bj', a: 'stand' },
      { g: 'bj', a: 'deal', h: 2, bet: 100 }, { g: 'bj', a: 'double' },
      { g: 'uth', a: 'deal', h: 0, ante: 100 }, { g: 'uth', a: 'check' }, { g: 'uth', a: 'check' },
      { g: 'uth', a: 'deal', h: 1, ante: 100 }, { g: 'uth', a: 'raise', mult: 4 },
      { g: 'uth', a: 'deal', h: 2, ante: 100 }, { g: 'uth', a: 'fold' },
      { g: 'r', a: 'spin', bets: [[0, 50], [45, 50]], respin: false },
    ];
    const r = replayRun(rngSeed, null, mixed, { spinWords: { 0: [11, 22, 33, 44] } });
    ok('mixed run returns finite integer chips', Number.isInteger(r.chips) && r.chips >= 0, JSON.stringify(r));
  }

  // ── LEGALITY: illegal events abort with the expected machine reason ──
  await throws('bj_overbet', () => replayRun(rngSeed, null, [{ g: 'bj', a: 'deal', h: 0, bet: 999999 }], {}), 'bj_overbet');
  await throws('double_borrow', () => replayRun(rngSeed, null, [{ g: 'sys', a: 'borrow', amt: 50 }, { g: 'sys', a: 'borrow', amt: 50 }], {}), 'double_borrow');
  await throws('r_no_words', () => replayRun(rngSeed, null, [{ g: 'r', a: 'spin', bets: [[0, 10]] }], {}), 'r_no_words');
  await throws('lad_cash_norung', () => replayRun(rngSeed, null, [{ g: 'lad', a: 'stake', v: 100 }, { g: 'lad', a: 'cash' }], {}), 'lad_cash_norung');

  const fails = results.filter(r => !r.pass);
  return { pass: results.length - fails.length, fail: fails.length, total: results.length, fails };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ pass, fail, total, fails }) => {
    for (const f of fails) console.log(`  FAIL ${f.name}  ${f.extra}`);
    console.log(fail ? `❌ ENGINE BUNDLE: ${fail}/${total} failed` : `✅ ENGINE BUNDLE: all ${total} checks passed`);
    process.exit(fail ? 1 : 0);
  }).catch(e => { console.error('engine-bundle test crashed:', e); process.exit(1); });
}
