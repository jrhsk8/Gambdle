// â”€â”€â”€ CONTENTS (grep the banner/function name; line numbers drift) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   GAME_VERSION Â· _ls storage wrapper Â· getDeviceId
//   mkRng (SplitMix32) Â· daily/backlog/test seeds Â· Phoenix day math
//     (getDailySeed, getActiveSeed, getRngSeed, getStateKey, getDayNum)
//   computeStreak Â· UNLOCKS Â· profileStats
//   game slots (GAME1/GAME2) Â· GAMES registry (GAME_META, NEXT_SCREEN) Â· next() run-order resolver
//   SUPABASE CONFIG (URL, anon key, SUPABASE_HEADERS) Â· DEV_OVERRIDE
//   modifier access: _activeMod, getMod, pendingPlayersChoice
//   CARD UTILITIES (buildDeck, shuffle, hVal, isBJ)
//   â†’ THE DEAL lifted to deal.js (genDeal â†’ DEAL, card/seed overrides)
//   chips: START_CHIPS, BORROW_AMOUNT, CHIP_TIERS/getTier, NET_TIERS/getNetTier
//   GLOBAL STATE (the S object) Â· borrow/bust helpers Â· winMult
//   CHIP ACCOUNTING (credit, debit) Â· Accountant/liveAcct Â· applyLedger
//   LEDGER ENTRY GRAMMAR (ledgerEntry, mkCredit/mkDebit, LEDGER_REASONS) â€” validated *Award builder seam
//   saveState / loadState   Â·   â†’ THE RECORD lifted to record.js (mkOutcome, recalcChips, gameNet/gameHistory, txLog + shape guards)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Set browser tab title
document.title = "â™ ï¸ Gambdle";

const GAME_VERSION = 'v1.84';

// Storage wrapper: tries localStorage, falls back to sessionStorage (private browsing).
// State survives tab refreshes in either case; sessionStorage clears when the tab closes.
const _ls = (() => {
  try { localStorage.setItem('_g','1'); localStorage.removeItem('_g'); return localStorage; }
  catch { return sessionStorage; }
})();

// Persistent anonymous device ID stored in localStorage â€” used for fingerprinting submissions.
// Generates a UUID once on first visit; same device gets the same ID across days.
function getDeviceId() {
  const KEY = 'gambdle_device_id';
  let id = _ls.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    _ls.setItem(KEY, id);
  }
  return id;
}

// SplitMix32-style seeded PRNG â€” returns a function that yields floats in [0, 1).
// The magic constant (0x6d2b79f5), Math.imul (32-bit integer multiply), and >>>0
// (coerce to unsigned 32-bit) are all required for correct avalanche behavior.
function mkRng(seed) {
  let s = (seed ^ 0x6d2b79f5) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000; // 0x100000000 = 2^32, normalizes to [0,1)
  };
}
// Returns today as a YYYYMMDD integer in Phoenix time (MST, UTC-7, no DST).
// Used as both the RNG seed and the _ls key â€” everyone resets at midnight Arizona.
const _PHOENIX_OFFSET_MS = 7 * 60 * 60 * 1000;
const getDailySeed = () => { const d=new Date(Date.now()-_PHOENIX_OFFSET_MS); return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(); };
// Returns the seed (YYYYMMDD) for the next Phoenix-time calendar day.
const _nextDailySeed = () => { const d=new Date(Date.now()-_PHOENIX_OFFSET_MS); d.setUTCDate(d.getUTCDate()+1); return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(); };
let _backlogSeed = (() => { const v=parseInt(_ls.getItem('gambdle_backlog_seed')||'0'); return v||null; })();
// Top-percentile (e.g. 12 = top 12%) for the current results run, filled in async by the
// leaderboard fetch. null until known / when there aren't enough players to be meaningful.
// buildShareText() reads it to add a "Finished Top X%" line once the rank comes back.
let _lbTopPct = null;
const getActiveSeed = () => _backlogSeed || getDailySeed();
// Test-only setter â€” lets dev-advanced.test.js override _backlogSeed without a page reload.
function _setBacklogSeedForTest(v) { _backlogSeed = v; }
// The test seed only takes effect in dev mode (?dev=true) or under the unit-test harness
// (which sets window.__GAMBDLE_TEST__) â€” never in normal play, even if the flag lingers in
// localStorage from a past dev session. DEV_OVERRIDE is read lazily (defined later in this file).
const _testActive = () => (!!DEV_OVERRIDE || !!(typeof window!=='undefined'&&window.__GAMBDLE_TEST__)) && !!_ls.getItem('gambdle_use_test_seed');
function getRngSeed() { return _testActive()?1:(DAILY_SEED_OVERRIDES[getActiveSeed()]||getActiveSeed()); }
function getStateKey() { return _testActive()?'gambdle_test_state':STORAGE_KEY+getActiveSeed(); }

/** Start of the daily Gambdle run (May 5th, 2026) used for consistent day numbering. */
const START_DATE_UTC = Date.UTC(2026, 4, 5);

// Derives day number from getDailySeed so both are always in sync.
const getDayNum = () => { const s=getDailySeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };
const getActiveDayNum = () => { const s=getActiveSeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };

// Absolute day index (days since START_DATE) for a YYYYMMDD seed â€” lets us tell whether
// two played days are calendar-adjacent regardless of month boundaries.
const _seedDayIndex = s => { const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000); };

/**
 * Daily streak from the player's completed-day history (gambdle_history, keyed by seed).
 * Returns { current, best }:
 *   - current: consecutive days played ending at `endSeed` (today by default). Pass
 *     includeEnd=true to count `endSeed` itself even if it isn't persisted yet â€” the
 *     results screen renders before saveState() writes today's entry.
 *   - best: longest consecutive run anywhere in history.
 * A missed day breaks the run. Reads localStorage defensively (corrupt JSON â†’ no streak).
 */
