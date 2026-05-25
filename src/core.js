
// Set browser tab title
document.title = "♠️ Gambdle";

// Storage wrapper: tries _ls, falls back to sessionStorage (private browsing).
// State survives tab refreshes in either case; sessionStorage clears when the tab closes.
const _ls = (() => {
  try { _ls.setItem('_g','1'); _ls.removeItem('_g'); return _ls; }
  catch { return sessionStorage; }
})();

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
const _testActive = () => !!_ls.getItem('gambdle_use_test_seed');
function getRngSeed() { return _testActive()?1:getDailySeed(); }
function getStateKey() { return _testActive()?'gambdle_test_state':STORAGE_KEY+getDailySeed(); }

/** Start of the daily Gambdle run (May 5th, 2026) used for consistent day numbering. */
const START_DATE_UTC = Date.UTC(2026, 4, 5);

// Derives day number from getDailySeed so both are always in sync.
const getDayNum = () => { const s=getDailySeed(); const y=Math.floor(s/10000),m=Math.floor((s%10000)/100)-1,d=s%100; return Math.floor((Date.UTC(y,m,d)-START_DATE_UTC)/86400000)+1; };

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
function gameNet(g){ return gameHistory(g).reduce((a,h)=>a+h.delta,0); }
const STORAGE_KEY = 'gambdle_state_';
const ANIM_NONE = 99; // sentinel: suppress card animation on this hand

// ─── SUPABASE CONFIG ──────────────────────────────────
const SUPABASE_URL = 'https://kxbteesmfozqzoxzktzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YnRlZXNtZm96cXpveHprdHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDk3OTEsImV4cCI6MjA5Mzc4NTc5MX0.oiDpuibLU5zZWKjm5LEoXRJGyOLBWieSO5FhPl4I3UU';

/** DEV_OVERRIDE enabled via ?dev=true in URL */
const urlParams = new URLSearchParams(window.location.search);
let DEV_OVERRIDE = urlParams.get('dev') === 'true' ? {} : null;
if(DEV_OVERRIDE) document.body.classList.add('dev-mode');

/** Manual overrides for deck seeding (independent of ?dev=true flag) */
const ENABLE_CARD_SEEDING = false; // Set to true to enable the overrides below

function getMod(key) {
  const cycled = CYCLE_ORDER[(getDayNum()-1) % CYCLE_ORDER.length];
  const modRef = S.forcedMod || DAILY_MODIFIERS[getDailySeed()] || cycled;
  if (!modRef) return null;
  let mod = typeof modRef === 'string' ? PRESET_MODIFIERS[modRef] : modRef;
  return (mod && mod[key] !== undefined) ? mod[key] : null;
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

// Pre-generates all cards and spin data for the daily run.
function genGame(){
  const rng=mkRng(getRngSeed());
  const shoe=[];for(let i=0;i<2;i++)shoe.push(...buildDeck());
  let bjShoe=shuffle(shoe,rng);
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

  return{bjShoe,pokerDecks,uthDeck,rSpinOverride};
}
// G is generated once at page load — the same deal for everyone on the same calendar day.
const G=genGame();

// ─── GLOBAL STATE ───────────────────────────────────────────
const START=1000;
const CHIP_TIERS=[
  {min:2500,emoji:'🐋',label:'Whale'},
  {min:1500,emoji:'💎',label:'High Roller'},
  {min:1000,emoji:'🎓',label:'Apprentice'},
  {min:1,   emoji:'😢',label:'Survivor'},
  {min:0,   emoji:'🤡',label:'Bozo'},
];
function getTier(chips){return CHIP_TIERS.find(t=>chips>=t.min);}
let S={
  screen:'intro', chips:START, day:getDayNum(),
  bjHand:0, bjPhase:'bet', bjBet:0,
  bjPlayer:[], bjDealer:[], bjResult:null,
  bjHistory:[], bjIdx:0,
  bjSplit:false, bjSplitHands:[], bjSplitActive:0, bjSplitBets:[], bjSplitResults:[], bjSplitDone:[], bjDoubled:false, bjSplitDoubled:[],
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjDealerReveal:false, bjCelebrating:false,
  pkHand:0, pkPhase:'bet', pkBet:0,
  pkCards:[], pkHeld:new Set(), pkFinal:[], pkHistory:[], pkRevealStep:0,
  uthHand:0, uthPhase:'bet', uthAnte:0, uthPlay:0, uthPlayMult:0,
  uthRaised:false, uthFolded:false,
  uthHole:[], uthDealer:[], uthComm:[],
  uthRevealComm:0, uthPrevRevealComm:0, uthHistory:[],
  rPhase:'bet', rBets:[], rBet:0, rPick:null, rResult:null,
  rSpin:null,       // the winning number (set at spin time, null until first spin)
  rReSpun:false,    // true once the player uses their free re-spin (r_respin modifier)
  forcedMod: null,  // dev override — set by devApplyMod(), cleared on next loadState()
  peekUsed: false,  // whether the one-time dealer peek has been used this game
};

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

/** Writes the current run state to _ls for persistence. */
function saveState() {
  const toSave = { ...S, pkHeld: [...S.pkHeld] };
  _ls.setItem(getStateKey(), JSON.stringify(toSave));
  if (S.screen === 'results' && !_testActive()) {
    const high = parseInt(_ls.getItem('gambdle_highscore') || '0');
    if (S.chips > high) {
      _ls.setItem('gambdle_highscore', S.chips.toString());
      let unlockMsg = null;
      for (const [min, key, txt] of [
        [1500,  'orange_back_unlocked', '🟠 Orange Card Back unlocked! Check Preferences.'],
        [2500,  'maroon_felt_unlocked', '🎱 Maroon Felt unlocked! Check Preferences.'],
        [3500,  'deck_emoji_unlocked',  '🌱 Emoji Deck unlocked! Check Preferences.'],
        [5000,  'whale_back_unlocked',  '🐋 Whale Card Back unlocked! Check Preferences.'],
        [10000, 'golden_back_unlocked', '🏆 Golden Card Back unlocked! Check Preferences.'],
      ]) if (S.chips >= min && !getPref(key)) { setPref(key, true); unlockMsg = txt; }
      if (unlockMsg) setTimeout(()=>toast(unlockMsg), 1200);
    }
    const history = JSON.parse(_ls.getItem('gambdle_history') || '{}');
    history[getDailySeed()] = S.chips;
    _ls.setItem('gambdle_history', JSON.stringify(history));
  }
}

/** Loads any existing saved progress for the current day. */
function loadState() {
  const saved = _ls.getItem(getStateKey());
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed.pkHeld)) parsed.pkHeld = new Set(parsed.pkHeld);
    S = { ...S, ...parsed, day: getDayNum() };
    // Migrate: old saves used 'poker' as a generic game-2 screen key; now it means 5-card poker specifically.
    if (S.screen === 'poker' && GAME2 !== 'poker') S.screen = GAME2;
  }
  const forced = _ls.getItem('gambdle_forced_mod');
  if (forced) {
    S.forcedMod = forced;
    _ls.removeItem('gambdle_forced_mod');
    saveState();
  }
}
