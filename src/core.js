// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   GAME_VERSION · _ls storage wrapper · getDeviceId
//   mkRng (SplitMix32) · daily/backlog/test seeds · Phoenix day math
//     (getDailySeed, getActiveSeed, getRngSeed, getStateKey, getDayNum)
//   computeStreak · UNLOCKS · profileStats
//   game slots (GAME1/GAME2) · GAMES registry (GAME_META, NEXT_SCREEN) · next() run-order resolver
//   SUPABASE CONFIG (URL, anon key, SUPABASE_HEADERS) · DEV_OVERRIDE
//   modifier access: _activeMod, getMod, pendingPlayersChoice
//   CARD UTILITIES (buildDeck, shuffle, hVal, isBJ)
//   → THE DEAL lifted to deal.js (genDeal → DEAL, card/seed overrides)
//   chips: START_CHIPS, BORROW_AMOUNT, CHIP_TIERS/getTier, NET_TIERS/getNetTier
//   GLOBAL STATE (the S object) · borrow/bust helpers · winMult
//   CHIP ACCOUNTING (credit, debit) · Accountant/liveAcct · applyLedger
//   LEDGER ENTRY GRAMMAR (ledgerEntry, mkCredit/mkDebit, LEDGER_REASONS): validated Ledger entry factory
//   saveState / loadState   ·   → THE RECORD lifted to record.js (mkOutcome, recalcChips, gameNet/gameHistory, txLog + shape guards)
// ───────────────────────────────────────────────────────────────────────────

// Set browser tab title
document.title = "♠️ Gambdle";

const GAME_VERSION = 'v1.88';

// Storage wrapper: tries localStorage, falls back to sessionStorage (private browsing).
// State survives tab refreshes in either case; sessionStorage clears when the tab closes.
const _ls = (() => {
  try { localStorage.setItem('_g','1'); localStorage.removeItem('_g'); return localStorage; }
  catch { return sessionStorage; }
})();

// Persistent anonymous device ID stored in localStorage, used to fingerprint submissions.
// Generates a UUID once on first visit; the same device keeps the same ID across days.
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

// SplitMix32-style seeded PRNG: returns a function that yields floats in [0, 1).
// The magic constant (0x6d2b79f5), Math.imul (32-bit integer multiply), and >>>0
// (coerce to unsigned 32-bit) are all required to mix the bits well.
function mkRng(seed) {
  let s = (seed ^ 0x6d2b79f5) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000; // 0x100000000 = 2^32, normalizes to [0,1)
  };
}
// Returns today as a YYYYMMDD integer in Phoenix time (MST, UTC-7, no DST).
// Used as both the RNG seed and the storage key, so everyone resets at midnight Arizona.
const _PHOENIX_OFFSET_MS = 7 * 60 * 60 * 1000;
const getDailySeed = () => { const d=new Date(Date.now()-_PHOENIX_OFFSET_MS); return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(); };
// Returns the seed (YYYYMMDD) for the next Phoenix-time calendar day.
const _nextDailySeed = () => { const d=new Date(Date.now()-_PHOENIX_OFFSET_MS); d.setUTCDate(d.getUTCDate()+1); return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(); };
let _backlogSeed = (() => { const v=parseInt(_ls.getItem('gambdle_backlog_seed')||'0'); return v||null; })();
// Top-percentile (e.g. 12 = top 12%) for the current results run, filled in later by the
// leaderboard fetch. null until known, or when there aren't enough players for it to mean anything.
// buildShareText() reads it to add a "Finished Top X%" line once the rank comes back.
let _lbTopPct = null;
const getActiveSeed = () => _backlogSeed || getDailySeed();
// Test-only setter: lets dev-advanced.test.js override _backlogSeed without a page reload.
function _setBacklogSeedForTest(v) { _backlogSeed = v; }
// The test seed only takes effect in dev mode (?dev=true) or under the unit-test harness
// (which sets window.__GAMBDLE_TEST__), never in normal play, even if the flag lingers in
// localStorage from a past dev session. DEV_OVERRIDE is read lazily (defined later in this file).
const _testActive = () => (!!DEV_OVERRIDE || !!(typeof window!=='undefined'&&window.__GAMBDLE_TEST__)) && !!_ls.getItem('gambdle_use_test_seed');
function getRngSeed() { return _testActive()?1:(DAILY_SEED_OVERRIDES[getActiveSeed()]||getActiveSeed()); }
function getStateKey() { return _testActive()?'gambdle_test_state':STORAGE_KEY+getActiveSeed(); }

// Start of the daily Gambdle run (May 5th, 2026), used as the baseline for day numbering.
const START_DATE_UTC = Date.UTC(2026, 4, 5);

