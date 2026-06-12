
// Set browser tab title
document.title = "♠️ Gambdle";

const GAME_VERSION = 'v1.29';

// Storage wrapper: tries localStorage, falls back to sessionStorage (private browsing).
// State survives tab refreshes in either case; sessionStorage clears when the tab closes.
const _ls = (() => {
  try { localStorage.setItem('_g','1'); localStorage.removeItem('_g'); return localStorage; }
  catch { return sessionStorage; }
})();

// Persistent anonymous device ID stored in localStorage — used for fingerprinting submissions.
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

// SplitMix32-style seeded PRNG — returns a function that yields floats in [0, 1).
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
// Used as both the RNG seed and the _ls key — everyone resets at midnight Arizona.
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
// Test-only setter — lets dev-advanced.test.js override _backlogSeed without a page reload.
function _setBacklogSeedForTest(v) { _backlogSeed = v; }
// The test seed only takes effect in dev mode (?dev=true) or under the unit-test harness
// (which sets window.__GAMBDLE_TEST__) — never in normal play, even if the flag lingers in
// localStorage from a past dev session. DEV_OVERRIDE is read lazily (defined later in this file).
const _testActive = () => (!!DEV_OVERRIDE || !!(typeof window!=='undefined'&&window.__GAMBDLE_TEST__)) && !!_ls.getItem('gambdle_use_test_seed');
function getRngSeed() { return _testActive()?1:(DAILY_SEED_OVERRIDES[getActiveSeed()]||getActiveSeed()); }
function getStateKey() { return _testActive()?'gambdle_test_state':STORAGE_KEY+getActiveSeed(); }

/** Start of the daily Gambdle run (May 5th, 2026) used for consistent day numbering. */
const START_DATE_UTC = Date.UTC(2026, 4, 5);

// Derives day number from getDailySeed so both are always in sync.
const getDayNum = () => { const s=getDailySeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };
const getActiveDayNum = () => { const s=getActiveSeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };

// Absolute day index (days since START_DATE) for a YYYYMMDD seed — lets us tell whether
// two played days are calendar-adjacent regardless of month boundaries.
const _seedDayIndex = s => { const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000); };

/**
 * Daily streak from the player's completed-day history (gambdle_history, keyed by seed).
 * Returns { current, best }:
 *   - current: consecutive days played ending at `endSeed` (today by default). Pass
 *     includeEnd=true to count `endSeed` itself even if it isn't persisted yet — the
 *     results screen renders before saveState() writes today's entry.
 *   - best: longest consecutive run anywhere in history.
 * A missed day breaks the run. Reads localStorage defensively (corrupt JSON → no streak).
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

// Cosmetic unlock catalog — single source of truth for the profile window's badge grid.
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

/**
 * Lifetime stats for the Player Profile window, derived from gambdle_history and
 * gambdle_highscore. Returns all zeros (and a 28-cell all-'miss' calendar) for a new
 * player or a corrupt history; never throws.
 *   streak  — current daily streak. Counts back from today; if today isn't finished
 *             yet it counts back from yesterday instead (an unfinished today doesn't
 *             break the run — it only breaks once the day is actually missed).
 *   longest — longest consecutive run anywhere in history (computeStreak's best).
 *   calendar — last 28 Phoenix days, oldest first (index 27 = today):
 *             'profit' (>= START_CHIPS — breaking even counts), 'loss' (1..999),
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
  return { daysPlayed, streak, longest, best, avg, net, busts, calendar };
}

// Creates a card object; s accepts shorthand ('s','h','d','c') or a direct suit symbol.
function card(r,s){return{r,s:{s:'♠',h:'♥',d:'♦',c:'♣'}[s]||s};}

// Dev overrides (set by devSetGame); fall back to configured defaults.
const GAME1 = _ls.getItem('gambdle_dev_game1') || 'bj';
const GAME2 = _ls.getItem('gambdle_dev_game2') || 'uth';

// Metadata for every available game — add new games here.
// short: label used in dev menu buttons and share text.
const GAME_META = {
  bj:    { icon: '🃏', name: 'Blackjack',             short: 'Blackjack',    desc: '3 hands · Hit, Stand, Double, Split' },
  uth:   { icon: '♠',  name: "Ultimate Texas Hold'em", short: "Hold'em",      desc: '3 hands · Ante, Blind & Play' },
  poker: { icon: '♠',  name: '5 Card Poker',           short: '5 Card Poker', desc: '3 hands · Jacks or Better' },
};

// All games can occupy either slot; dev menu filters out the conflicting selection.
const GAME1_OPTIONS = Object.entries(GAME_META).map(([value, m]) => ({ value, label: m.short }));
const GAME2_OPTIONS = GAME1_OPTIONS;

// Navigation sequence: after each game advance to the next, roulette is always last.
const NEXT_SCREEN = { [GAME1]: GAME2, [GAME2]: 'roulette' };

// Game-agnostic history and net helpers — used by results screen and share text.
function gameHistory(g){ return g==='bj'?S.bjHistory:g==='uth'?S.uthHistory:S.pkHistory; }
// Non-finite deltas (undefined, NaN) are skipped rather than poisoning the whole sum.
function gameNet(g){ return gameHistory(g).reduce((a,h)=>a+(Number.isFinite(h.delta)?h.delta:0),0); }
// Recomputes the run's chip total from recorded history, so a stale or edited save can't inflate a
// score. Borrowed chips count as part of the effective starting stack. Returns NaN if history is
// corrupt; callers fall back to the saved value. Single source of truth for loadState + advanceTo.
function recalcChips(){ return START_CHIPS + (S.borrowUsed ? (S.borrowAmount || BORROW_AMOUNT) : 0) + gameNet(GAME1) + gameNet(GAME2) + (S.rResult?.delta || 0); }
const STORAGE_KEY = 'gambdle_state_';
const ANIM_NONE = 99; // sentinel: suppress card animation on this hand

// ─── SUPABASE CONFIG ──────────────────────────────────
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

/** Manual overrides for deck seeding (independent of ?dev=true flag) */
const ENABLE_CARD_SEEDING = false; // Set to true to enable the overrides below