function computeStreak(endSeed = getDailySeed(), includeEnd = false) {
  let hist = {};
  try { hist = JSON.parse(_ls.getItem('gambdle_history') || '{}'); } catch (_e) {}
  const days = new Set(Object.keys(hist).map(s => _seedDayIndex(parseInt(s))));
  if (includeEnd) days.add(_seedDayIndex(endSeed));
  let current = 0, i = _seedDayIndex(endSeed);
  while (days.has(i)) { current++; i--; }
  const sorted = [...days].sort((a, b) => a - b);
  let best = sorted.length ? 1 : 0, run = 1;
  for (let k = 1; k < sorted.length; k++) { run = sorted[k] === sorted[k-1] + 1 ? run + 1 : 1; if (run > best) best = run; }
  return { current, best };
}

// Cosmetic unlock catalog â€” single source of truth for the profile window's badge grid.
// prefKey is the *_unlocked preference flag set when the player first hits the threshold;
// thresholds also appear as hint strings in the Preferences pickers (menus.js PICKER_ITEMS).
const UNLOCKS = [
  { prefKey: 'orange_back_unlocked', icon: 'ðŸŸ ', label: 'Orange Back', threshold: 1500 },
  { prefKey: 'green_theme_unlocked', icon: 'ðŸŒ¿', label: 'Green Theme', threshold: 2000 },
  { prefKey: 'maroon_felt_unlocked', icon: 'ðŸŸ¥', label: 'Maroon Felt', threshold: 2500 },
  { prefKey: 'deck_emoji_unlocked',  icon: 'ðŸ˜€', label: 'Emoji Deck',  threshold: 3500 },
  { prefKey: 'whale_back_unlocked',  icon: 'ðŸ‹', label: 'Whale Back',  threshold: 5000 },
  { prefKey: 'golden_back_unlocked', icon: 'âœ¨', label: 'Golden Back', threshold: 10000 },
];

/**
 * Lifetime stats for the Player Profile window, derived from gambdle_history and
 * gambdle_highscore. Returns all zeros (and a 28-cell all-'miss' calendar) for a new
 * player or a corrupt history; never throws.
 *   streak  â€” current daily streak. Counts back from today; if today isn't finished
 *             yet it counts back from yesterday instead (an unfinished today doesn't
 *             break the run â€” it only breaks once the day is actually missed).
 *   longest â€” longest consecutive run anywhere in history (computeStreak's best).
 *   calendar â€” last 28 Phoenix days, oldest first (index 27 = today):
 *             'profit' (>= START_CHIPS â€” breaking even counts), 'loss' (1..999),
 *             'bust' (0), 'miss' (no entry).
 */
function profileStats() {
  let hist = {};
  try { hist = JSON.parse(_ls.getItem('gambdle_history') || '{}'); } catch (_e) {}
  const byIndex = {};
  for (const [seed, sc] of Object.entries(hist)) {
    const n = Number(sc);
    if (Number.isFinite(n)) byIndex[_seedDayIndex(parseInt(seed))] = n;
  }
  const scores = Object.values(byIndex);
  const daysPlayed = scores.length;
  const high = parseInt(_ls.getItem('gambdle_highscore') || '0') || 0;
  const best = Math.max(high, ...scores, 0);
  const avg = daysPlayed ? Math.round(scores.reduce((a, b) => a + b, 0) / daysPlayed) : 0;
  const net = scores.reduce((a, b) => a + (b - START_CHIPS), 0);
  const busts = scores.filter(s => s === 0).length;
  const today = _seedDayIndex(getDailySeed());
  let streak = 0;
  for (let i = byIndex[today] !== undefined ? today : today - 1; byIndex[i] !== undefined; i--) streak++;
  const longest = computeStreak().best;
  const calendar = [];
  for (let i = today - 27; i <= today; i++) {
    const sc = byIndex[i];
    calendar.push(sc === undefined ? 'miss' : sc === 0 ? 'bust' : sc >= START_CHIPS ? 'profit' : 'loss');
  }
  const calDates = _calLabels(getDailySeed());
  return { daysPlayed, streak, longest, best, avg, net, busts, calendar, calDates };
}