// Derives the day number from getDailySeed so both are always in sync.
const getDayNum = () => { const s=getDailySeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };
const getActiveDayNum = () => { const s=getActiveSeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };

// Absolute day index (days since START_DATE) for a YYYYMMDD seed. Lets us tell whether
// two played days are calendar-adjacent regardless of month boundaries.
const _seedDayIndex = s => { const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000); };

// Daily streak from the player's completed-day history (gambdle_history, keyed by seed).
// Returns { current, best }:
//   current: consecutive days played ending at endSeed (today by default). Pass
//     includeEnd=true to count endSeed itself even if it isn't saved yet: the results
//     screen renders before saveState() writes today's entry.
//   best: longest consecutive run anywhere in history.
// A missed day breaks the run. Reads localStorage defensively: corrupt JSON means no streak.
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

// Cosmetic unlock catalog, the single source for the profile window's badge grid.
// prefKey is the *_unlocked preference flag set when the player first hits the threshold;
// thresholds also appear as hint strings in the Preferences pickers (menus.js PICKER_ITEMS).
const UNLOCKS = [
  { prefKey: 'orange_back_unlocked', icon: '🟠', label: 'Orange Back', threshold: 1500 },
  { prefKey: 'green_theme_unlocked', icon: '🌿', label: 'Green Theme', threshold: 2000 },
  { prefKey: 'maroon_felt_unlocked', icon: '🟥', label: 'Maroon Felt', threshold: 2500 },
  { prefKey: 'deck_emoji_unlocked',  icon: '😀', label: 'Emoji Deck',  threshold: 3500 },
  { prefKey: 'whale_back_unlocked',  icon: '🐋', label: 'Whale Back',  threshold: 5000 },
  { prefKey: 'golden_back_unlocked', icon: '✨', label: 'Golden Back', threshold: 10000 },
];

// Lifetime stats for the Player Profile window, derived from gambdle_history and
// gambdle_highscore. Returns all zeros (and a 28-cell all-'miss' calendar) for a new
// player or a corrupt history; never throws.
//   streak   current daily streak. Counts back from today; if today isn't finished
//            yet it counts back from yesterday instead, since an unfinished today
//            doesn't break the run, only an actually missed day does.
//   longest  longest consecutive run anywhere in history (computeStreak's best).
//   calendar last 28 Phoenix days, oldest first (index 27 = today):
//            'profit' (>= START_CHIPS, breaking even counts), 'loss' (1..999),
//            'bust' (0), 'miss' (no entry).
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
// order: oldest first, index 27 = today. todaySeed is a YYYYMMDD integer; walks back one
// calendar day per cell, so Date arithmetic handles every month/year boundary.
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

// Creates a card object. s accepts shorthand ('s','h','d','c') or a direct suit symbol.
function card(r,s){return{r,s:{s:'♠',h:'♥',d:'♦',c:'♣'}[s]||s};}

// Dev overrides (set by devSetGame); fall back to configured defaults.
const GAME1 = _ls.getItem('gambdle_dev_game1') || 'bj';
const GAME2 = _ls.getItem('gambdle_dev_game2') || 'uth';

// The game registry, one table keyed by screen name. The lifecycle code reads this instead of
// switching on S.screen everywhere. Add a new game here.
//   meta     display payload for slot games only; the derived GAME_META below feeds the dev menu
//            and share text. Roulette is a playable screen but never a slot, so it has no meta.
//   phaseKey the S field holding this screen's phase ('bet' during the initial bet phase)
//   betKey   the S field holding the current bet amount
//   handKey  the S field counting hands played (the 3-hand card games only; single-run games omit it)
//   reset    the hand-reset function, attached by each game's own file (which loads after core.js)
//            and used by the borrow flow to return the player to a fresh bet phase
//   nextHand advances to the next hand (the result panel's advance button), attached by each card
//            game as () => _nextHand(<its reset>) and called by advanceHand() (flow.js)
//   resume   restores mid-animation state after a refresh, attached by each game's own file and
//            called by _resumeAfterRefresh (game.js) keyed on S.screen. Each guards its own phase.
//            Blackjack is the exception: its resume (_bjResumeAfterRefresh) stays a separate boot
//            call because of its dealer-draw choreography.
//   patchBet game-specific bet-UI patch (the roulette selection box, the UTH stake summary and pay
//            table), called by patchBetUI(bet) so the shared chip-UI code stays free of per-game
//            knowledge. Only roulette and UTH register one; others have no bet-UI extras.
// meta.short: label used in dev menu buttons and share text. meta.icon: on-screen SVG/glyph (rendered
// as HTML). meta.shareIcon: plain emoji/glyph for the copyable share text, must stay text, never <svg>.
const GAMES = {
  bj:      { meta: { icon: icon('cards'),  shareIcon: '🃏', name: 'Blackjack',             short: 'Blackjack',    desc: '3 hands · Hit, Stand, Double, Split' }, phaseKey: 'bjPhase',  betKey: 'bjBet',   handKey: 'bjHand', historyKey: 'bjHistory', txKey: 'bj' },
  uth:     { meta: { icon: '♠',            shareIcon: '♠',  name: "Ultimate Texas Hold'em", short: "Hold'em",      desc: '3 hands · Ante, Blind & Play' },        phaseKey: 'uthPhase', betKey: 'uthAnte', handKey: 'uthHand', historyKey: 'uthHistory', txKey: 'uth' },
  poker:   { meta: { icon: '♠',            shareIcon: '♠',  name: '5 Card Poker',           short: '5 Card Poker', desc: '3 hands · Jacks or Better' },           phaseKey: 'pkPhase',  betKey: 'pkBet',   handKey: 'pkHand', historyKey: 'pkHistory', txKey: 'pk' },
  ladder:  { meta: { icon: icon('ladder'), shareIcon: '🪜', name: 'The Ladder',             short: 'The Ladder',   desc: '1 run · Higher or lower, ties lose' },  phaseKey: 'ladPhase', betKey: 'ladBet', txKey: 'lad' },
  roulette:{ phaseKey: 'rPhase', betKey: 'rBet', txKey: 'r' },
};
// txKey: the short tag a game writes into the transcript (txLog {g}) and the net bucket the replay
// engine accumulates into. It's the one link between a game's registry entry and its replay handler.