// Resolves today's active modifier preset object (forced > date override > cycle), or null.
// Does NOT apply the Player's Choice indirection — that's getMod's job.
function _activeMod() {
  const cycled = CYCLE_ORDER[(getActiveDayNum()-1) % CYCLE_ORDER.length];
  const modRef = S.forcedMod || DAILY_MODIFIERS[getActiveSeed()] || cycled;
  if (!modRef) return null;
  return typeof modRef === 'string' ? PRESET_MODIFIERS[modRef] : modRef;
}

function getMod(key) {
  let mod = _activeMod();
  if (!mod) return null;
  // Player's Choice: once the player commits a pick, the active modifier IS their chosen preset,
  // so every getMod() call (game rules, banner title/desc, results recalc) reads through it.
  if (mod.choices && S.pcPick) mod = PRESET_MODIFIERS[S.pcPick] || mod;
  return (mod && mod[key] !== undefined) ? mod[key] : null;
}

// Returns the three offered choice presets ({key, ...preset}) when today is a Player's Choice day
// and the player hasn't committed yet — otherwise null. Drives the picker screen and start routing.
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
// Fisher-Yates shuffle — returns a new shuffled array, leaves the original unchanged.
function shuffle(d,rng){const a=[...d];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cVal(r){return 'JQK'.includes(r)?10:r==='A'?11:+r;}
// Totals a hand; aces start as 11 and are downgraded to 1 one-at-a-time to avoid bust.
function hVal(cs){let v=0,a=0;for(const c of cs){v+=cVal(c.r);if(c.r==='A')a++;}while(v>21&&a-- >0)v-=10;return v;}
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

// ─── TEST & SEEDING ────────────────────────────────────────────
// Hardcoded test scenarios applied when the dev "Test Seed" checkbox is active.
const TEST_CARD_OVERRIDE = {
  bjShoe: [
    card('8','s'), card('8','h'), card('6','d'), card('7','c'),
    card('8','d'),
    card('J','h'),
    card('8','c'),
    card('7','s'),
    card('4','h'),
    card('5','d'),
    card('6','h'),
    card('3','c'),
    card('10','s'),
    card('K','d'),
  ],
  uthHands: [
    { hole:   [card('A','s'), card('A','c')],
      dealer: [card('2','d'), card('7','h')],
      comm:   [card('K','s'), card('Q','c'), card('J','s'), card('J','d'), card('8','h')] },
    { hole:   [card('7','c'), card('2','c')],
      dealer: [card('A','h'), card('K','h')],
      comm:   [card('A','d'), card('K','d'), card('K','c'), card('Q','s'), card('J','h')] },
    { hole:   [card('9','d'), card('8','d')],
      dealer: [card('2','h'), card('5','c')],
      comm:   [card('7','d'), card('6','d'), card('5','d'), card('Q','h'), card('3','c')] },
  ],
  rSpin: 0,
};

// Splices override cards to the front of the shoe, preserving remaining cards in order.
function _applyBjShoeOverride(shoe, cards) {
  if (!cards || !cards.length) return shoe;
  const pool = [...shoe];
  for (const oc of cards) {
    const i = pool.findIndex(c => c.r === oc.r && c.s === oc.s);
    if (i !== -1) pool.splice(i, 1);
  }
  return [...cards, ...pool];
}

// Places override hands at their fixed offsets in the UTH deck (9 cards per hand).
function _applyUthDeckOverride(deck, hands) {
  if (!hands || !hands.length) return deck;
  const placed = new Map();
  const pool = [...deck];
  for (let h = 0; h < 3; h++) {
    const spec = hands[h];
    if (!spec) continue;
    const off = h * 9;
    const slots = [
      ...(spec.hole   || []).slice(0, 2),
      ...(spec.dealer || []).slice(0, 2),
      ...(spec.comm   || []).slice(0, 5),
    ];
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      placed.set(off + i, slots[i]);
      const pi = pool.findIndex(c => c.r === slots[i].r && c.s === slots[i].s);
      if (pi !== -1) pool.splice(pi, 1);
    }
  }
  const newDeck = [];
  let pi = 0;
  for (let i = 0; i < 52; i++) newDeck.push(placed.has(i) ? placed.get(i) : pool[pi++]);
  return newDeck;
}

