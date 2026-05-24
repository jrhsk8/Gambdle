
// Set browser tab title
document.title = "♠️ Gambdle";

// SplitMix32-style seeded PRNG for deterministic daily hands.
function mkRng(seed) {
  let s = (seed ^ 0x6d2b79f5) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}
const getDailySeed = () => { const d=new Date(); return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); };
const _testActive = () => !!localStorage.getItem('gambdle_use_test_seed');
function getRngSeed() { return _testActive()?1:getDailySeed(); }
function getStateKey() { return _testActive()?'gambdle_test_state':STORAGE_KEY+getDailySeed(); }

/** Start of the daily Gambdle run (May 5th, 2026) used for consistent day numbering. */
const START_DATE_UTC = Date.UTC(2026, 4, 5);

const getDayNum = () => { const n=new Date(); n.setUTCHours(0,0,0,0); return Math.floor((n - START_DATE_UTC) / 86400000) + 1; };

function card(r,s){return{r,s:{s:'♠',h:'♥',d:'♦',c:'♣'}[s]||s};}

// 'uth' = Ultimate Texas Hold'em  |  'poker' = 5 Card Poker
const GAME2 = 'uth';
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
function shuffle(d,rng){const a=[...d];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cVal(r){return 'JQK'.includes(r)?10:r==='A'?11:+r;}
function hVal(cs){let v=0,a=0;for(const c of cs){v+=cVal(c.r);if(c.r==='A')a++;}while(v>21&&a-- >0)v-=10;return v;}
function hValDisplay(cs){
  let v=0,aces=0;
  for(const c of cs){v+=cVal(c.r);if(c.r==='A')aces++;}
  let red=0;while(v>21&&red<aces){v-=10;red++;}
  if(aces-red>0&&v<=21){const hard=v-10*(aces-red);return`${hard} / ${v}`;}
  return String(v);
}
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
    if(ov.bjShoe&&ov.bjShoe.length){const pool=[...bjShoe];for(const oc of ov.bjShoe){const i=pool.findIndex(c=>c.r===oc.r&&c.s===oc.s);if(i!==-1)pool.splice(i,1);}bjShoe=[...ov.bjShoe,...pool];}
    if(ov.uthHands&&ov.uthHands.length){const placed=new Map();const pool=[...uthDeck];for(let h=0;h<3;h++){const spec=ov.uthHands[h];if(!spec)continue;const off=h*9;const slots=[...(spec.hole||[]).slice(0,2),...(spec.dealer||[]).slice(0,2),...(spec.comm||[]).slice(0,5)];for(let i=0;i<slots.length;i++){if(!slots[i])continue;placed.set(off+i,slots[i]);const pi=pool.findIndex(c=>c.r===slots[i].r&&c.s===slots[i].s);if(pi!==-1)pool.splice(pi,1);}}const newDeck=[];let pi=0;for(let i=0;i<52;i++)newDeck.push(placed.has(i)?placed.get(i):pool[pi++]);uthDeck=newDeck;}
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
    if(CARD_SEED_OVERRIDE.bjShoe && CARD_SEED_OVERRIDE.bjShoe.length){
      const pool=[...bjShoe];
      for(const oc of CARD_SEED_OVERRIDE.bjShoe){
        const i=pool.findIndex(c=>c.r===oc.r&&c.s===oc.s);
        if(i!==-1)pool.splice(i,1);
      }
      bjShoe=[...CARD_SEED_OVERRIDE.bjShoe,...pool];
    }
    if(CARD_SEED_OVERRIDE.uthHands && CARD_SEED_OVERRIDE.uthHands.length){
      const placed=new Map();
      const pool=[...uthDeck];
      for(let h=0;h<3;h++){
        const spec=CARD_SEED_OVERRIDE.uthHands[h];
        if(!spec)continue;
        const off=h*9;
        const slots=[...(spec.hole||[]).slice(0,2),...(spec.dealer||[]).slice(0,2),...(spec.comm||[]).slice(0,5)];
        for(let i=0;i<slots.length;i++){
          if(!slots[i])continue;
          placed.set(off+i,slots[i]);
          const pi=pool.findIndex(c=>c.r===slots[i].r&&c.s===slots[i].s);
          if(pi!==-1)pool.splice(pi,1);
        }
      }
      const newDeck=[];let pi=0;
      for(let i=0;i<52;i++) newDeck.push(placed.has(i)?placed.get(i):pool[pi++]);
      uthDeck=newDeck;
    }
    if(CARD_SEED_OVERRIDE.rSpin != null) rSpinOverride=CARD_SEED_OVERRIDE.rSpin;
  }
  return{bjShoe,pokerDecks,uthDeck,rSpinOverride};
}
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
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjResultAnimPlayer:false, bjDealerReveal:false, bjCelebrating:false,
  pkHand:0, pkPhase:'bet', pkBet:0,
  pkCards:[], pkHeld:new Set(), pkFinal:[], pkHistory:[], pkRevealStep:0,
  uthHand:0, uthPhase:'bet', uthAnte:0, uthPlay:0, uthPlayMult:0,
  uthRaised:false, uthFolded:false,
  uthHole:[], uthDealer:[], uthComm:[],
  uthRevealComm:0, uthPrevRevealComm:0, uthHistory:[],
  rPhase:'bet', rBets:[], rBet:0, rPick:null, rResult:null, rSpin:null, rReSpun:false,
  forcedMod: null,
  peekUsed: false,
};

/** Returns 2 when the all_in_or_skip or comeback modifier is active (wins are doubled), else 1. */
function winMult(){
  if(getMod('all_in_or_skip'))return 2;
  if(getMod('comeback')&&S.chips<1000)return 2;
  return 1;
}

/** Writes the current run state to localStorage for persistence. */
function saveState() {
  localStorage.setItem(getStateKey(), JSON.stringify(S));
  if (S.screen === 'results' && !_testActive()) {
    const high = parseInt(localStorage.getItem('gambdle_highscore') || '0');
    if (S.chips > high) {
      localStorage.setItem('gambdle_highscore', S.chips.toString());
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
    const history = JSON.parse(localStorage.getItem('gambdle_history') || '{}');
    history[getDailySeed()] = S.chips;
    localStorage.setItem('gambdle_history', JSON.stringify(history));
  }
}

/** Loads any existing saved progress for the current day. */
function loadState() {
  const saved = localStorage.getItem(getStateKey());
  if (saved) {
    const parsed = JSON.parse(saved);
    S = { ...S, ...parsed, day: getDayNum() };
  }
  const forced = localStorage.getItem('gambdle_forced_mod');
  if (forced) {
    S.forcedMod = forced;
    localStorage.removeItem('gambdle_forced_mod');
    saveState();
  }
}