// ── reset(reason) ─────────────────────────────────────────────────────────
// Every call to a game's reset, whether through the registry (GAMES[g].reset()) or directly
// (resetBJHand/resetUTHHand/resetLadderRun/the poker inline), passes a `reason` string naming why
// the caller wants a fresh bet phase. Every reason produces identical behavior today (the reset
// functions accept it and ignore it); it just makes each call site say why it's resetting. The
// reasons in use (from flow.js, menus.js, dev.js):
//   'hand-advance' moving to the next of this slot's 3 hands within the same round: the normal
//                  "Next Hand ->" path (_nextHand, flow.js) and its all-in-or-skip sibling
//                  (_skipHand, flow.js). Counters/history (S.<g>Hand, S.<g>History) are not touched
//                  here: they're advanced by the hand's own resolve/skip path before reset runs.
//                  Reset only clears the per-hand scratch fields (cards, bet, phase, split state,
//                  animation cursors).
//   'borrow-prep'  preparing the slot the player will return to if they accept the borrow loan,
//                  called from advanceTo() the moment a "Game Over" bust is detected at a result
//                  phase (before the borrow screen is even shown) so a later return lands on a clean
//                  bet phase. Same field-clearing as hand-advance; counters/history are likewise
//                  untouched, since a borrowed return continues the same round rather than restarting it.
//   'dev-jump'     dev-only direct entry into a fresh Ladder run, bypassing the normal round flow
//                  (the dev Jump submenu's "-> The Ladder" and devLadder(), which also forces the
//                  ladder_day mod). Ladder has no handKey/historyKey (it's a single run, not a
//                  3-hand slot) so there's no counter to preserve; reset just re-arms S.ladPhase/
//                  ladBet/ladFree/ladIdx/ladRung/ladResult to their fresh-run values.
// A slot's first entry each day (GAME1 at run start, GAME2 arriving via NEXT_SCREEN) never calls
// reset at all, since S starts each day already clean. Roulette and the Ladder's real (non-dev)
// free-bonus entry are likewise reset-free for the same reason: both are played at most once per
// day, so 'borrow-prep'/'hand-advance' never reach them with stale state to clear (GAMES.roulette.reset
// and GAMES.ladder.reset stay the core.js no-op default).