// "M/D" date label (no leading zeros) for each of profileStats's 28 calendar cells, in the same
// order: oldest first, index 27 = today. `todaySeed` is a YYYYMMDD integer; walks back one
// calendar day per cell, so Date arithmetic handles every month/year boundary. Pure.
function _calLabels(todaySeed) {
  const y = Math.floor(todaySeed / 10000);
  const mo = Math.floor((todaySeed % 10000) / 100);
  const d = todaySeed % 100;
  const cur = new Date(Date.UTC(y, mo - 1, d));
  const labels = [];
  for (let i = 27; i >= 0; i--) {
    labels[i] = `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return labels;
}

// Creates a card object; s accepts shorthand ('s','h','d','c') or a direct suit symbol.
function card(r,s){return{r,s:{s:'â™ ',h:'â™¥',d:'â™¦',c:'â™£'}[s]||s};}

// Dev overrides (set by devSetGame); fall back to configured defaults.
const GAME1 = _ls.getItem('gambdle_dev_game1') || 'bj';
const GAME2 = _ls.getItem('gambdle_dev_game2') || 'uth';

// The Game registry â€” one table, keyed by SCREEN, that the lifecycle wiring reads instead of the
// scattered `S.screen` switches it replaces (the bet-phase guard `_inBetPhase`, the bet-key lookup
// `curBetRef`, and the borrow hand-counter `_borrowReturnScreen`). Add a new game here.
//   meta     â€” display payload (slot games only); the derived GAME_META below feeds the dev menu +
//              share text. Roulette is a playable screen but never a slot, so it has no meta.
//   phaseKey â€” the S field holding this screen's phase ('bet' during the initial bet phase)
//   betKey   â€” the S field holding the current bet amount
//   handKey  â€” the S field counting hands played (the 3-hand card games only; single-run games omit it)
//   reset    â€” the hand-reset fn, attached by each game's own file (which loads after core.js) and read
//              by the borrow flow to return the player to a fresh bet phase
//   nextHand â€” advances to the next hand (the result panel's advance button), attached by each card
//              game as () => _nextHand(<its reset>) and dispatched by advanceHand() (flow.js)
//   resume   â€” mid-animation refresh-restore fn, attached by each game's own file and dispatched by
//              _resumeAfterRefresh (game.js) keyed on S.screen. Each guards its own phase internally.
//              Blackjack is the exception Â· its resume (_bjResumeAfterRefresh) stays a separate boot
//              call because of its dealer-draw choreography.
//   patchBet â€” game-specific bet-UI surgical patch (the roulette selection box, the UTH stake summary
//              + pay table), dispatched by patchBetUI(bet) so the shared chip-UI patcher stays free of
//              per-game knowledge. Only roulette + UTH register one; others have no bet-UI extras.
// meta.short: label used in dev menu buttons and share text. meta.icon: on-screen SVG/glyph (rendered
// as HTML). meta.shareIcon: plain emoji/glyph for the copyable share text â€” must stay text, never <svg>.
const GAMES = {
  bj:      { meta: { icon: icon('cards'),  shareIcon: 'ðŸƒ', name: 'Blackjack',             short: 'Blackjack',    desc: '3 hands Â· Hit, Stand, Double, Split' }, phaseKey: 'bjPhase',  betKey: 'bjBet',   handKey: 'bjHand', historyKey: 'bjHistory', txKey: 'bj' },
  uth:     { meta: { icon: 'â™ ',            shareIcon: 'â™ ',  name: "Ultimate Texas Hold'em", short: "Hold'em",      desc: '3 hands Â· Ante, Blind & Play' },        phaseKey: 'uthPhase', betKey: 'uthAnte', handKey: 'uthHand', historyKey: 'uthHistory', txKey: 'uth' },
  poker:   { meta: { icon: 'â™ ',            shareIcon: 'â™ ',  name: '5 Card Poker',           short: '5 Card Poker', desc: '3 hands Â· Jacks or Better' },           phaseKey: 'pkPhase',  betKey: 'pkBet',   handKey: 'pkHand', historyKey: 'pkHistory', txKey: 'pk' },
  ladder:  { meta: { icon: icon('ladder'), shareIcon: 'ðŸªœ', name: 'The Ladder',             short: 'The Ladder',   desc: '1 run Â· Higher or lower, ties lose' },  phaseKey: 'ladPhase', betKey: 'ladBet', txKey: 'lad' },
  roulette:{ phaseKey: 'rPhase', betKey: 'rBet', txKey: 'r' },
};
// txKey: the short tag a game writes into the Transcript (txLog {g}) and the net bucket the replay
// Engine accumulates into â€” the one link between a game's registry entry and its replay handler.

// â”€â”€ reset(reason) bet-phase contract (finding #15) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every call to a game's reset â€” whether through the registry (GAMES[g].reset()) or a direct call to
// the underlying reset fn (resetBJHand/resetUTHHand/resetLadderRun/the poker inline) â€” passes a
// `reason` string naming why the caller wants a fresh bet phase. Today every reason produces IDENTICAL
// behavior (the reset fns accept and ignore it); it exists to make the call sites self-documenting and
// give a future branch a named seam instead of another ad-hoc field-clearing tweak. The taxonomy,
// derived from the actual call sites (flow.js, menus.js, dev.js) rather than assumed up front:
//   'hand-advance' â€” moving to the next of this slot's 3 hands within the SAME Round: the normal
//                    "Next Hand â†’" path (_nextHand, flow.js) and its all-in-or-skip sibling
//                    (_skipHand, flow.js). Counters/history (S.<g>Hand, S.<g>History) are NOT reset's
//                    job in this case â€” they're advanced by the hand's own resolve/skip path before
//                    reset runs, and reset only clears the per-hand scratch fields (cards, bet, phase,
//                    split state, animation cursors).
//   'borrow-prep'  â€” preparing the slot the player will return to if they accept the borrow loan,
//                    called from advanceTo() the moment a "Game Over" bust is detected at a result
//                    phase (before the borrow screen is even shown) so a later return lands on a clean
//                    bet phase. Same field-clearing as hand-advance; the counter/history are likewise
//                    untouched (a borrowed return continues the same Round, it doesn't restart it).
//   'dev-jump'     â€” dev-only direct entry into a fresh Ladder run, bypassing the normal Round flow
//                    (the dev Jump submenu's "â†’ The Ladder" and devLadder(), which also forces the
//                    ladder_day mod). Ladder has no handKey/historyKey (it's a single run, not a
//                    3-hand slot) so there's no counter to preserve; reset just re-arms S.ladPhase/
//                    ladBet/ladFree/ladIdx/ladRung/ladResult to their fresh-run values.
// A slot's FIRST entry each day (GAME1 at run start, GAME2 arriving via NEXT_SCREEN) never calls
// reset at all â€” S starts each day already clean, so there's nothing to clear. Roulette and the
// Ladder's real (non-dev) free-bonus entry are likewise reset-free for the same reason: both are
// played at most once per day, so the "borrow-prep"/"hand-advance" paths above never reach them with
// stale state to clear (GAMES.roulette.reset and GAMES.ladder.reset stay the core.js no-op default).


// â”€â”€ The Game behaviour-hook interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every game entry satisfies the SAME behaviour interface, declared (as no-ops) here in one place so
// the lifecycle can call any hook unconditionally. Each game's own file loads after core.js and
// OVERRIDES the hooks it implements; a game that doesn't need one keeps the no-op. This is what lets
// flow.js / game.js / ui.js drop the per-hook `?.` guard â€” a registry entry ALWAYS has these as
// functions, so the only thing a caller still guards is whether `S.screen` is a game at all (shell
// screens like intro/borrow/results aren't in GAMES). The hooks:
//   screen   â€” returns the screen's HTML (set by every game; not defaulted, so a missing one is a bug)
//   reset    â€” return the game to a fresh bet phase (card games; no-op for single-run games).
//              Called as reset(reason) â€” see the bet-phase contract below.
//   nextHand â€” advance to the next hand (card games; no-op for single-run games)
//   resume   â€” restore mid-animation state after a refresh (no-op where the screen restores instantly)
//   patchBet â€” surgically sync the game's own bet UI on a bet change (UTH + roulette; no-op otherwise)
// (replay is attached later by engine.js for all games; it is the replay-side hook, not a live one.)
// rulesFor â€” OPTIONAL, not defaulted (unlike the hooks above): a pure `(mod) => {â€¦scalars/flags}`
// builder for the day's per-game rule bundle, given a mod accessor (getMod live, _engMod in replay).
// Only bj and uth register one (bjRulesFor/uthRulesFor, in their own files) â€” the pattern that
// replaced the old "mirror the same ||default inline in the live game AND engine.js" duplication.
// Roulette's spinModsFor/evalBetModsFor are the same idea but a different shape (they also fold in
// non-modifier inputs like the locked bets / win multiplier / spin override), so they are NOT wired
// here â€” forcing them onto `.rulesFor` would buy uniformity, not clarity. Ladder has no builder at
// all: it reads getMod('ladder_free') straight (a `cross`-attributed key in MODIFIER_SCHEMA, not a
// ladder-owned one). Consistency with MODIFIER_SCHEMA's `game` attribution is asserted in
// tests/modifiers.test.js, not enforced at runtime (a schema key legitimately read outside its
// game's rulesFor â€” e.g. uth_river_monster/uth_time_travel, read straight off getMod in uth.js's
// display/redeal logic rather than through uthRulesFor â€” is fine; the test documents which keys
// those are so a real drift doesn't hide).
for (const _g of Object.values(GAMES)) {
  _g.reset    = _g.reset    || (() => {});
  _g.nextHand = _g.nextHand || (() => {});
  _g.resume   = _g.resume   || (() => {});
  _g.patchBet = _g.patchBet || (() => {});
}

// Display metadata for every slot game â€” the entries of GAMES that carry `meta`. Back-compat view
// consumed by the dev menu (GAME1_OPTIONS) and the share text (buildShareText).
const GAME_META = Object.fromEntries(Object.entries(GAMES).filter(([, g]) => g.meta).map(([k, g]) => [k, g.meta]));

// All games can occupy either slot; dev menu filters out the conflicting selection.
const GAME1_OPTIONS = Object.entries(GAME_META).map(([value, m]) => ({ value, label: m.short }));
const GAME2_OPTIONS = GAME1_OPTIONS;

// Navigation sequence: after each game advance to the next, roulette is always last.
const NEXT_SCREEN = { [GAME1]: GAME2, [GAME2]: 'roulette' };

// Pure Run-order resolver â€” the one place that answers "what screen comes next?". `cur` is the
// screen being left (a game slot, or a results-bound destination); `f` carries the run facts the
// choice needs, all passed in (no S/DOM read), so it's unit-testable without a DOM:
//   handsLeft  â€” the current game still has hands to play â†’ stay on this slot
//   ladderFree â€” active ladder_free bonus stake (truthy on a bonus day)
//   ladPlayed  â€” the free bonus round has already run
//   rResolved  â€” roulette has resolved
//   busted, borrowUsed â€” gate the detour; it fires only when the two agree
// Order: a game slot â†’ its NEXT_SCREEN successor (roulette is last); anything with no successor â†’
// results; and a results-bound finish on a bonus day detours once into the free Ladder round.
function next(cur, f = {}){
  if(f.handsLeft) return cur;
  let s = NEXT_SCREEN[cur] || 'results';
  if(s==='results' && f.ladderFree && !f.ladPlayed && f.rResolved && f.busted===f.borrowUsed) s='ladder';
  return s;
}

const STORAGE_KEY = 'gambdle_state_';
const ANIM_NONE = 99; // sentinel: suppress card animation on this hand

// â”€â”€â”€ SUPABASE CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPABASE_URL = 'https://kxbteesmfozqzoxzktzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YnRlZXNtZm96cXpveHprdHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDk3OTEsImV4cCI6MjA5Mzc4NTc5MX0.oiDpuibLU5zZWKjm5LEoXRJGyOLBWieSO5FhPl4I3UU';
// Standard headers for authenticated Supabase REST / RPC / Edge Function calls (the anon key is
// public by design; RLS enforces write rules). Spread in extra headers per call, e.g.
// { ...SUPABASE_HEADERS, 'Prefer': 'return=minimal' }.
const SUPABASE_HEADERS = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };

/** DEV_OVERRIDE enabled via ?dev=true in URL */
const urlParams = new URLSearchParams(window.location.search);
let DEV_OVERRIDE = urlParams.get('dev') === 'true' ? {} : null;
if(DEV_OVERRIDE) document.body.classList.add('dev-mode');

// â”€â”€â”€ MODIFIER RESOLUTION â€” one precedence chain, three consumers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The full chain is: forcedMod (dev-only) > DAILY_MODIFIERS/DAILY_SEED_OVERRIDES date override >
// CYCLE_ORDER cycle slot > Player's Choice indirection. It used to be re-derived separately by live
// play and by the server replay engine, which drifted once already (the 2026-06-16 config-horizon
// incident: a cycle-index mismatch made the server replay the wrong day's mod). Now it's split into
// two pure functions, `resolveDayMod` (everything through the cycle slot) and `applyPlayersChoice`
// (the last step), because the three real consumers need different intermediate points, not one
// bundled result:
//   - `pendingPlayersChoice` (below) needs the PRE-choice base preset, to read its `.choices` list
//     while the day is still uncommitted â€” it must NOT apply the indirection.
//   - `getMod` (below) needs the FINAL value: `resolveDayMod` then `applyPlayersChoice(mod, S.pcPick)`.
//   - `replayDayMods` (engine.js) needs the FINAL value too, but for an explicit past seed + the
//     recorded pick instead of live state: `resolveDayMod` then `applyPlayersChoice(mod, pcPick)`.
// All three call through these same two functions, so the chain and the cycle index can't drift
// between live and replay again â€” see also ARCHITECTURE.md "Modifiers" / "Scoring parity".

// A modifier reference is either a PRESET_MODIFIERS key (string) or an inline preset object. This
// turns either into the preset object (or null). One place, so live play and the server replay
// normalize a day's modifier ref identically.
function normalizeModRef(ref) {
  if (!ref) return null;
  return typeof ref === 'string' ? PRESET_MODIFIERS[ref] : ref;
}

// Step 2 of the chain (see banner above): the Player's Choice indirection, shared by live play
// (getMod) and the server replay (replayDayMods). Once a pick is committed on a choices-day, the
// chosen preset IS the active modifier; any other day (or no pick yet) the preset is unchanged.
function applyPlayersChoice(mod, pick) {
  return (mod && mod.choices && pick) ? (PRESET_MODIFIERS[pick] || mod) : mod;
}

// Step 1 of the chain (see banner above): forced > date override > cycle slot, composed from
// explicit inputs so live (`_activeMod` â†’ `getMod`) and the server replay (`replayDayMods`,
// engine.js) can't compute the cycle index differently. Deliberately stops BEFORE the Player's
// Choice indirection (that's `applyPlayersChoice`'s job, called separately by each consumer) so
// `pendingPlayersChoice` can still read the unresolved `.choices` list off the same call. Returns
// the preset object or null.
//   seed      â€” calendar seed (YYYYMMDD) selecting a DAILY_MODIFIERS override
//   dayNum    â€” run day number, indexing the CYCLE_ORDER rotation (modulo kept safe for any integer)
//   forcedMod â€” dev-only forced ref (live only; never set server-side)
function resolveDayMod(seed, dayNum, forcedMod) {
  const len = CYCLE_ORDER.length;
  const cycled = CYCLE_ORDER[((dayNum - 1) % len + len) % len];
  return normalizeModRef(forcedMod || DAILY_MODIFIERS[seed] || cycled);
}

// Resolves today's active modifier preset object (forced > date override > cycle), pre-choice â€”
// see `resolveDayMod` above for why this stops short of the Player's Choice indirection.
function _activeMod() {
  return resolveDayMod(getActiveSeed(), getActiveDayNum(), S.forcedMod);
}

function getMod(key) {
  // Player's Choice: once the player commits a pick, the active modifier IS their chosen preset, so
  // every getMod() call (game rules, banner title/desc, results recalc) reads through it.
  const mod = applyPlayersChoice(_activeMod(), S.pcPick);
  return (mod && mod[key] !== undefined) ? mod[key] : null;
}

// Returns the three offered choice presets ({key, ...preset}) when today is a Player's Choice day
// and the player hasn't committed yet â€” otherwise null. Drives the picker screen and start routing.
function pendingPlayersChoice() {
  const mod = _activeMod();
  if (mod && mod.choices && !S.pcPick) {
    return mod.choices.map(k => ({ key: k, ...PRESET_MODIFIERS[k] }));
  }
  return null;
}

// â”€â”€â”€ CARD UTILITIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUITS=['â™ ','â™¥','â™¦','â™£'], RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RED_S=new Set(['â™¥','â™¦']);
const buildDeck=()=>SUITS.flatMap(s=>RANKS.map(r=>({s,r})));
// Fisher-Yates shuffle â€” returns a new shuffled array, leaves the original unchanged.
function shuffle(d,rng){const a=[...d];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Suited Up (uth_suited_conn): build a fresh per-hand deck and force the player's hole cards to a
// suited connector with the lower card 7+ â€” the seven pairs 7-8, 8-9, 9-10, 10-J, J-Q, Q-K, K-A (Ace
// high). Returns {hole, dealer, comm}; dealer + community come from the shuffled remainder. Pure in
// `hr`, so the live deal (uthDeal) and the server replay (_replayUTHHand) build identical hands.
const UTH_CONN_LOWS=['7','8','9','10','J','Q','K'], UTH_CONN_NEXT={'7':'8','8':'9','9':'10','10':'J','J':'Q','Q':'K','K':'A'};
function suitedConnectorDeal(hr){
  const d=shuffle(buildDeck(),hr);
  const lo=UTH_CONN_LOWS[Math.floor(hr()*UTH_CONN_LOWS.length)], hi=UTH_CONN_NEXT[lo];
  const suit=SUITS[Math.floor(hr()*SUITS.length)];
  const rest=d.filter(c=>!(c.s===suit&&(c.r===lo||c.r===hi)));
  return {hole:[{s:suit,r:lo},{s:suit,r:hi}], dealer:[rest[0],rest[1]], comm:rest.slice(2,7)};
}
function cVal(r){return 'JQK'.includes(r)?10:r==='A'?11:+r;}
// Totals a hand; aces start as 11 and are downgraded to 1 one-at-a-time to avoid bust.
function hVal(cs){let v=0,a=0;for(const c of cs){v+=cVal(c.r);if(c.r==='A')a++;}while(v>21&&a-- >0)v-=10;return v;}
// hVal + softness (true â‡” at least one ace still counts as 11) in one pass â€” the pair a basic-strategy
// table keys off. Shared so seedcheck.js's strategy layer reads the same total math hVal embodies
// instead of re-deriving it (they used to be two independent hand-total implementations).
function hValSoft(cs){let v=0,a=0;for(const c of cs){v+=cVal(c.r);if(c.r==='A')a++;}while(v>21&&a>0){v-=10;a--;}return{total:v,soft:a>0};}
// Returns "8 / 18" for soft hands (ace still counted as 11), or a plain number string.
function hValDisplay(cs){
  let v=0,aces=0;
  for(const c of cs){v+=cVal(c.r);if(c.r==='A')aces++;}
  let red=0;while(v>21&&red<aces){v-=10;red++;}
  if(aces-red>0&&v<=21){const hard=v-10*(aces-red);return`${hard} / ${v}`;}
  return String(v);
}
// True only for a two-card 21 (the deal); hitting to 21 does not count as blackjack.
const isBJ=cs=>cs.length===2&&hVal(cs)===21;


// â”€â”€â”€ GLOBAL STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const START_CHIPS=1000;
const BORROW_AMOUNT=50; // chips loaned to a busted player; deducted from next day's starting stack
const CHIP_TIERS=[
  {min:2500,emoji:'ðŸ‹',label:'Whale'},
  {min:1500,emoji:'ðŸ’Ž',label:'High Roller'},
  {min:1000,emoji:'ðŸŽ“',label:'Apprentice'},
  {min:1,   emoji:'ðŸ˜¢',label:'Survivor'},
  {min:0,   emoji:'ðŸ¤¡',label:'Bozo'},
];
// Always returns a tier â€” fallback to the last entry so NaN/negative chips never return undefined.
function getTier(chips){return CHIP_TIERS.find(t=>chips>=t.min)||CHIP_TIERS[CHIP_TIERS.length-1];}

// Lifetime-net tier ladder for the Player Profile title. Deliberately separate from
// the daily CHIP_TIERS: lifetime net compounds across days (and can go negative), so
// the breakpoints are an order of magnitude larger and no title is shared.
const NET_TIERS=[
  {min:250000,   emoji:'ðŸ‘‘', label:'House Legend'},
  {min:100000,   emoji:'ðŸ’°', label:'Mogul'},
  {min:50000,    emoji:'ðŸ¦', label:'The House'},
  {min:25000,    emoji:'ðŸŽ©', label:'Pit Boss'},
  {min:10000,    emoji:'ðŸ¦ˆ', label:'Card Shark'},
  {min:2500,     emoji:'ðŸ’µ', label:'Grinder'},
  {min:0,        emoji:'ðŸ‘¶', label:'Novice'},
  {min:-4999,    emoji:'ðŸ“‰', label:'In the Red'},
  {min:-Infinity,emoji:'ðŸ•³ï¸', label:'Down the Hole'},
];
// Always returns a tier â€” the -Infinity floor catches any loss, and NaN falls back to the last entry.
function getNetTier(net){return NET_TIERS.find(t=>net>=t.min)||NET_TIERS[NET_TIERS.length-1];}
let S={
  screen:'intro', chips:START_CHIPS, day:getActiveDayNum(),
  bjHand:0, bjPhase:'bet', bjBet:0,
  bjPlayer:[], bjDealer:[], bjResult:null,
  bjHistory:[], bjIdx:0,
  bjDeck2:null, bjDeck2Idx:0, bjCandidates:null,  // Double Vision (bj_two_hands): a fresh per-hand deck + its cursor, and the two candidate hands during the 'pick' phase
  bjSplit:false, bjSplitHands:[], bjSplitActive:0, bjSplitBets:[], bjSplitResults:[], bjSplitDone:[], bjDoubled:false, bjSplitDoubled:[],
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjDealerReveal:false, bjCelebrating:false,
  bjActed:false,    // player finished acting on the current (sub-)hand (stood/doubled) â€” lets a refresh resume the dealer's turn

  pkHand:0, pkPhase:'bet', pkBet:0,
  pkCards:[], pkHeld:new Set(), pkFinal:[], pkHistory:[], pkRevealStep:0,
  uthHand:0, uthPhase:'bet', uthAnte:0, uthRaise:0, uthRaiseMult:0,
  uthRaised:false, uthFolded:false,
  uthHole:[], uthDealer:[], uthComm:[],
  uthPrivate:null,  // Sixth Sense (uth_sixth_card): the player-only 6th community card; dealt at deal, shown from the turn
  uthRevealComm:0, uthPrevRevealComm:0, uthHistory:[],
  ladPhase:'bet',   // The Ladder: 'bet' | 'climb' | 'done'
  ladBet:0, ladFree:false,
  ladIdx:0,         // index of the current (face-up) card in DEAL.ladderCards
  ladRung:0,        // rungs climbed (0..7)
  ladResult:null,   // {delta, rung, outcome:'cash'|'crash'|'top', free} once the run ends
  rPhase:'bet', rBets:[], rBet:0, rPick:null, rResult:null,
  rSpin:null,       // the winning number (set at spin time, null until first spin)
  rSpin2:null,      // second winning number for the Double Ball modifier (r_double_ball)
  rReSpun:false,    // true once the player uses their free re-spin (r_respin modifier)
  rSpinAcq:null,    // {words, fromServer, verified} tag for the current round's acquired randomness (roulette.js _acquireSpin) â€” null until fetched, cleared each new spin so a re-spin re-acquires
  rUnverified:false,// spin fell back to a local draw (server unreachable) â€” derived from rSpinAcq.verified; submission carries the flag
  tx:[],            // append-only transcript of replay-relevant decisions (see txLog)
  timeTravelUsed:false, // whether the one-time daily UTH re-deal (uth_time_travel) has been used
  uthRedealPtr:27,  // next index into DEAL.uthDeck's unused tail (cards 27+) for Time Travel re-deals
  forcedMod: null,  // dev override â€” set by devApplyMod(), cleared on next loadState()
  peeksUsed: 0,     // count of daily dealer peeks consumed (limit = the peek modifier's value)
  peekAt: null,     // {game, hand} the most recent peek was used on â€” reveal only shows there, not on later hands/games
  borrowUsed: false,        // true once the daily borrow option has been taken or declined
  borrowAmount: 0,          // actual chips borrowed (may exceed BORROW_AMOUNT under min_chips modifier)
  borrowReturnScreen: null, // screen to navigate to after borrowing chips
  pcPick: null,             // Player's Choice: the chosen modifier key once committed (null until picked)
};

/** True when the daily borrow option can still be shown: not yet used, and roulette not yet spun. */
function _canShowBorrow() {
  return !S.borrowUsed && S.rResult === null;
}

/** Chips to loan: always at least BORROW_AMOUNT, bumped up to meet min_chips modifier floor. */
function _effectiveBorrowAmount() {
  return Math.max(BORROW_AMOUNT, getMod('min_chips') || 0);
}

/** True when the player can no longer place a valid bet (< 10 chips, or below the min_chips modifier floor). */
function isChipBusted() {
  if (S.chips < 10) return true;
  const minC = getMod('min_chips') || 0;
  return minC > 0 && S.chips < minC;
}

// Pure win multiplier â€” the ONE place the doubling rule lives, shared by the live games (via
// winMult, below) and the replay Engine. `mod` is a keyâ†’value accessor (getMod live, _engMod in
// replay); `chips` is the live balance at the moment of resolution. Returns 2 when all_in_or_skip
// is active, or while comeback is active and the stack is under 1000, else 1.
function winMultFor(mod, chips){
  if(mod('all_in_or_skip'))return 2;
  if(mod('comeback')&&chips<1000)return 2;
  return 1;
}
/** Live win multiplier: winMultFor read through getMod against the live S.chips. */
function winMult(){ return winMultFor(getMod, S.chips); }

// â”€â”€â”€ CHIP ACCOUNTING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single chokepoint for every chip-balance change. Every game routes winnings,
// refunds and stakes through these instead of touching S.chips directly, so the
// running total can't drift, go negative, or pick up fractional chips (odd-bet
// payouts are rounded here rather than ad hoc at each call site). In dev mode each
// delta is logged with a reason, making chip-accounting bugs easy to trace.
// `reason` is a short tag (e.g. 'bj-win', 'roulette-bet') for that dev log only.
function credit(n, reason){
  S.chips += Math.round(n);
  if(DEV_OVERRIDE) console.log(`[chips] +${Math.round(n)} (${reason||'?'}) â†’ ${S.chips}`);
}
function debit(n, reason){
  S.chips = Math.max(0, S.chips - Math.round(n));
  if(DEV_OVERRIDE) console.log(`[chips] -${Math.round(n)} (${reason||'?'}) â†’ ${S.chips}`);
}

/**
 * @typedef {Object} Accountant
 * The chip-accounting seam the per-game award helpers settle through, so the SAME credit-from-result
 * mapping runs live and in the replay Engine. Two adapters satisfy it: liveAcct (below) writes S.chips
 * through the credit/debit chokepoint; the Engine's _engAcct (engine.js) is a headless in-memory tally.
 * Both round every delta (Math.round) and floor a debit at 0 â€” a third adapter MUST keep that rule or
 * liveâ†”replay parity breaks.
 * @property {number} chips - current balance.
 * @property {(n:number, reason?:string) => void} credit - add n chips, rounded.
 * @property {(n:number, reason?:string) => void} debit - subtract n chips, rounded, floored at 0.
 */

// Live accountant adapter â€” an Accountant backed by S.chips through the credit/debit chokepoint. The
// per-game settlement is expressed as a pure LEDGER (built by the *Award helpers) and applied through
// this adapter by applyLedger â€” so the SAME credit sequence runs live here and headless in the replay
// Engine (which passes its own in-memory adapter). Two adapters, one shared mapping; the mapping is now
// inspectable data rather than a sequence of imperative acct calls.
/** @returns {Accountant} */
function liveAcct(){
  return {
    get chips(){ return S.chips; },
    credit(n, reason){ credit(n, reason); },
    debit(n, reason){ debit(n, reason); },
  };
}

// Apply a settlement Ledger through an Accountant â€” the ONE place a settled play-unit's payout touches
// chips. A Ledger is the pure data form of "what to credit/debit": an ordered list of {op, n, reason}
// (op 'credit'|'debit'). Each *Award helper RETURNS one instead of calling the accountant itself, so
// the credit sequence becomes inspectable, unit-testable data. Order and grouping are load-bearing â€”
// credit()/debit() round every call independently, so summing or reordering entries would change the
// result â€” applyLedger therefore replays them verbatim, in order. Live and replay build the identical
// Ledger and apply it here, which makes drift between the two paths impossible by construction.
function applyLedger(acct, ledger){
  for(const e of ledger){
    if(e.op==='debit') acct.debit(e.n, e.reason);
    else acct.credit(e.n, e.reason);
  }
}

// â”€â”€â”€ LEDGER ENTRY GRAMMAR (typo guard for the *Award builders) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Same strict-mode shape as record.js's TX_SHAPE/ROUND_DETAIL_KEYS guards, but reimplemented here (not
// imported) because record.js is DOM-facing and excluded from the replay engine bundle
// (tests/build-engine-bundle.js EXCLUDE), while core.js â€” and therefore this file â€” IS bundled. The
// detector below deliberately mirrors record.js's `_strictRounds` rather than sharing it.
// Bundle-safe: the engine bundle's STUB preamble defines a plain `window = { location: {search:''} }`,
// so `window.__GAMBDLE_TEST__` reads as undefined (never throws) and DEV_OVERRIDE resolves to its
// normal `null` production default under `new Function` â€” no ReferenceError in Deno, no behavior
// change live.
const _ledgerStrict = () => !!DEV_OVERRIDE || !!(typeof window !== 'undefined' && window.__GAMBDLE_TEST__);
// The full reason vocabulary every *Award builder is allowed to emit (grepped from bjAward/
// bjAwardSplit in bj.js, uthAward in uth.js, rouletteAward in roulette.js, ladderAward in ladder.js â€”
// the only applyLedger feeders). Adding a new award reason means adding it here first, or ledgerEntry
// throws in strict mode the moment the typo'd/new string is built.
const LEDGER_REASONS = new Set([
  'bj-blackjack', 'bj-win', 'bj-push', 'bj-split-win', 'bj-split-push',
  'uth-play', 'uth-ante', 'uth-ante-push', 'uth-blind', 'uth-push',
  'roulette', 'ladder',
]);
// Validating factory for one Ledger entry â€” the *Award builders call this instead of hand-writing
// {op,n,reason} literals, so a typo'd op, a non-finite/negative n, or an undeclared reason blows up
// loudly at build time (strict mode only: dev/test â€” see _ledgerStrict). Prod builds skip the checks
// entirely (perf + no throw risk for players); the RETURNED shape is byte-identical either way, so
// live/replay parity (ledger outputs feed straight into applyLedger) is untouched.
function ledgerEntry(op, n, reason){
  if(_ledgerStrict()){
    if(op!=='credit' && op!=='debit') throw new Error(`ledgerEntry: op must be 'credit'|'debit', got '${op}'`);
    if(!Number.isFinite(n) || n<0) throw new Error(`ledgerEntry: n must be a finite number >= 0, got ${n}`);
    if(!LEDGER_REASONS.has(reason)) throw new Error(`ledgerEntry: unknown reason '${reason}'. Add it to LEDGER_REASONS (core.js) if new.`);
  }
  return {op, n, reason};
}
// Thin credit/debit wrappers over ledgerEntry â€” read at each *Award call site as "credit this much,
// for this reason" rather than a bare op string. Named `mkCredit`/`mkDebit` (not `credit`/`debit`) to
// stay distinct from the chip-accounting chokepoint above, which these do NOT call â€” they only build
// the data an Accountant later applies via applyLedger.
const mkCredit = (n, reason) => ledgerEntry('credit', n, reason);
const mkDebit  = (n, reason) => ledgerEntry('debit', n, reason);

// Mutate-then-persist seam (Candidate 6). Apply `fn` to S, then saveState() EXACTLY once on exit â€” even
// if `fn` returns early or throws (the save still fires, matching today's "save what we have"). Returns
// `fn`'s value so callers can `return mutate(...)`. Reads stay direct (S.x); only WRITES route here so
// the save can't be forgotten â€” the #1 hard rule ("saveState() after any mutation to S") exists because
// the bare seam leaks. Single-purpose: it does NOT render() (a flow concern, forbidden mid-hand). `s` IS
// the live S (same object), so there's no copy/proxy and zero overhead.
//   mutate(s => { s.bjPhase = 'play'; });
//   const pot = mutate(s => { s.ladRung++; return ladPotAt(s.ladBet, s.ladRung); });
// Async: await OUTSIDE, then mutate() the settled values so the save fires after the state is final.
function mutate(fn){
  try { return fn(S); }
  finally { saveState(); }
}


/** Writes the current run state to _ls for persistence. */
function saveState() {
  const toSave = { ...S, pkHeld: [...S.pkHeld] };
  _ls.setItem(getStateKey(), JSON.stringify(toSave));
  if (S.screen === 'results' && !_testActive() && !_backlogSeed) {
    const high = parseInt(_ls.getItem('gambdle_highscore') || '0');
    if (S.chips > high) {
      _ls.setItem('gambdle_highscore', S.chips.toString());
      let unlockMsg = null;
      for (const [min, key, txt] of [
        [1500,  'orange_back_unlocked',  'ðŸŸ  Orange Card Back unlocked! Check Preferences.'],
        [2000,  'green_theme_unlocked',  'ðŸŒ¿ Luna Green theme unlocked! Check Preferences â†’ Theme.'],
        [2500,  'maroon_felt_unlocked',  'ðŸŽ± Maroon Felt unlocked! Check Preferences.'],
        [3500,  'deck_emoji_unlocked',   'ðŸŒ± Emoji Deck unlocked! Check Preferences.'],
        [5000,  'whale_back_unlocked',   'ðŸ‹ Whale Card Back unlocked! Check Preferences.'],
        [10000, 'golden_back_unlocked',  'ðŸ† Golden Card Back unlocked! Check Preferences.'],
      ]) if (S.chips >= min && !getPref(key)) { setPref(key, true); unlockMsg = txt; }
      if (unlockMsg) setTimeout(()=>toast(unlockMsg), 1200);
    }
    // Wrap in try/catch â€” a long-running player's gambdle_history can become corrupted JSON;
    // if so, reset it to just today's entry rather than throwing and killing render().
    try {
      const history = JSON.parse(_ls.getItem('gambdle_history') || '{}');
      history[getDailySeed()] = S.chips;
      _ls.setItem('gambdle_history', JSON.stringify(history));
    } catch (_e) {
      const fresh = {}; fresh[getDailySeed()] = S.chips;
      _ls.setItem('gambdle_history', JSON.stringify(fresh));
    }
  }
}

/** Loads any existing saved progress for the current day. */
function loadState() {
  const saved = _ls.getItem(getStateKey());
  let parsed = null;
  if (saved) {
    // A corrupt value (truncated by storage-quota pressure, an interrupted write) must not crash
    // the boot path â€” JSON.parse would throw an uncaught SyntaxError and leave a blank screen with
    // no way to recover. Treat unparseable saves as "no save": start the day fresh.
    try { parsed = JSON.parse(saved); } catch (e) { parsed = null; }
  }
  if (parsed) {
    if (Array.isArray(parsed.pkHeld)) parsed.pkHeld = new Set(parsed.pkHeld);
    S = { ...S, ...parsed, day: getActiveDayNum() };
    _normalizeRounds(); // upgrade any pre-v1.42 settled records to the canonical shape before anything reads them

    // Migrate: old saves used 'poker' as a generic game-2 screen key; now it means 5-card poker specifically.
    if (S.screen === 'poker' && GAME2 !== 'poker') S.screen = GAME2;
    // Guard: if no game has been started at all, chips must equal START_CHIPS regardless of saved value.
    const _noProg = !S.bjHistory.length && !S.uthHistory.length && !S.pkHistory.length
                 && S.rResult === null && S.bjBet === 0 && S.uthAnte === 0 && S.pkBet === 0 && !S.rBets.length;
    if (_noProg) S.chips = START_CHIPS;
    // Guard: for completed runs, recompute chips from recorded history so stale saves can't inflate scores.
    // Fall back to the saved value if the calculation is non-finite (corrupted history entries).
    // Borrowed chips count as part of the effective starting stack for this calculation.
    // Skipped in dev mode so chips added via the dev menu aren't recomputed away.
    if (S.screen === 'results' && !DEV_OVERRIDE) {
      const _calc = recalcChips();
      // Clamp at 0: a chip balance can never be negative (debit() floors at 0), so a sub-zero recalc
      // means a corrupted/edited save â€” never let it be displayed, shared, or submitted to the board.
      S.chips = Number.isFinite(_calc) ? Math.max(0, _calc) : S.chips;
    }
  } else {
    // No saved state for today â€” apply borrow debt only if it targets today's exact seed.
    // If the player skipped the target day, the debt expires without applying.
    // Skip in test/backlog modes so practice runs don't consume or create debt.
    if (!_testActive() && !_backlogSeed) {
      try {
        const raw = _ls.getItem('gambdle_borrow_debt');
        if (raw) {
          const debt = JSON.parse(raw);
          if (typeof debt.targetSeed !== 'number' || typeof debt.amount !== 'number') {
            // Malformed entry â€” clear immediately rather than leaving it stuck forever.
            _ls.removeItem('gambdle_borrow_debt');
          } else {
            if (debt.targetSeed === getDailySeed()) {
              // Clamp at 0 so a corrupted/oversized debt can't seed the day with a negative balance.
              S.chips = Math.max(0, START_CHIPS - debt.amount);
            }
            // Clear once the target day has arrived or passed (expired or consumed).
            if (getDailySeed() >= debt.targetSeed) {
              _ls.removeItem('gambdle_borrow_debt');
            }
          }
        }
      } catch {
        _ls.removeItem('gambdle_borrow_debt');
      }
    }
  }
  const forced = _ls.getItem('gambdle_forced_mod');
  if (forced) {
    S.forcedMod = forced;
    _ls.removeItem('gambdle_forced_mod');
    saveState();
  }
}