// Two extra decks for the BJ shoe, shuffled by a PRNG seeded INDEPENDENTLY of the main
// draw sequence — so the base 104 cards and every poker/UTH draw stay byte-identical while
// the shoe gains a tail it can fall back on. Deterministic per seed (identical for everyone
// on a given day). Only ever consumed if a player draws past the base 104 (aggressive
// wild-split play); without it, a draw past the end is undefined → uncaught crash.
function _extendBjShoe(seed){
  const rng2=mkRng((seed^0x9e3779b9)>>>0);
  return shuffle(buildDeck(),rng2).concat(shuffle(buildDeck(),rng2));
}

// Pre-generates all cards and spin data for the daily run.
function genDeal(){
  const seed=getRngSeed();
  const rng=mkRng(seed);
  const shoe=[];for(let i=0;i<2;i++)shoe.push(...buildDeck());
  let bjShoe=shuffle(shoe,rng);
  // One fresh 52-card deck per poker hand; each shuffle advances the shared RNG sequence.
  const pokerDecks=Array.from({length:3},()=>shuffle(buildDeck(),rng));
  let uthDeck=shuffle(buildDeck(),rng);
  let rSpinOverride=null;

  if(_testActive()){
    const ov=TEST_CARD_OVERRIDE;
    bjShoe = _applyBjShoeOverride(bjShoe, ov.bjShoe);
    uthDeck = _applyUthDeckOverride(uthDeck, ov.uthHands);
    if(ov.rSpin!=null)rSpinOverride=ov.rSpin;
  }

  if(ENABLE_CARD_SEEDING){
    const CARD_SEED_OVERRIDE = {
      bjShoe: [
        card('A','s'), card('J','s'), card('K','d'), card('5','c'),
        card('J','s'), card('A','d'), card('2','d'), card('9','c'),
        card('10','s'), card('10','h'), card('Q','d'), card('2','c'),
      ],
      uthHands: [
        { hole:   [card('A','s'), card('K','s')],
          dealer: [card('2','h'), card('7','d')],
          comm:   [card('Q','s'), card('J','s'), card('10','s'), card('3','c'), card('6','d')] },
        null,
        null,
      ],
      rSpin: null,
    };
    bjShoe = _applyBjShoeOverride(bjShoe, CARD_SEED_OVERRIDE.bjShoe);
    uthDeck = _applyUthDeckOverride(uthDeck, CARD_SEED_OVERRIDE.uthHands);
    if(CARD_SEED_OVERRIDE.rSpin != null) rSpinOverride=CARD_SEED_OVERRIDE.rSpin;
  }

  // Append the no-run-dry tail AFTER any test/seed overrides, so overrides only ever touch
  // the base 104 and the appended decks stay pristine.
  bjShoe=bjShoe.concat(_extendBjShoe(seed));
  return{bjShoe,pokerDecks,uthDeck,rSpinOverride};
}
// DEAL is generated once at page load — the same cards for everyone on the same calendar day.
const DEAL=genDeal();

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
// Always returns a tier — fallback to the last entry so NaN/negative chips never return undefined.
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
// Always returns a tier — the -Infinity floor catches any loss, and NaN falls back to the last entry.
function getNetTier(net){return NET_TIERS.find(t=>net>=t.min)||NET_TIERS[NET_TIERS.length-1];}
let S={
  screen:'intro', chips:START_CHIPS, day:getActiveDayNum(),
  bjHand:0, bjPhase:'bet', bjBet:0,
  bjPlayer:[], bjDealer:[], bjResult:null,
  bjHistory:[], bjIdx:0,
  bjSplit:false, bjSplitHands:[], bjSplitActive:0, bjSplitBets:[], bjSplitResults:[], bjSplitDone:[], bjDoubled:false, bjSplitDoubled:[],
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjDealerReveal:false, bjCelebrating:false,
  bjActed:false,    // player finished acting on the current (sub-)hand (stood/doubled) — lets a refresh resume the dealer's turn

  pkHand:0, pkPhase:'bet', pkBet:0,
  pkCards:[], pkHeld:new Set(), pkFinal:[], pkHistory:[], pkRevealStep:0,
  uthHand:0, uthPhase:'bet', uthAnte:0, uthPlay:0, uthPlayMult:0,
  uthRaised:false, uthFolded:false,
  uthHole:[], uthDealer:[], uthComm:[],
  uthRevealComm:0, uthPrevRevealComm:0, uthHistory:[],
  rPhase:'bet', rBets:[], rBet:0, rPick:null, rResult:null,
  rSpin:null,       // the winning number (set at spin time, null until first spin)
  rSpin2:null,      // second winning number for the Double Ball modifier (r_double_ball)
  rReSpun:false,    // true once the player uses their free re-spin (r_respin modifier)
  rUnverified:false,// spin fell back to a local draw (server unreachable) — submission carries the flag
  tx:[],            // append-only transcript of replay-relevant decisions (see txLog)
  timeTravelUsed:false, // whether the one-time daily UTH re-deal (uth_time_travel) has been used
  uthRedealPtr:27,  // next index into DEAL.uthDeck's unused tail (cards 27+) for Time Travel re-deals
  forcedMod: null,  // dev override — set by devApplyMod(), cleared on next loadState()
  peeksUsed: 0,     // count of daily dealer peeks consumed (limit = the peek modifier's value)
  peekAt: null,     // {game, hand} the most recent peek was used on — reveal only shows there, not on later hands/games
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

/** Returns 2 when the all_in_or_skip or comeback modifier is active (wins are doubled), else 1. */
function winMult(){
  if(getMod('all_in_or_skip'))return 2;
  if(getMod('comeback')&&S.chips<1000)return 2;
  return 1;
}

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

// ─── RUN TRANSCRIPT ────────────────────────────────────────────────────────
// Append-only log of every replay-relevant player decision: bets and moves in each game,
// the borrow, the Player's Choice pick, Time Travel re-deals, and the locked roulette bets.
// Persisted with the run state and sent with the leaderboard submission, where it's stored
// for auditing — and, in integrity Phase 2, replayed server-side to recompute the score
// (see .claude/LEADERBOARD-INTEGRITY.md). Dealer peeks are NOT logged (no chip/card effect).
// Persistence rides the caller's existing saveState()/render() flow.
function txLog(e){ if(Array.isArray(S.tx)) S.tx.push(e); }

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
        [1500,  'orange_back_unlocked',  '🟠 Orange Card Back unlocked! Check Preferences.'],
        [2000,  'green_theme_unlocked',  '🌿 Luna Green theme unlocked! Check Preferences → Theme.'],
        [2500,  'maroon_felt_unlocked',  '🎱 Maroon Felt unlocked! Check Preferences.'],
        [3500,  'deck_emoji_unlocked',   '🌱 Emoji Deck unlocked! Check Preferences.'],
        [5000,  'whale_back_unlocked',   '🐋 Whale Card Back unlocked! Check Preferences.'],
        [10000, 'golden_back_unlocked',  '🏆 Golden Card Back unlocked! Check Preferences.'],
      ]) if (S.chips >= min && !getPref(key)) { setPref(key, true); unlockMsg = txt; }
      if (unlockMsg) setTimeout(()=>toast(unlockMsg), 1200);
    }
    // Wrap in try/catch — a long-running player's gambdle_history can become corrupted JSON;
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
    // the boot path — JSON.parse would throw an uncaught SyntaxError and leave a blank screen with
    // no way to recover. Treat unparseable saves as "no save": start the day fresh.
    try { parsed = JSON.parse(saved); } catch (e) { parsed = null; }
  }
  if (parsed) {
    if (Array.isArray(parsed.pkHeld)) parsed.pkHeld = new Set(parsed.pkHeld);
    S = { ...S, ...parsed, day: getActiveDayNum() };
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
      // means a corrupted/edited save — never let it be displayed, shared, or submitted to the board.
      S.chips = Number.isFinite(_calc) ? Math.max(0, _calc) : S.chips;
    }
  } else {
    // No saved state for today — apply borrow debt only if it targets today's exact seed.
    // If the player skipped the target day, the debt expires without applying.
    // Skip in test/backlog modes so practice runs don't consume or create debt.
    if (!_testActive() && !_backlogSeed) {
      try {
        const raw = _ls.getItem('gambdle_borrow_debt');
        if (raw) {
          const debt = JSON.parse(raw);
          if (typeof debt.targetSeed !== 'number' || typeof debt.amount !== 'number') {
            // Malformed entry — clear immediately rather than leaving it stuck forever.
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