// ── Per-game behavior hooks ──────────────────────────────────────────────
// Every game entry has the same set of hooks, defaulted to no-ops here so the lifecycle can call
// any hook without checking first. Each game's own file loads after core.js and overrides the
// hooks it needs; a game that doesn't need one keeps the no-op. That's why flow.js / game.js /
// ui.js never need a `?.` guard on these calls: a registry entry always has them as functions
// (the only thing a caller still checks is whether S.screen is a game at all; shell screens like
// intro/borrow/results aren't in GAMES). The hooks:
//   screen   returns the screen's HTML (set by every game; not defaulted, so a missing one is a bug)
//   reset    return the game to a fresh bet phase (card games; no-op for single-run games).
//            Called as reset(reason), see the reset(reason) note above.
//   nextHand advance to the next hand (card games; no-op for single-run games)
//   resume   restore mid-animation state after a refresh (no-op where the screen restores instantly)
//   patchBet sync the game's own bet UI on a bet change (UTH + roulette; no-op otherwise)
// (replay is attached later by engine.js for all games; it's the replay-side hook, not a live one.)
// rulesFor is optional, not defaulted like the hooks above: a pure `(mod) => {...scalars/flags}`
// builder for the day's per-game rule bundle, given a mod accessor (getMod live, _engMod in replay).
// Only bj and uth register one (bjRulesFor/uthRulesFor, in their own files); this avoids duplicating
// the same rule defaults separately in the live game and in engine.js. Roulette's spinModsFor/
// evalBetModsFor do the same job in a different shape (they also fold in non-modifier inputs like
// the locked bets, win multiplier, spin override), so they aren't wired here. Ladder has no builder
// at all: it reads getMod('ladder_free') directly (a `cross`-attributed key in MODIFIER_SCHEMA, not
// a ladder-owned one). tests/modifiers.test.js checks that reads stay consistent with MODIFIER_SCHEMA's
// `game` attribution, but nothing enforces it at runtime: a schema key legitimately read outside its
// game's rulesFor (e.g. uth_river_monster/uth_time_travel read straight off getMod in uth.js's
// display/redeal logic rather than through uthRulesFor) is fine; the test documents which keys
// those are.
for (const _g of Object.values(GAMES)) {
  _g.reset    = _g.reset    || (() => {});
  _g.nextHand = _g.nextHand || (() => {});
  _g.resume   = _g.resume   || (() => {});
  _g.patchBet = _g.patchBet || (() => {});
}

// Display metadata for every slot game (the entries of GAMES that carry `meta`). Read by the
// dev menu (GAME1_OPTIONS) and the share text (buildShareText).
const GAME_META = Object.fromEntries(Object.entries(GAMES).filter(([, g]) => g.meta).map(([k, g]) => [k, g.meta]));

// All games can occupy either slot; dev menu filters out the conflicting selection.
const GAME1_OPTIONS = Object.entries(GAME_META).map(([value, m]) => ({ value, label: m.short }));
const GAME2_OPTIONS = GAME1_OPTIONS;

// Navigation sequence: after each game advance to the next; roulette is always last.
const NEXT_SCREEN = { [GAME1]: GAME2, [GAME2]: 'roulette' };

// The one place that answers "what screen comes next?". `cur` is the screen being left (a game
// slot, or a results-bound destination); `f` carries the run facts the choice needs, all passed
// in (no S/DOM read), so it's unit-testable without a DOM:
//   handsLeft          the current game still has hands to play, so stay on this slot
//   ladderFree         active ladder_free bonus stake (truthy on a bonus day)
//   ladPlayed          the free bonus round has already run
//   rResolved          roulette has resolved
//   busted, borrowUsed gate the detour; it fires only when the two agree
// Order: a game slot goes to its NEXT_SCREEN successor (roulette is last); anything with no
// successor goes to results; and a results-bound finish on a bonus day detours once into the
// free Ladder round.
function next(cur, f = {}){
  if(f.handsLeft) return cur;
  let s = NEXT_SCREEN[cur] || 'results';
  if(s==='results' && f.ladderFree && !f.ladPlayed && f.rResolved && f.busted===f.borrowUsed) s='ladder';
  return s;
}

const STORAGE_KEY = 'gambdle_state_';
const ANIM_NONE = 99; // sentinel: suppress card animation on this hand

// ─── SUPABASE CONFIG ──────────────────────────────────
const SUPABASE_URL = 'https://kxbteesmfozqzoxzktzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YnRlZXNtZm96cXpveHprdHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDk3OTEsImV4cCI6MjA5Mzc4NTc5MX0.oiDpuibLU5zZWKjm5LEoXRJGyOLBWieSO5FhPl4I3UU';
// Standard headers for authenticated Supabase REST / RPC / Edge Function calls (the anon key is
// public by design; row-level security enforces write rules). Spread in extra headers per call,
// e.g. { ...SUPABASE_HEADERS, 'Prefer': 'return=minimal' }.
const SUPABASE_HEADERS = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };

// DEV_OVERRIDE turns on via ?dev=true in the URL.
const urlParams = new URLSearchParams(window.location.search);
let DEV_OVERRIDE = urlParams.get('dev') === 'true' ? {} : null;
if(DEV_OVERRIDE) document.body.classList.add('dev-mode');

// ─── MODIFIER RESOLUTION ────────────────────────────────────────────────
// The full chain is: forcedMod (dev-only) > DAILY_MODIFIERS/DAILY_SEED_OVERRIDES date override >
// CYCLE_ORDER cycle slot > Player's Choice pick. Live play and the server replay engine used to
// work this out separately, and drifted once already (the 2026-06-16 incident: a cycle-index
// mismatch made the server replay the wrong day's mod). Now it's two pure functions,
// `resolveDayMod` (everything through the cycle slot) and `applyPlayersChoice` (the last step).
// Splitting it this way exists because the three callers need different points in the chain, not
// just the final result:
//   - `pendingPlayersChoice` (below) needs the preset BEFORE the player's choice is applied, to
//     read its `.choices` list while the day is still uncommitted.
//   - `getMod` (below) needs the final value: `resolveDayMod` then `applyPlayersChoice(mod, S.pcPick)`.
//   - `replayDayMods` (engine.js) needs the final value too, but for an explicit past seed and the
//     recorded pick instead of live state: `resolveDayMod` then `applyPlayersChoice(mod, pcPick)`.
// All three call through these same two functions, so live and replay can't compute the chain
// differently again. See also ARCHITECTURE.md "Modifiers" / "Scoring parity".

// A modifier reference is either a PRESET_MODIFIERS key (string) or an inline preset object. This
// turns either into the preset object (or null), so live play and the server replay normalize a
// day's modifier reference the same way.
function normalizeModRef(ref) {
  if (!ref) return null;
  return typeof ref === 'string' ? PRESET_MODIFIERS[ref] : ref;
}

// Step 2 of the chain (see banner above): applies the Player's Choice pick, shared by live play
// (getMod) and the server replay (replayDayMods). Once a pick is committed on a choices-day, the
// chosen preset IS the active modifier; any other day (or no pick yet) the preset is unchanged.
function applyPlayersChoice(mod, pick) {
  return (mod && mod.choices && pick) ? (PRESET_MODIFIERS[pick] || mod) : mod;
}

// Step 1 of the chain (see banner above): forced > date override > cycle slot. Takes explicit
// inputs so live (`_activeMod` -> `getMod`) and the server replay (`replayDayMods`, engine.js)
// always compute the same cycle index. Stops BEFORE the Player's Choice pick is applied (that's
// `applyPlayersChoice`'s job, called separately by each caller) so `pendingPlayersChoice` can
// still read the unresolved `.choices` list off the same call. Returns the preset object or null.
//   seed      calendar seed (YYYYMMDD) selecting a DAILY_MODIFIERS override
//   dayNum    run day number, indexing the CYCLE_ORDER rotation (modulo kept safe for any integer)
//   forcedMod dev-only forced ref (live only; never set server-side)
function resolveDayMod(seed, dayNum, forcedMod) {
  const len = CYCLE_ORDER.length;
  const cycled = CYCLE_ORDER[((dayNum - 1) % len + len) % len];
  return normalizeModRef(forcedMod || DAILY_MODIFIERS[seed] || cycled);
}

// Resolves today's active modifier preset object (forced > date override > cycle), before the
// player's choice is applied. See `resolveDayMod` above for why it stops there.
function _activeMod() {
  return resolveDayMod(getActiveSeed(), getActiveDayNum(), S.forcedMod);
}

function getMod(key) {
  // Once the player commits a Player's Choice pick, the active modifier IS their chosen preset,
  // so every getMod() call (game rules, banner title/desc, results recalc) reads through it.
  const mod = applyPlayersChoice(_activeMod(), S.pcPick);
  return (mod && mod[key] !== undefined) ? mod[key] : null;
}

// Returns the three offered choice presets ({key, ...preset}) when today is a Player's Choice day
// and the player hasn't committed yet: otherwise null. Drives the picker screen and start routing.
function pendingPlayersChoice() {
  const mod = _activeMod();
  if (mod && mod.choices && !S.pcPick) {
    return mod.choices.map(k => ({ key: k, ...PRESET_MODIFIERS[k] }));
  }
  return null;
}

// ─── CARD UTILITIES ───────────────────────────────────────────
const SUITS=['♠','♥','♦','♣'], RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RED_S=new Set(['♥','♦']);
const buildDeck=()=>SUITS.flatMap(s=>RANKS.map(r=>({s,r})));
// Fisher-Yates shuffle: returns a new shuffled array, leaves the original unchanged.
function shuffle(d,rng){const a=[...d];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Suited Up (uth_suited_conn): build a fresh per-hand deck and force the player's hole cards to a
// suited connector with the lower card 7+: the seven pairs 7-8, 8-9, 9-10, 10-J, J-Q, Q-K, K-A (Ace
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
// hVal + softness (true ⇔ at least one ace still counts as 11) in one pass: the pair a basic-strategy
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


// ─── GLOBAL STATE ───────────────────────────────────────────
const START_CHIPS=1000;
const BORROW_AMOUNT=50; // chips loaned to a busted player; deducted from next day's starting stack
const CHIP_TIERS=[
  {min:2500,emoji:'🐋',label:'Whale'},
  {min:1500,emoji:'💎',label:'High Roller'},
  {min:1000,emoji:'🎓',label:'Apprentice'},
  {min:1,   emoji:'😢',label:'Survivor'},
  {min:0,   emoji:'🤡',label:'Bozo'},
];
// Always returns a tier: fallback to the last entry so NaN/negative chips never return undefined.
function getTier(chips){return CHIP_TIERS.find(t=>chips>=t.min)||CHIP_TIERS[CHIP_TIERS.length-1];}

// Lifetime-net tier ladder for the Player Profile title. Deliberately separate from
// the daily CHIP_TIERS: lifetime net compounds across days (and can go negative), so
// the breakpoints are an order of magnitude larger and no title is shared.
const NET_TIERS=[
  {min:250000,   emoji:'👑', label:'House Legend'},
  {min:100000,   emoji:'💰', label:'Mogul'},
  {min:50000,    emoji:'🏦', label:'The House'},
  {min:25000,    emoji:'🎩', label:'Pit Boss'},
  {min:10000,    emoji:'🦈', label:'Card Shark'},
  {min:2500,     emoji:'💵', label:'Grinder'},
  {min:0,        emoji:'👶', label:'Novice'},
  {min:-4999,    emoji:'📉', label:'In the Red'},
  {min:-Infinity,emoji:'🕳️', label:'Down the Hole'},
];
// Always returns a tier: the -Infinity floor catches any loss, and NaN falls back to the last entry.
function getNetTier(net){return NET_TIERS.find(t=>net>=t.min)||NET_TIERS[NET_TIERS.length-1];}
let S={
  screen:'intro', chips:START_CHIPS, day:getActiveDayNum(),
  bjHand:0, bjPhase:'bet', bjBet:0,
  bjPlayer:[], bjDealer:[], bjResult:null,
  bjHistory:[], bjIdx:0,
  bjDeck2:null, bjDeck2Idx:0, bjCandidates:null,  // Double Vision (bj_two_hands): a fresh per-hand deck + its cursor, and the two candidate hands during the 'pick' phase
  bjSplit:false, bjSplitHands:[], bjSplitActive:0, bjSplitBets:[], bjSplitResults:[], bjSplitDone:[], bjDoubled:false, bjSplitDoubled:[],
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjDealerReveal:false, bjCelebrating:false,
  bjActed:false,    // player finished acting on the current (sub-)hand (stood/doubled): lets a refresh resume the dealer's turn

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
  rSpinAcq:null,    // {words, fromServer, verified} tag for the current round's acquired randomness (roulette.js _acquireSpin): null until fetched, cleared each new spin so a re-spin re-acquires
  rUnverified:false,// spin fell back to a local draw (server unreachable): derived from rSpinAcq.verified; submission carries the flag
  tx:[],            // append-only transcript of replay-relevant decisions (see txLog)
  timeTravelUsed:false, // whether the one-time daily UTH re-deal (uth_time_travel) has been used
  uthRedealPtr:27,  // next index into DEAL.uthDeck's unused tail (cards 27+) for Time Travel re-deals
  forcedMod: null,  // dev override: set by devApplyMod(), cleared on next loadState()
  peeksUsed: 0,     // count of daily dealer peeks consumed (limit = the peek modifier's value)
  peekAt: null,     // {game, hand} the most recent peek was used on: reveal only shows there, not on later hands/games
  borrowUsed: false,        // true once the daily borrow option has been taken or declined
  borrowAmount: 0,          // actual chips borrowed (may exceed BORROW_AMOUNT under min_chips modifier)
  borrowReturnScreen: null, // screen to navigate to after borrowing chips
  pcPick: null,             // Player's Choice: the chosen modifier key once committed (null until picked)
};

// True when the daily borrow option can still be shown: not yet used, and roulette not yet spun.
function _canShowBorrow() {
  return !S.borrowUsed && S.rResult === null;
}

// Chips to loan: always at least BORROW_AMOUNT, bumped up to meet min_chips modifier floor.
function _effectiveBorrowAmount() {
  return Math.max(BORROW_AMOUNT, getMod('min_chips') || 0);
}

// True when the player can no longer place a valid bet (< 10 chips, or below the min_chips modifier floor).
function isChipBusted() {
  if (S.chips < 10) return true;
  const minC = getMod('min_chips') || 0;
  return minC > 0 && S.chips < minC;
}

// Pure win multiplier: the only place the doubling rule lives, shared by the live games (via
// winMult, below) and the replay Engine. `mod` is a key-to-value accessor (getMod live, _engMod in
// replay); `chips` is the live balance at the moment of resolution. Returns 2 when all_in_or_skip
// is active, or while comeback is active and the stack is under 1000, else 1.
function winMultFor(mod, chips){
  if(mod('all_in_or_skip'))return 2;
  if(mod('comeback')&&chips<1000)return 2;
  return 1;
}
// Live win multiplier: winMultFor read through getMod against the live S.chips.
function winMult(){ return winMultFor(getMod, S.chips); }

// ─── CHIP ACCOUNTING ───────────────────────────────────────────────────────
// Single chokepoint for every chip-balance change. Every game routes winnings,
// refunds and stakes through these instead of touching S.chips directly, so the
// running total can't drift, go negative, or pick up fractional chips (odd-bet
// payouts are rounded here rather than ad hoc at each call site). In dev mode each
// delta is logged with a reason, making chip-accounting bugs easy to trace.
// `reason` is a short tag (e.g. 'bj-win', 'roulette-bet') for that dev log only.
function credit(n, reason){
  S.chips += Math.round(n);
  if(DEV_OVERRIDE) console.log(`[chips] +${Math.round(n)} (${reason||'?'}) → ${S.chips}`);
}
function debit(n, reason){
  S.chips = Math.max(0, S.chips - Math.round(n));
  if(DEV_OVERRIDE) console.log(`[chips] -${Math.round(n)} (${reason||'?'}) → ${S.chips}`);
}

// An Accountant is the chip-accounting interface the per-game award helpers settle through, so the
// SAME credit-from-result mapping runs live and in the replay Engine. Two adapters satisfy it:
// liveAcct (below) writes S.chips through the credit/debit chokepoint; the Engine's _engAcct
// (engine.js) is a headless in-memory tally. Both round every delta (Math.round) and floor a debit
// at 0: a third adapter must keep that rule or live/replay parity breaks.
// Shape: { chips: number, credit(n, reason?), debit(n, reason?) }.

// Live accountant adapter: an Accountant backed by S.chips through the credit/debit chokepoint. The
// per-game settlement is expressed as a pure Ledger (built by the *Award helpers) and applied through
// this adapter by applyLedger, so the SAME credit sequence runs live here and headless in the replay
// Engine (which passes its own in-memory adapter). Two adapters, one shared mapping.
// Returns an Accountant.
function liveAcct(){
  return {
    get chips(){ return S.chips; },
    credit(n, reason){ credit(n, reason); },
    debit(n, reason){ debit(n, reason); },
  };
}

// Apply a settlement Ledger through an Accountant: the ONE place a settled play-unit's payout touches
// chips. A Ledger is the pure data form of "what to credit/debit": an ordered list of {op, n, reason}
// (op 'credit'|'debit'). Each *Award helper RETURNS one instead of calling the accountant itself, so
// the credit sequence becomes inspectable, unit-testable data. Order and grouping matter: credit()/
// debit() round every call independently, so summing or reordering entries would change the result.
// applyLedger therefore replays them verbatim, in order. Live and replay build the identical Ledger
// and apply it here, so the two paths can't drift.
function applyLedger(acct, ledger){
  for(const e of ledger){
    if(e.op==='debit') acct.debit(e.n, e.reason);
    else acct.credit(e.n, e.reason);
  }
}

// ─── LEDGER ENTRY GRAMMAR (catches typos in the *Award builders) ─────────────
// Same strict-mode shape as record.js's TX_SHAPE/ROUND_DETAIL_KEYS checks, but reimplemented here (not
// imported) because record.js is DOM-facing and excluded from the replay engine bundle
// (tests/harness/build-engine-bundle.js EXCLUDE), while core.js, and therefore this file, IS bundled. The
// detector below deliberately mirrors record.js's `_strictRounds` rather than sharing it.
// Bundle-safe: the engine bundle's STUB preamble defines a plain `window = { location: {search:''} }`,
// so `window.__GAMBDLE_TEST__` reads as undefined (never throws) and DEV_OVERRIDE resolves to its
// normal `null` production default under `new Function`. No ReferenceError in Deno, no behavior
// change live.
const _ledgerStrict = () => !!DEV_OVERRIDE || !!(typeof window !== 'undefined' && window.__GAMBDLE_TEST__);
// The full reason vocabulary every *Award builder is allowed to emit (grepped from bjAward/
// bjAwardSplit in bj.js, uthAward in uth.js, rouletteAward in roulette.js, ladderAward in ladder.js,
// the only applyLedger feeders). Adding a new award reason means adding it here first, or ledgerEntry
// throws in strict mode the moment the typo'd/new string is built.
const LEDGER_REASONS = new Set([
  'bj-blackjack', 'bj-win', 'bj-push', 'bj-split-win', 'bj-split-push',
  'uth-play', 'uth-ante', 'uth-ante-push', 'uth-blind', 'uth-push',
  'roulette', 'ladder',
]);
// Validating factory for one Ledger entry: the *Award builders call this instead of hand-writing
// {op,n,reason} literals, so a typo'd op, a non-finite/negative n, or an undeclared reason blows up
// loudly at build time (strict mode only: dev/test, see _ledgerStrict). Prod builds skip the checks
// entirely (perf, no throw risk for players); the returned shape is byte-identical either way, so
// live/replay parity (ledger outputs feed straight into applyLedger) is untouched.
function ledgerEntry(op, n, reason){
  if(_ledgerStrict()){
    if(op!=='credit' && op!=='debit') throw new Error(`ledgerEntry: op must be 'credit'|'debit', got '${op}'`);
    if(!Number.isFinite(n) || n<0) throw new Error(`ledgerEntry: n must be a finite number >= 0, got ${n}`);
    if(!LEDGER_REASONS.has(reason)) throw new Error(`ledgerEntry: unknown reason '${reason}'. Add it to LEDGER_REASONS (core.js) if new.`);
  }
  return {op, n, reason};
}
// Thin credit/debit wrappers over ledgerEntry: read at each *Award call site as "credit this much,
// for this reason" rather than a bare op string. Named `mkCredit`/`mkDebit` (not `credit`/`debit`) to
// stay distinct from the chip-accounting chokepoint above, which these do NOT call: they only build
// the data an Accountant later applies via applyLedger.
const mkCredit = (n, reason) => ledgerEntry('credit', n, reason);
const mkDebit  = (n, reason) => ledgerEntry('debit', n, reason);

// Apply `fn` to S, then saveState() exactly once on exit, even if `fn` returns early or throws (the
// save still fires, matching "save what we have"). Returns `fn`'s value so callers can
// `return mutate(...)`. Reads stay direct (S.x); only writes route here so the save can't be
// forgotten: the #1 hard rule ("saveState() after any mutation to S") exists because skipping this
// wrapper is how that rule gets broken. Single-purpose: it does NOT render() (a flow concern,
// forbidden mid-hand). `s` IS the live S (same object), so there's no copy/proxy and zero overhead.
//   mutate(s => { s.bjPhase = 'play'; });
//   const pot = mutate(s => { s.ladRung++; return ladPotAt(s.ladBet, s.ladRung); });
// Async: await OUTSIDE, then mutate() the settled values so the save fires after the state is final.
function mutate(fn){
  try { return fn(S); }
  finally { saveState(); }
}


// Writes the current run state to _ls for persistence.
function saveState() {
  const toSave = { ...S, pkHeld: [...S.pkHeld] };
  _ls.setItem(getStateKey(), JSON.stringify(toSave));
  if (S.screen === 'results' && !_testActive() && !_backlogSeed) {
    const high = parseInt(_ls.getItem('gambdle_highscore') || '0');
    if (S.chips > high) {
      _ls.setItem('gambdle_highscore', S.chips.toString());
      let unlockMsg = null;
      for (const [min, key, txt] of [
        [1500,  'orange_back_unlocked',  '🟠 Orange Card Back unlocked! Check Preferences.'],
        [2000,  'green_theme_unlocked',  '🌿 Luna Green theme unlocked! Check Preferences → Theme.'],
        [2500,  'maroon_felt_unlocked',  '🎱 Maroon Felt unlocked! Check Preferences.'],
        [3500,  'deck_emoji_unlocked',   '🌱 Emoji Deck unlocked! Check Preferences.'],
        [5000,  'whale_back_unlocked',   '🐋 Whale Card Back unlocked! Check Preferences.'],
        [10000, 'golden_back_unlocked',  '🏆 Golden Card Back unlocked! Check Preferences.'],
      ]) if (S.chips >= min && !getPref(key)) { setPref(key, true); unlockMsg = txt; }
      if (unlockMsg) setTimeout(()=>toast(unlockMsg), 1200);
    }
    // Wrap in try/catch: a long-running player's gambdle_history can become corrupted JSON;
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

// Loads any existing saved progress for the current day.
function loadState() {
  const saved = _ls.getItem(getStateKey());
  let parsed = null;
  if (saved) {
    // A corrupt value (truncated by storage-quota pressure, an interrupted write) must not crash
    // the boot path: JSON.parse would throw an uncaught SyntaxError and leave a blank screen with
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
      // means a corrupted/edited save · never let it be displayed, shared, or submitted to the board.
      S.chips = Number.isFinite(_calc) ? Math.max(0, _calc) : S.chips;
    }
  } else {
    // No saved state for today: apply borrow debt only if it targets today's exact seed.
    // If the player skipped the target day, the debt expires without applying.
    // Skip in test/backlog modes so practice runs don't consume or create debt.
    if (!_testActive() && !_backlogSeed) {
      try {
        const raw = _ls.getItem('gambdle_borrow_debt');
        if (raw) {
          const debt = JSON.parse(raw);
          if (typeof debt.targetSeed !== 'number' || typeof debt.amount !== 'number') {
            // Malformed entry: clear immediately rather than leaving it stuck forever.
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
