
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

/** 
 * ─── GAME CONFIG & SEEDING ───────────────────────────────────────────
 */
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
let DEV_OVERRIDE = urlParams.get('dev') === 'true' ? {} : null; // Set to {} if ?dev=true is in URL
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

/** 
 * ─── CARD UTILITIES ───────────────────────────────────────────
 * Basic definitions and value mapping for standard decks.
 */
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

// ─── ROULETTE ────────────────────────────────────────
const REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const rCls=n=>n===0?'rn-grn':REDS.has(n)?'rn-red':'rn-blk';
const rName=n=>n===0?'Green':REDS.has(n)?'Red':'Black';

// R_BETS: 0-36 = numbers, 37-39 = column 2:1, 40-42 = dozens, 43-48 = outside
const R_BETS=[
  ...Array.from({length:37},(_,n)=>({type:'num',val:n,lbl:`${n}`,pay:35})),
  {type:'col',val:2,lbl:'2:1',pay:2},  // 37 top row (3,6,...36)
  {type:'col',val:1,lbl:'2:1',pay:2},  // 38 mid row (2,5,...35)
  {type:'col',val:0,lbl:'2:1',pay:2},  // 39 bot row (1,4,...34)
  {type:'doz',val:0,lbl:'1-12',pay:2}, // 40
  {type:'doz',val:1,lbl:'13-24',pay:2},// 41
  {type:'doz',val:2,lbl:'25-36',pay:2},// 42
  {type:'hl',val:'low',lbl:'1-18',pay:1},    // 43
  {type:'oe',val:'even',lbl:'Even',pay:1},   // 44
  {type:'col2',val:'red',lbl:'Red',pay:1},   // 45
  {type:'col2',val:'black',lbl:'Black',pay:1},// 46
  {type:'oe',val:'odd',lbl:'Odd',pay:1},     // 47
  {type:'hl',val:'high',lbl:'19-36',pay:1},  // 48
];

// Group definitions: winning number set + which bet idx is locked out
const R_GROUP_INFO={
  '1_12':  {nums:new Set([1,2,3,4,5,6,7,8,9,10,11,12]),bannedIdx:40},
  '13_24': {nums:new Set([13,14,15,16,17,18,19,20,21,22,23,24]),bannedIdx:41},
  '25_36': {nums:new Set([25,26,27,28,29,30,31,32,33,34,35,36]),bannedIdx:42},
  '1_18':  {nums:new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]),bannedIdx:43},
  '19_36': {nums:new Set([19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]),bannedIdx:48},
};
// Returns the 1-36 numbers covered by a given R_BETS index.
function getRBetNums(i){
  if(i===0)return[];
  if(i<=36)return[i];
  return({
    37:[3,6,9,12,15,18,21,24,27,30,33,36],
    38:[2,5,8,11,14,17,20,23,26,29,32,35],
    39:[1,4,7,10,13,16,19,22,25,28,31,34],
    40:[1,2,3,4,5,6,7,8,9,10,11,12],
    41:[13,14,15,16,17,18,19,20,21,22,23,24],
    42:[25,26,27,28,29,30,31,32,33,34,35,36],
    43:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
    44:[2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36],
    45:[...REDS],
    46:Array.from({length:36},(_,n)=>n+1).filter(n=>!REDS.has(n)),
    47:[1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35],
    48:[19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],
  }[i]||[]);
}

// Returns true if R_BETS[idx] wins for the given spin result.
function evalBet(idx,result){
  const b=R_BETS[idx];
  if(b.type==='num') return result===b.val;
  if(result===0) return false;
  if(b.type==='col2') return b.val==='red'?REDS.has(result):!REDS.has(result);
  if(b.type==='oe') return b.val==='even'?result%2===0:result%2===1;
  if(b.type==='hl') return b.val==='low'?result<=18:result>=19;
  if(b.type==='doz'){if(b.val===0)return result>=1&&result<=12;if(b.val===1)return result>=13&&result<=24;return result>=25&&result<=36;}
  if(b.type==='col'){if(b.val===0)return result%3===1;if(b.val===1)return result%3===2;return result%3===0;}
  return false;
}

// Standard video poker hand evaluator (Jacks or Better threshold).
function rankPoker(cs){
  const rs=cs.map(c=>c.r),ss=cs.map(c=>c.s),vs=cs.map(c=>cVal(c.r));
  const rc={};for(const r of rs)rc[r]=(rc[r]||0)+1;
  const cts=Object.values(rc).sort((a,b)=>b-a);
  const flush=new Set(ss).size===1;
  const sv=[...vs].sort((a,b)=>a-b);
  const str8=(sv[4]-sv[0]===4&&new Set(sv).size===5)||sv.join(',')===`2,3,4,5,14`;
  if(flush&&str8)return sv[0]>=10?{n:'Royal Flush',p:800}:{n:'Straight Flush',p:50};
  if(cts[0]===4)return{n:'Four of a Kind',p:25};
  if(cts[0]===3&&cts[1]===2)return{n:'Full House',p:9};
  if(flush)return{n:'Flush',p:6};
  if(str8)return{n:'Straight',p:4};
  if(cts[0]===3)return{n:'Three of a Kind',p:3};
  if(cts[0]===2&&cts[1]===2)return{n:'Two Pair',p:2};
  if(cts[0]===2){const pr=Object.entries(rc).find(([,c])=>c===2)?.[0];if(['A','K','Q','J'].includes(pr))return{n:'Jacks or Better',p:1};}
  return{n:'High Card',p:0};
}

// UTH hand evaluation
function cardNum(r){return({'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14})[r];}

// Weighted hand scorer for UTH (cat * 1e12 + rank tiebreakers).
function handScore(cs){
  const ns=cs.map(c=>cardNum(c.r)),ss=cs.map(c=>c.s);
  const rc={};for(const n of ns)rc[n]=(rc[n]||0)+1;
  const grp=Object.entries(rc).map(([n,c])=>[+n,c]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const cts=grp.map(g=>g[1]);
  const flush=new Set(ss).size===1;
  const sv=[...ns].sort((a,b)=>a-b);
  const wheel=sv.join(',')===`2,3,4,5,14`;
  const str8=(sv[4]-sv[0]===4&&new Set(sv).size===5)||wheel;
  const sh=wheel?5:sv[4];
  let cat;
  if(flush&&str8&&sh===14)cat=9;
  else if(flush&&str8)cat=8;
  else if(cts[0]===4)cat=7;
  else if(cts[0]===3&&cts[1]===2)cat=6;
  else if(flush)cat=5;
  else if(str8)cat=4;
  else if(cts[0]===3)cat=3;
  else if(cts[0]===2&&cts[1]===2)cat=2;
  else if(cts[0]===2)cat=1;
  else cat=0;

  let ranks; // Priority order of ranks for tie-breaking
  if(cat>=8)ranks=[sh];
  else if(cat===7||cat===6)ranks=[grp[0][0],grp[1][0]];
  else if(cat===5)ranks=[...sv].reverse();
  else if(cat===4)ranks=[sh];
  else if(cat===3)ranks=[grp[0][0],...grp.slice(1).map(g=>g[0])];
  else if(cat===2)ranks=[grp[0][0],grp[1][0],grp[2]?.[0]||0];
  else ranks=[grp[0][0],...grp.slice(1).map(g=>g[0])];

  let score=cat*1e12;
  ranks.forEach((r,i)=>{score+=r*Math.pow(100,4-Math.min(i,4));});
  return{cat,score};
}

/** Brute-force checks all 21 possible 5-card combinations from a set of 7. */
function bestOf7(cards){
  let best=null,bs=-1,bc=0;
  for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){
    const five=cards.filter((_,k)=>k!==i&&k!==j);
    const{cat,score}=handScore(five);
    if(score>bs){bs=score;bc=cat;best=five;}
  }
  return{cards:best,score:bs,cat:bc,rank:rankPoker(best)};
}

function uthBlindDelta(cat,blind){
  let base=0;
  if(cat===9)base=blind*500;
  else if(cat===8)base=blind*50;
  else if(cat===7)base=blind*10;
  else if(cat===6)base=blind*3;
  else if(cat===5)base=Math.floor(blind*1.5);
  else if(cat===4)base=blind;
  else if(getMod('uth_blind_extended')&&cat===3)base=blind;
  else if(getMod('uth_blind_extended')&&cat===2)base=Math.floor(blind*0.5);
  const boost=getMod('uth_blind_boost')||1;
  return Math.floor(base*boost);
}

// Hardcoded test scenarios applied when the dev "Test Seed" checkbox is active.
const TEST_CARD_OVERRIDE = {
  bjShoe: [
    // Deal: P=[8s,8h] D=[6d,7c] (dealer 13, must draw)
    card('8','s'), card('8','h'), card('6','d'), card('7','c'),
    // Split 8s/8h → hand0=[8s,8d] (pair! re-split)
    card('8','d'),
    // Re-split 8s/8d → hand0=[8s,Jh]=18 (stand)  hand1=[8d] pending
    card('J','h'),
    // bjAdvanceSplit deals to hand1=[8d,8c] (pair! re-split)
    card('8','c'),
    // Re-split 8d/8c → hand1=[8d,7s]=15 (hit)  hand2=[8c] pending
    card('7','s'),
    // Hit hand1 → [8d,7s,4h]=19 (stand)
    card('4','h'),
    // bjAdvanceSplit deals to hand2=[8c,5d]=13 (hit)
    card('5','d'),
    // Hit hand2 → [8c,5d,6h]=19 (stand)
    card('6','h'),
    // bjAdvanceSplit deals to hand3=[8h,3c]=11 (double!)
    card('3','c'),
    // Double hand3 → [8h,3c,10s]=21
    card('10','s'),
    // Dealer hits 6+7: draws K → 23, bust. All hands win.
    card('K','d'),
  ],
  uthHands: [
    // Hand 0: Pocket aces, JJ on board → player two-pair (AA+JJ). Dealer qualifies with one pair.
    { hole:   [card('A','s'), card('A','c')],
      dealer: [card('2','d'), card('7','h')],
      comm:   [card('K','s'), card('Q','c'), card('J','s'), card('J','d'), card('8','h')] },
    // Hand 1: Junk hole (7-2) vs dealer who flops trip aces + kings full house → fold test.
    { hole:   [card('7','c'), card('2','c')],
      dealer: [card('A','h'), card('K','h')],
      comm:   [card('A','d'), card('K','d'), card('K','c'), card('Q','s'), card('J','h')] },
    // Hand 2: Suited connectors 9♦8♦ → straight flush 5-9 diamonds on board.
    { hole:   [card('9','d'), card('8','d')],
      dealer: [card('2','h'), card('5','c')],
      comm:   [card('7','d'), card('6','d'), card('5','d'), card('Q','h'), card('3','c')] },
  ],
  rSpin: 0,
};

// Pre-generates all cards and spin data for the daily run.
function genGame(){
  const rng=mkRng(getRngSeed());
  // Blackjack shoe is 2 standard decks (104 cards)
  const shoe=[];for(let i=0;i<2;i++)shoe.push(...buildDeck());
  let bjShoe=shuffle(shoe,rng);
  const pokerDecks=Array.from({length:3},()=>shuffle(buildDeck(),rng));
  let uthDeck=shuffle(buildDeck(),rng);
  let rSpinOverride=null;
  // Apply test card override when the dev Test Seed checkbox is active
  if(_testActive()){
    const ov=TEST_CARD_OVERRIDE;
    if(ov.bjShoe&&ov.bjShoe.length){const pool=[...bjShoe];for(const oc of ov.bjShoe){const i=pool.findIndex(c=>c.r===oc.r&&c.s===oc.s);if(i!==-1)pool.splice(i,1);}bjShoe=[...ov.bjShoe,...pool];}
    if(ov.uthHands&&ov.uthHands.length){const placed=new Map();const pool=[...uthDeck];for(let h=0;h<3;h++){const spec=ov.uthHands[h];if(!spec)continue;const off=h*9;const slots=[...(spec.hole||[]).slice(0,2),...(spec.dealer||[]).slice(0,2),...(spec.comm||[]).slice(0,5)];for(let i=0;i<slots.length;i++){if(!slots[i])continue;placed.set(off+i,slots[i]);const pi=pool.findIndex(c=>c.r===slots[i].r&&c.s===slots[i].s);if(pi!==-1)pool.splice(pi,1);}}const newDeck=[];let pi=0;for(let i=0;i<52;i++)newDeck.push(placed.has(i)?placed.get(i):pool[pi++]);uthDeck=newDeck;}
    if(ov.rSpin!=null)rSpinOverride=ov.rSpin;
  }
  if(ENABLE_CARD_SEEDING){
    const CARD_SEED_OVERRIDE = {
      bjShoe: [
        // Hand 1 — player: A-J  dealer: K-5
        card('A','s'), card('J','s'), card('K','d'), card('5','c'),
        // Hand 2 — player: J-A  dealer: 2-9
        card('J','s'), card('A','d'), card('2','d'), card('9','c'),
        // Hand 3 — player: 10-10 dealer: Q-2
        card('10','s'), card('10','h'), card('Q','d'), card('2','c'),
      ],
      // UTH hands: array of 3 entries (null = use random). Each entry: { hole, dealer, comm }
      // Layout per hand at offset h*9: [hole0,hole1, dealer0,dealer1, comm0..comm4]
      uthHands: [
        // Hand 1 — player royal flush draw: A-K suited, board completes it
        { hole:   [card('A','s'), card('K','s')],
          dealer: [card('2','h'), card('7','d')],
          comm:   [card('Q','s'), card('J','s'), card('10','s'), card('3','c'), card('6','d')] },
        null, // Hand 2 — random
        null, // Hand 3 — random
      ],
      rSpin: null, // 0–36, or null to use random
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

/** 
 * ─── GLOBAL STATE ───────────────────────────────────────────
 * Persistent state object for the current daily run.
 */
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
  // BJ
  bjHand:0, bjPhase:'bet', bjBet:0,
  bjPlayer:[], bjDealer:[], bjResult:null,
  bjHistory:[], bjIdx:0,
  bjSplit:false, bjSplitHands:[], bjSplitActive:0, bjSplitBets:[], bjSplitResults:[], bjSplitDone:[], bjDoubled:false, bjSplitDoubled:[],
  bjAnimFrom:0, bjDealerAnimFrom:0, bjSplitAnimFrom:[], bjResultAnimPlayer:false, bjDealerReveal:false, bjCelebrating:false,
  // Poker (5 Card)
  pkHand:0, pkPhase:'bet', pkBet:0,
  pkCards:[], pkHeld:new Set(), pkFinal:[], pkHistory:[], pkRevealStep:0,
  // UTH
  uthHand:0, uthPhase:'bet', uthAnte:0, uthPlay:0, uthPlayMult:0,
  uthRaised:false, uthFolded:false,
  uthHole:[], uthDealer:[], uthComm:[],
  uthRevealComm:0, uthPrevRevealComm:0, uthHistory:[],
  // Roulette
  rPhase:'bet', rBets:[], rBet:0, rPick:null, rResult:null, rSpin:null, rReSpun:false,
  forcedMod: null,
  peekUsed: false,
};

/** Writes the current run state to localStorage for persistence. */
function saveState() {
  localStorage.setItem(getStateKey(), JSON.stringify(S));
  if (S.screen === 'results' && !_testActive()) {
    const high = parseInt(localStorage.getItem('gambdle_highscore') || '0');
    if (S.chips > high) {
      localStorage.setItem('gambdle_highscore', S.chips.toString());
      let unlockMsg = null;
      if (S.chips >= 1500 && !getPref('orange_back_unlocked')) {
        setPref('orange_back_unlocked', true);
        unlockMsg = '🟠 Orange Card Back unlocked! Check Preferences.';
      }
      if (S.chips >= 2500 && !getPref('maroon_felt_unlocked')) {
        setPref('maroon_felt_unlocked', true);
        unlockMsg = '🎱 Maroon Felt unlocked! Check Preferences.';
      }
      if (S.chips >= 3500 && !getPref('deck_emoji_unlocked')) {
        setPref('deck_emoji_unlocked', true);
        unlockMsg = '🌱 Emoji Deck unlocked! Check Preferences.';
      }
      if (S.chips >= 5000 && !getPref('whale_back_unlocked')) {
        setPref('whale_back_unlocked', true);
        unlockMsg = '🐋 Whale Card Back unlocked! Check Preferences.';
      }
      if (S.chips >= 10000 && !getPref('golden_back_unlocked')) {
        setPref('golden_back_unlocked', true);
        unlockMsg = '🏆 Golden Card Back unlocked! Check Preferences.';
      }
      if (unlockMsg) setTimeout(()=>toast(unlockMsg), 1200);
    }
    
    // Store history
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
    // Merge saved state but ensure day-specific constants are current
    S = { ...S, ...parsed, day: getDayNum() };
  }

  // Check for a forced modifier AFTER loading saved state to ensure it's not overwritten
  const forced = localStorage.getItem('gambdle_forced_mod');
  if (forced) {
    S.forcedMod = forced;
    localStorage.removeItem('gambdle_forced_mod');
    saveState();
  }
}

/** ─── UI HELPERS ───────────────────────────────────────── */
const fmt=n=>n.toLocaleString();
const sign=n=>n>=0?'+'+fmt(n):fmt(n);
const col=n=>n>0?'#1fa845':n<0?'#e03535':'#cabd9a';

const SUIT_CLS={'♠':'suit-s','♥':'suit-h','♦':'suit-d','♣':'suit-c'};
/** Generates the HTML for a card, optionally animating its entrance. */
function cardHTML(c,sz='md',ex='',dl=0,anim=true){
  if(c==='back')return`<div class="card ${sz} back" style="${ex}"></div>`;
  const cl=(RED_S.has(c.s)?'red':'blk')+' '+(SUIT_CLS[c.s]||'suit-s');
  const ds=anim&&dl?`animation-delay:${dl}s`:'';
  return`<div class="card ${sz} ${cl}${anim?' adeal':''}" style="${ds}${ex?';'+ex:''}">
    <div class="ctl"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${c.s}</span></div>
    <div class="cbody"><span class="csuit">${c.s}</span></div>
    <div class="cbr"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${c.s}</span></div>
  </div>`;
}

/**
 * Common component for chip selection and betting actions.
 * @param {number} maxC - Maximum chips available to bet.
 * @param {number} curBet - Current bet amount.
 * @param {number[]} [denoms] - Custom chip denominations.
 * @returns {string} HTML string.
 */
function chipSel(maxC,curBet,denoms,extraBtn=''){
  const ds=(denoms||[10,25,50,100,250,500,1000]);
  const btns=ds.map(d=>`<button class="chbtn ch-${d}" data-v="${d}" onclick="addChip(${d})" ${curBet+d>maxC?'disabled':''}><span>${d}</span></button>`).join('');
  return`<div class="chip-row">${btns}</div>
  <div class="bet-row">
    <div class="bet-amt">
      <span style="font-size:.68rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.15em">Bet</span>
      <span id="bv" style="font-family:var(--btn-f);font-size:2.2rem;font-weight:700;color:var(--ink)">${fmt(curBet)}</span>
    </div>
    ${extraBtn}
    <button class="ch-clear" onclick="clearBet()">✕ Clear</button>
    <button id="ai" class="ch-allin" onclick="allIn()" ${maxC===0?'disabled':''}>All In</button>
  </div>`;
}

/**
 * Shared progress indicator for all games.
 * won = green, lost = red, current = gold pulse, pending = dim.
 */
function gameDots(history, hand, phase, count = 3){
  const isR = count <= 2;
  return`<div class="dots-row">${Array.from({length:count},(_,i)=>{
    const h=history[i];
    const label = isR ? (i === 0 ? 'Last Spin' : 'Final Results') : `Hand ${i+1}`;
    if(h && !h.skipped){const d=h.delta;return`<div class="hdot ${d>0?'won':d<0?'lost':'push'}">${label}<span class="dot-detail"> ${sign(d)}</span></div>`;}
    const isCur=i===hand;
    const cls=isCur?'cur':i<hand?'push':'pend';
    let txt = label;
    if(isCur && phase==='result') txt += `<span class="dot-detail"> · Next</span>`;
    else if(isCur && phase==='bet') txt += `<span class="dot-detail"> · Place bet</span>`;
    else if(isCur) txt += `<span class="dot-detail"> · Playing</span>`;
    return`<div class="hdot ${cls}">${txt}</div>`;
  }).join('')}</div>`;
}

function hdr(sub){
  let titleText = 'Gambdle';
  if (sub) {
    const parts = sub.split(' · ');
    const main = parts[0];
    const detail = parts.length > 1 ? `<span class="tb-detail"> · ${parts[1]}</span>` : '';
    titleText = `Gambdle — ${main}${detail}`;
  }
  return`<div class="title-bar">
    <span class="tb-title"><span class="tb-icon">♠</span>${titleText}</span>
    <span class="tb-btns">
      <span class="tb-btn" title="Min">_</span>
      <span class="tb-btn" title="Max">□</span>
      <span class="tb-btn close" title="Close">×</span>
    </span>
  </div>
  <div class="menu-bar">
    <span class="mb-item" onclick="toggleMenu('file',this);event.stopPropagation()"><u>F</u>ile</span>
    <span class="mb-item" onclick="toggleMenu('help',this);event.stopPropagation()"><u>H</u>elp</span>
    ${DEV_OVERRIDE ? `<span class="mb-item" style="color:var(--gold)" onclick="toggleMenu('dev',this);event.stopPropagation()"><u>D</u>eveloper</span>` : ''}
    <span class="mb-right"><span id="chip-badge" class="chip-badge">💵 ${fmt(S.chips)}</span></span>
  </div>
  <div id="hdr-sub" style="display:none">${sub||''}</div>`;
}

function modBannerHTML(){
  const modTitle = getMod('title');
  const modDesc = getMod('desc');
  if (!modTitle) return '';
  return `<div class="mod-banner">
    <div class="mod-banner-l">
      <div class="mod-banner-label">TODAY'S MODIFIER</div>
      <div class="mod-banner-title">✨ ${modTitle}</div>
    </div>
    <div class="mod-banner-r">${modDesc||''}</div>
  </div>`;
}

/** ─── ROULETTE BOARD ─── */
function rBoard(){
  const fg=getMod('r_force_group');
  const grp=fg?R_GROUP_INFO[fg]:null;
  const bannedIdx=grp?grp.bannedIdx:-1;
  const sel=i=>S.rPick===i&&i!==bannedIdx?'r-sel':'';
  const groupCls=i=>{
    if(!grp)return'';
    if(i===bannedIdx)return'r-group-banned';
    const covered=getRBetNums(i);
    if(!covered.length)return'r-group-lose';
    const wins=covered.filter(n=>grp.nums.has(n)).length;
    if(wins===0)return'r-group-lose';
    if(wins===covered.length)return'r-group-win';
    return'r-group-partial';
  };
  const placedTotals=S.rBets.reduce((m,b)=>{m.set(b.pick,(m.get(b.pick)||0)+b.bet);return m;},new Map());
  const chipLbl=amt=>amt>=1000?Math.floor(amt/1000)+'K':String(amt);
  const chip=i=>{
    if(placedTotals.has(i))return`<span class="r-chip r-chip-placed">${chipLbl(placedTotals.get(i))}</span>`;
    return'';
  };
  const rMod=getMod('r_payout_mult')?'all':getMod('r_number_pay')?'nums':getMod('r_zero_boost')?'zero':getMod('r_color_double')?'color':null;
  const boost=i=>{
    if(!rMod)return'';
    if(rMod==='all')return'r-boost';
    if(rMod==='nums'&&i<=36)return'r-boost';
    if(rMod==='zero'&&i===0)return'r-boost-fire';
    if(rMod==='color'&&(i===45||i===46))return'r-boost';
    return'';
  };
  const boostLabel=i=>{
    if(!rMod)return'';
    if(rMod==='zero'&&i===0)return'🔥';
    if(rMod==='color'&&(i===45||i===46))return'2:1';
    return'';
  };
  const lbl=i=>{const t=boostLabel(i);return t?`<span class="r-pay-lbl">${t}</span>`:''};
  const numBtns=Array.from({length:37},(_,n)=>{
    const gc=n===0?'1':String(Math.floor((n-1)/3)+2);
    const gr=n===0?'1/4':String(n%3===0?1:n%3===2?2:3);
    const gh=groupCls(n);
    return`<button class="rn ${rCls(n)} ${sel(n)} ${boost(n)} ${gh}" data-idx="${n}" style="grid-column:${gc};grid-row:${gr}" onclick="pickBet(${n})">${n}${lbl(n)}${chip(n)}</button>`;
  }).join('');
  const col2to1=[0,1,2].map(r=>{
    const idx=37+r;const gh=groupCls(idx);
    return`<button class="r2to1 ${sel(idx)} ${boost(idx)} ${gh}" data-idx="${idx}" style="grid-column:14;grid-row:${r+1}" onclick="pickBet(${idx})" ${gh==='r-group-banned'?'disabled':''}>2:1${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  const dozBtns=[[40,'2/6'],[41,'6/10'],[42,'10/14']].map(([idx,gc])=>{
    const gh=groupCls(idx);
    return`<button class="rout ${sel(idx)} ${boost(idx)} ${gh}" data-idx="${idx}" style="grid-column:${gc}" onclick="pickBet(${idx})" ${gh==='r-group-banned'?'disabled':''}>${R_BETS[idx].lbl}${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  const outData=[[43,'2/4',''],[44,'4/6',''],[45,'6/8','rout-r'],[46,'8/10','rout-b'],[47,'10/12',''],[48,'12/14','']];
  const outBtns=outData.map(([idx,gc,ex])=>{
    const gh=groupCls(idx);
    return`<button class="rout ${ex} ${sel(idx)} ${boost(idx)} ${gh}" data-idx="${idx}" style="grid-column:${gc}" onclick="pickBet(${idx})" ${gh==='r-group-banned'?'disabled':''}>${R_BETS[idx].lbl}${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  return`<div class="rboard">${numBtns}${col2to1}</div>
    <div class="rboard-sub">${dozBtns}</div>
    <div class="rboard-sub">${outBtns}</div>`;
}

/** ─── AUDIO SYSTEM ─── */
function playMp3(src,ms=0){if(getPref('mute'))return;if(ms){setTimeout(()=>playMp3(src),ms);return;}new Audio(src).play().catch(()=>{});}
function sndCard(ms=0){playMp3(`sounds/card${Math.ceil(Math.random()*3)}.mp3`,ms);}
function sndChip(d){playMp3(d==='allin'?'sounds/allin.mp3':d<=25?'sounds/smallbet.mp3':'sounds/mediumbet.mp3');}
function sndShuffle(cb){
  if(getPref('mute')){if(cb)setTimeout(cb,0);return;}
  const a=new Audio('sounds/shuffle.mp3');
  if(cb){
    let done=false;
    const once=()=>{if(!done){done=true;cb();}};
    a.onended=once;a.onerror=once;
    a.play().catch(()=>setTimeout(once,800));
  }else{
    a.play().catch(()=>{});
  }
}
function sndBigWin(){playMp3('sounds/bigwin.mp3');}

let _ac=null;
function getAC(){if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();return _ac;}

/** Synthesized sound for the Roulette ball rattle. */
function sndSpin(dur){
  if(getPref('mute'))return;
  try{
    const c=getAC(),t0=c.currentTime+0.05;
    let t=t0;
    // Generate a sequence of "clicks" that slow down over time to simulate a spinning ball
    while(t<t0+dur){
      const prog=(t-t0)/dur;
      const eased=1-Math.pow(1-prog,3);
      const interval=0.038+eased*0.52;
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g);g.connect(c.destination);
      o.type='sine';
      o.frequency.setValueAtTime(380+Math.random()*180,t);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.055,t+0.004);g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
      o.start(t);o.stop(t+0.05);
      t+=interval;
    }
    // Final thud sound when the ball settles into a pocket
    const o2=c.createOscillator(),g2=c.createGain();
    o2.connect(g2);g2.connect(c.destination);
    o2.type='sine';
    o2.frequency.setValueAtTime(180,t0+dur);o2.frequency.exponentialRampToValueAtTime(60,t0+dur+0.25);
    g2.gain.setValueAtTime(0.32,t0+dur);g2.gain.exponentialRampToValueAtTime(0.001,t0+dur+0.3);
    o2.start(t0+dur);o2.stop(t0+dur+0.35);
  }catch(e){}
}

/** 
 * ─── ROULETTE WHEEL CANVAS ──────────────────────────────────
 * Standard European wheel layout (0-36).
 */
const WO=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

function drawWheel(cnv,wAngle,bAngle,bR){
  const ctx=cnv.getContext('2d');
  const W=cnv.width,H=cnv.height,cx=W/2,cy=H/2;
  const R=Math.min(W,H)/2-6;
  const N=37,seg=2*Math.PI/N;
  ctx.clearRect(0,0,W,H);

  // outer rim — game gold palette
  const rimG=ctx.createRadialGradient(cx,cy,R-4,cx,cy,R+8);
  rimG.addColorStop(0,'#7a5a18');rimG.addColorStop(0.45,'#c4933a');rimG.addColorStop(1,'#3d2c0a');
  ctx.beginPath();ctx.arc(cx,cy,R+7,0,2*Math.PI);ctx.fillStyle=rimG;ctx.fill();
  // inner rim highlight ring
  ctx.beginPath();ctx.arc(cx,cy,R+1,0,2*Math.PI);ctx.strokeStyle='rgba(223,185,94,.45)';ctx.lineWidth=1.5;ctx.stroke();

  // pocket segments
  for(let i=0;i<N;i++){
    const n=WO[i],a0=wAngle+i*seg,a1=a0+seg;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a0,a1);ctx.closePath();
    ctx.fillStyle=n===0?'#1d6e4d':REDS.has(n)?'#b91c1c':'#1a1814';
    ctx.fill();
    ctx.strokeStyle='rgba(196,147,58,.6)';ctx.lineWidth=0.8;ctx.stroke();
    // number label
    const mA=wAngle+(i+0.5)*seg,nr=R*0.83;
    ctx.save();
    ctx.translate(cx+nr*Math.cos(mA),cy+nr*Math.sin(mA));
    ctx.rotate(mA+Math.PI/2);
    ctx.fillStyle='#fbf5dc';ctx.font=`700 ${Math.max(7,Math.floor(R*0.120))}px "VT323", "Courier New", monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(n),0,0);
    ctx.restore();
  }

  // spokes
  for(let i=0;i<8;i++){
    const a=wAngle+i*Math.PI/4;
    ctx.beginPath();
    ctx.moveTo(cx+R*0.22*Math.cos(a),cy+R*0.22*Math.sin(a));
    ctx.lineTo(cx+R*0.9*Math.cos(a),cy+R*0.9*Math.sin(a));
    ctx.strokeStyle='rgba(196,147,58,.32)';ctx.lineWidth=2;ctx.stroke();
  }

  // inner hub ring — ink base, gold border
  ctx.beginPath();ctx.arc(cx,cy,R*0.22,0,2*Math.PI);ctx.fillStyle='#1a1814';ctx.fill();
  ctx.strokeStyle='#c4933a';ctx.lineWidth=3;ctx.stroke();
  // hub center dot
  ctx.beginPath();ctx.arc(cx,cy,R*0.1,0,2*Math.PI);ctx.fillStyle='#0e0d0b';ctx.fill();
  ctx.strokeStyle='#dfb95e';ctx.lineWidth=2;ctx.stroke();

  // ball shadow
  const bx=cx+bR*Math.cos(bAngle),by=cy+bR*Math.sin(bAngle);
  ctx.beginPath();ctx.arc(bx+1.5,by+2.5,8,0,2*Math.PI);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fill();
  // ball — cream tinted
  const bg=ctx.createRadialGradient(bx-3,by-3,1,bx,by,8);
  bg.addColorStop(0,'#fefaf0');bg.addColorStop(0.6,'#dfd5b0');bg.addColorStop(1,'#b8a878');
  ctx.beginPath();ctx.arc(bx,by,8,0,2*Math.PI);ctx.fillStyle=bg;ctx.fill();
  ctx.strokeStyle='#7a5a18';ctx.lineWidth=1;ctx.stroke();
}

/** Animates the wheel and ball until they reach the daily result. */
function startWheelAnim(){
  const cnv=document.getElementById('rwheel');
  if(!cnv)return;
  const size=Math.min(320,Math.floor((cnv.parentElement?.clientWidth||360)-24));
  cnv.width=size;cnv.height=size;

  const N=37,seg=2*Math.PI/N;
  const tidx=WO.indexOf(S.rSpin);

  // wheel spins CW (angle increases). We want winning pocket at top (-PI/2).
  // Pocket i center: wAngle + (i+0.5)*seg = -PI/2 + 2PIk
  const rawFinal=-Math.PI/2-(tidx+0.5)*seg;
  const numSpins=7;
  const wFinal=rawFinal+Math.ceil(-rawFinal/(2*Math.PI))*2*Math.PI+numSpins*2*Math.PI;

  // ball spins CCW (angle decreases), ends at top
  const bFinalA=-Math.PI/2;
  const bRevs=11;
  const bStartA=bFinalA+bRevs*2*Math.PI;
  const R=size/2-6;
  const bRi=R*0.91,bRf=R*0.68;

  const DUR=4600,t0=performance.now();
  function ease(t){return 1-Math.pow(1-t,4);}

  function frame(now){
    const t=Math.min((now-t0)/DUR,1),e=ease(t);
    drawWheel(cnv,wFinal*e,bStartA-(bStartA-bFinalA)*e,bRi+(bRf-bRi)*e);
    if(t<1)requestAnimationFrame(frame);
    else setTimeout(rFinish,900);
  }
  requestAnimationFrame(frame);
}

/** 
 * ─── SCREEN RENDERING ─────────────────────────────────────────
 * Individual render functions for each game phase.
 */
function screenIntro(){
  return `${hdr('New Game')}
  <div class="panel">
    <div style="text-align:center;padding:14px 4px 6px">
      <div class="logo"><span class="logo-spade">♠</span>GAMBDLE</div>
      <div class="logo-sub">Daily Game #${S.day}</div>
    </div>
    <div class="divider"></div>
    <div style="text-align:center;padding:4px 4px">
      <div style="font-size:1.8rem;color:var(--cream)">You start with <b style="color:var(--gold-hi)">${fmt(START)} chips</b>.</div>
      <div style="font-size:1.4rem;color:var(--cream);opacity:0.7;margin-top:4px">Your final stack is your leaderboard score.</div>
    </div>
    <button class="btn-gold btn-lg" style="margin: 10px 0" onclick="startGame()">► Start new game<span class="btn-detail"> — $${fmt(START)}</span></button>
    <div class="divider"></div>
    <div style="font-size:1.4rem;color:var(--cream);opacity:0.7;letter-spacing:0.16em;text-transform:uppercase;margin:2px 2px 4px">Today's program:</div>
    ${renderIntroGameRows()}
  </div>`;
}

function renderIntroGameRows() {
  const games = [
    ['🃏', 'Blackjack',                '3 hands · Hit, Stand, Double, Split'],
    GAME2 === 'uth'
      ? ['♠', "Ultimate Hold'em",      '3 hands · Ante, Blind & Play']
      : ['♠', '5 Card Poker',          '3 hands · Jacks or Better'],
    ['🎡', 'Roulette',                 'One spin · Anything is possible'],
  ];
  const rows = games.map((g, i) => `
    <div class="gm-row">
      <span class="rnd-ic">${g[0]}</span>
      <div>
        <div class="rnd-nm">${i+1}. ${g[1]}</div>
        <div class="rnd-dc">${g[2]}</div>
      </div>
    </div>`).join('<div class="gm-sep"></div>');
  return `<div class="game-manifest">${rows}</div>`;
}

function bjDealerHTML(){
  const dv=hVal(S.bjDealer);
  const valHTML = S.bjDealerReveal
    ? `<div class="hand-val ${dv>21?'bust':''}">${hValDisplay(S.bjDealer)}${dv>21?' BUST':''}</div>`
    : `<div class="hand-val" style="visibility:hidden">&nbsp;</div>`;
  return S.bjDealerReveal
    ?`<div class="sec">Dealer${dv>21?' · BUST':''}</div>
      <div class="hand">${S.bjDealer.map((c,i)=>{const n=i>=S.bjDealerAnimFrom;return cardHTML(c,'lg','',n?(i-S.bjDealerAnimFrom)*0.85+0.1:0,n);}).join('')}</div>
      ${valHTML}`
    :`<div class="sec">Dealer Shows${getMod('peek')&&S.peekUsed?' · <span style="color:var(--gold-hi);font-size:.7rem">👁 Peeked</span>':''}</div>
      <div class="hand">${cardHTML(S.bjDealer[0],'lg','',S.bjDealerAnimFrom<=0?0.9:0,S.bjDealerAnimFrom<=0)} ${getMod('peek')&&S.peekUsed?cardHTML(S.bjDealer[1],'lg','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','lg')}</div>
      ${valHTML}`;
}
function bjActionBtns(bust,done21,can2,canSplit){
  return`<div class="divider"></div>
  <div class="act-btns">
    <button class="act-btn" onclick="bjHit()" ${bust||done21||S.bjDealerReveal?'disabled':''}>Hit</button>
    <button class="act-btn" onclick="bjStand()" ${done21||S.bjDealerReveal?'disabled':''}>Stand</button>
    <button class="act-btn" onclick="bjDouble()" ${!can2||bust||done21||S.bjDealerReveal?'disabled':''}>Double</button>
    <button class="act-btn" onclick="bjSplit()" ${!canSplit||done21||S.bjDealerReveal?'disabled':''}>Split</button>
  </div>`;
}
function peekBtnHTML(){
  if(!getMod('peek')||S.peekUsed) return '';
  return `<div id="peek-btn-wrap" style="text-align:center;margin-top:8px"><button onclick="doPeek()" style="background:rgba(196,147,58,.12);border:1.5px solid rgba(196,147,58,.5);color:var(--gold-hi);padding:6px 18px;border-radius:8px;font-size:.8rem;font-weight:700;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;line-height:1.3">🔍 Peek<span style="display:block;font-size:.65rem;font-weight:400;opacity:.7;letter-spacing:.04em">1 remaining today</span></button></div>`;
}
function doPeek(){
  S.peekUsed=true;
  saveState();
  const btn=document.getElementById('peek-btn-wrap');
  if(btn) btn.style.display='none';
  const glow='box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px';
  if(S.screen==='bj'){
    const sec=document.getElementById('bj-dealer-section');
    if(sec){
      const lbl=sec.querySelector('.sec');
      if(lbl) lbl.innerHTML='Dealer Shows · <span style="color:var(--gold-hi);font-size:.7rem">👁 Peeked</span>';
      const hand=sec.querySelector('.hand');
      if(hand&&hand.children.length>=2){
        const old=hand.children[1];
        old.insertAdjacentHTML('afterend',cardHTML(S.bjDealer[1],'lg',glow,0.1,true));
        old.remove();
        sndCard(100);
      }
      return;
    }
  } else {
    const lbl=document.getElementById('uth-dealer-sec');
    const hand=document.getElementById('uth-dealer-hand');
    if(lbl&&hand&&hand.children.length>=1){
      lbl.innerHTML='Dealer · <span style="color:var(--gold-hi);font-size:.7rem">👁 Peeked</span>';
      const old=hand.children[0];
      old.insertAdjacentHTML('beforebegin',cardHTML(S.uthDealer[0],'md',glow,0.1,true));
      old.remove();
      sndCard(100);
      return;
    }
  }
  _noAnim=true;render();
}
function screenBJ(){
  const ph=S.bjPhase;
  if(ph==='bet'){
    const aios=getMod('all_in_or_skip');
    return`${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
    <div class="panel">
      ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
      <div class="divider"></div>
      ${aios
        ?`<div class="sec">All In or Skip · Wins Pay 2×</div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn-gold" style="flex:2" onclick="allIn();bjDeal()">All In (${fmt(S.chips)}) →</button>
            <button class="ch-clear" style="flex:1;padding:17px" onclick="bjSkip()">Skip Hand</button>
          </div>`
        :`<div class="sec">Place Your Bet</div>
          ${chipSel(S.chips,S.bjBet)}
          <button id="db" class="btn-gold" style="margin-top:12px" onclick="bjDeal()" ${S.bjBet===0?'disabled':''}>Deal →</button>`}
    </div>`;
  }
  if(ph==='play'){
    if(S.bjSplit){
      const ai=S.bjSplitActive;
      const activeHand=S.bjSplitHands[ai];
      const pv=hVal(activeHand),bust=pv>21,done21=pv===21,pvStr=hValDisplay(activeHand);
      const isInitial=activeHand.length===2;
      const can2=S.chips>=S.bjSplitBets[ai]&&isInitial;
      const canResplit=isInitial&&activeHand[0].r===activeHand[1].r&&S.chips>=S.bjSplitBets[ai]&&S.bjSplitHands.length<4;
      const af=S.bjSplitAnimFrom[ai]??0;
      return `${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
<div class="panel" style="display:flex;flex-direction:column">
        ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
        <div class="divider"></div>
        <div id="bj-dealer-section" style="text-align:center;margin-bottom:12px">${bjDealerHTML()}</div>
        ${peekBtnHTML()}
        <div class="divider"></div>
        ${S.bjSplitHands.length>1?`<div class="bj-split-aside">
          ${S.bjSplitHands.map((hand,i)=>{if(i===ai)return'';const hv=hVal(hand);const isDone=S.bjSplitDone[i];return`<div style="text-align:center;opacity:${isDone?0.55:0.8}">
            <div class="sec bj-split-lbl">${isDone?'Hand '+(i+1)+' ✓':'Hand '+(i+1)}</div>
            <div class="hand hand-fan" style="justify-content:center">${hand.map(c=>cardHTML(c,'sm','',0,false)).join('')}</div>
            <div class="bj-split-val" style="color:${hv>21?'var(--lose)':'var(--shadow)'}">${hv}${hv>21?' Bust':''}</div>
          </div>`;}).join('')}
        </div>`:''}
        <div style="text-align:center;flex:1;">
          <div class="sec">Hand ${ai+1} of ${S.bjSplitHands.length}</div>
          <div id="bj-active-hand" class="hand">${activeHand.map((c,i)=>{const n=i>=af;return cardHTML(c,'lg','',n?(i-af)*0.4+0.1:0,n);}).join('')}</div>
          ${S.bjCelebrating||done21
            ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}"><div style="font-family:var(--btn-f);font-size:2.8rem;color:var(--gold-hi);letter-spacing:.04em;margin-top:14px;text-shadow:0 0 28px rgba(196,147,58,.55)">Blackjack!</div></div>`
            :`<div id="bj-active-val" class="hand-val ${bust?'bust':done21?'bj':''}">${pvStr}${bust?' BUST':done21?' 21!':''}</div>`}
        </div>
        <div style="margin-top:auto;">
          ${(S.bjCelebrating||done21)?'':bjActionBtns(bust,done21,can2,canResplit)}
          <div class="irow" style="margin-top:10px"><span class="ik">Hand ${ai+1} Bet</span><span class="iv">${fmt(S.bjSplitBets[ai])} chips</span></div>
        </div>
</div>`;
    }
    const pv=hVal(S.bjPlayer),bust=pv>21,done21=pv===21,pvStr=hValDisplay(S.bjPlayer);
    const isInitial=S.bjPlayer.length===2;
    const can2=S.chips>=S.bjBet&&isInitial;
    const canSplit=isInitial&&S.bjPlayer[0].r===S.bjPlayer[1].r&&S.chips>0;
    return `${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
<div class="panel" style="display:flex;flex-direction:column">
  ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
  <div class="divider"></div>
  <div id="bj-dealer-section" style="text-align:center;margin-bottom:12px">${bjDealerHTML()}</div>
  ${peekBtnHTML()}
  <div class="divider"></div>
  <div style="text-align:center;flex:1;">
    <div class="sec">Your Hand</div>
    <div id="bj-player-hand" class="hand">${S.bjPlayer.map((c,i)=>{const n=i>=S.bjAnimFrom;return cardHTML(c,'lg','',n?(i-S.bjAnimFrom)*0.4+0.1:0,n);}).join('')}</div>
    ${(S.bjCelebrating||done21)
      ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}">
          <div style="font-family:var(--btn-f);font-size:2.8rem;color:var(--gold-hi);letter-spacing:.04em;margin-top:14px;text-shadow:0 0 28px rgba(196,147,58,.55)">Blackjack!</div>
          ${isBJ(S.bjPlayer)?`<div style="font-size:.72rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.22em;margin-top:6px">Pays 3 · 2</div>`:''}
        </div>`
      :`<div id="bj-player-val" class="hand-val ${bust?'bust':done21?'bj':''}">${pvStr}${bust?' BUST':done21?' 21!':''}</div>`}
  </div>
  <div style="margin-top:auto;">
    ${(S.bjCelebrating||done21)?'':bjActionBtns(bust,done21,can2,canSplit)}
    <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${fmt(S.bjBet)} chips</span></div>
  </div>
</div>`;
  }
  // result
  const res=S.bjResult, isLast=S.bjHand>=3;
  const isBusted=S.chips<10;
  const btnText=isBusted?'Game Over 💀':(isLast?`Round 2: ${GAME2==='uth'?"Texas Hold'em":'5 Card Poker'} →`:'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?`advanceTo('poker')`:'bjNext()');

  if(S.bjSplit){
    const dv=hVal(S.bjDealer);
    const RES_LBL2={win:'Win!',push:'Push',bust:'Bust',lose:'Lose'};
    const splitNet=S.bjSplitResults.reduce((a,r)=>a+r.delta,0);
    return `${hdr('Blackjack · Split Result')}
    <div class="panel" style="text-align:center">
      ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
      <div class="divider"></div>
      <div style="font-family:var(--btn-f);font-size:3rem;color:${col(splitNet)};margin-bottom:4px;text-shadow:2px 2px 0 rgba(0,0,0,0.4)">${splitNet>0?'You Win!':splitNet<0?'You Lose!':'Push'}</div>
      <div style="font-family:var(--btn-f);font-size:2rem;color:${col(splitNet)};margin-bottom:14px">${sign(splitNet)} chips</div>
      <div style="margin-bottom:20px">
        <div class="sec">Dealer</div>
        <div class="hand" style="justify-content:center">${S.bjDealer.map((c,i)=>{const n=i>=S.bjDealerAnimFrom;return cardHTML(c,'sm','',n?(i-S.bjDealerAnimFrom)*0.75+0.15:0,n);}).join('')}</div>
        <div class="hand-val ${dv>21?'bust':''}" style="font-size:1.6rem">${dv}${dv>21?' BUST':''}</div>
      </div>
      <div class="divider"></div>
      <div style="display:flex;flex-wrap:${S.bjSplitHands.length===4?'wrap':'nowrap'};justify-content:space-evenly;gap:8px;margin-bottom:14px">
        ${S.bjSplitHands.map((hand,i)=>{const r=S.bjSplitResults[i];const hv=hVal(hand);return`<div style="text-align:center;${S.bjSplitHands.length===4?'flex:0 0 calc(50% - 8px);min-width:0':'flex:1'}">
          <div class="sec" style="font-size:.85rem">Hand ${i+1}: <span style="color:${col(r.delta)}">${RES_LBL2[r.result]||r.result}</span></div>
          <div style="font-size:1rem;color:${col(r.delta)};margin-bottom:4px">${sign(r.delta)}</div>
          <div class="hand hand-fan" style="justify-content:center">${hand.map(c=>cardHTML(c,'sm','',0,false)).join('')}</div>
          <div class="hand-val ${hv>21?'bust':''}" style="font-size:1.4rem">${hv}${hv>21?' BUST':''}</div>
        </div>`;}).join('')}
      </div>
      <div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
      <button class="btn-gold" style="margin-top:12px" onclick="${btnAction}">${btnText}</button>
    </div>`;
  }
  const dv=hVal(S.bjDealer), pv=hVal(S.bjPlayer);
  const bjMult = getMod('bj_payout') || 1.5;
  const RES_LBL={win:'You Win!',blackjack:'Blackjack! 🂡',push:'Push',bust:'You Bust!',lose:'You Lose!'};
  // If player cards animate (BJ skip), stagger them first; dealer reveal waits for them to finish
  const pAnimN=S.bjResultAnimPlayer?S.bjPlayer.length:0;
  const dOff=pAnimN>0?(pAnimN-1)*0.4+0.85:0;
  return `${hdr('Blackjack · Result')}
  <div class="panel" style="text-align:center">
    ${gameDots(S.bjHistory, S.bjHand, S.bjPhase)}
    <div class="divider"></div>
    <div style="font-family:var(--btn-f);font-size:3rem;color:${col(res.delta)};margin-bottom:4px;text-shadow:2px 2px 0 rgba(0,0,0,0.4)">${res.result === 'blackjack' && bjMult === 2 ? 'Mega Blackjack! 💎' : RES_LBL[res.result]}</div>
    <div style="font-family:var(--btn-f);font-size:2rem;color:${col(res.delta)};margin-bottom:14px">${sign(res.delta)} chips</div>
    <div style="display:flex;flex-direction:column;gap:16px;align-items:center;margin-bottom:14px">
      ${renderBJResultDealer(dv, dOff)}
      <div style="width:60%;height:1px;background:rgba(196,147,58,0.1)"></div>
      ${renderBJResultPlayer(pv, res.result)}
    </div>
    <div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
    <button class="btn-gold" style="margin-top:12px" onclick="${btnAction}">${btnText}</button>
  </div>`;
}

function renderBJResultDealer(dv, dOff) {
  return `<div style="text-align:center">
        <div class="sec">Dealer</div>
        <div class="hand">${S.bjDealer.map((c, i) => {
          const n = i >= S.bjDealerAnimFrom;
          return cardHTML(c, 'sm', '', n ? dOff + (i - S.bjDealerAnimFrom) * 0.75 + 0.05 : 0, n);
        }).join('')}</div>
        <div class="hand-val ${dv > 21 ? 'bust' : ''}" style="font-size:1.6rem">${dv}${dv > 21 ? ' BUST' : ''}</div>
      </div>`;
}

function renderBJResultPlayer(pv, result) {
  return `<div style="text-align:center">
        <div class="sec">You</div>
        <div class="hand">${S.bjPlayer.map((c, i) => {
          const n = S.bjResultAnimPlayer;
          return cardHTML(c, 'sm', '', n ? i * 0.4 + 0.1 : 0, n);
        }).join('')}</div>
        <div class="hand-val ${pv > 21 ? 'bust' : result === 'blackjack' ? 'bj' : ''}" style="font-size:1.6rem">${pv}${pv > 21 ? ' BUST' : result === 'blackjack' ? ' BJ!' : ''}</div>
      </div>`;
}

function screenPoker(){
  const ph=S.pkPhase;
  if(ph==='bet'){
    return `${hdr('5 Card Poker · Hand '+(S.pkHand+1)+' of 3')}
    <div class="panel">
      ${gameDots(S.pkHistory,S.pkHand,S.pkPhase)}
      <div class="divider"></div>
      <div class="sec">Place Your Bet</div>
      ${chipSel(S.chips,S.pkBet)}
      <button id="db" class="btn-gold" style="margin-top:12px" onclick="pkDeal()" ${S.pkBet===0?'disabled':''}>Deal →</button>
      <div class="divider"></div>
      <div class="sec">Paytable</div>
      <div class="ptable">${[['Royal Flush','800x'],['Straight Flush','50x'],['Four of a Kind','25x'],['Full House','9x'],['Flush','6x'],['Straight','4x'],['Three of a Kind','3x'],['Two Pair','2x'],['Jacks or Better','1x']].map(([n,p])=>`<span class="pname">${n}</span><span class="ppay">${p}</span>`).join('')}</div>
    </div>`;
  }
  if(ph==='hold'){
    const held=S.pkHeld;
    return `${hdr('5 Card Poker · Hand '+(S.pkHand+1)+' of 3')}
    <div class="panel">
      <div class="pk-hold-status" style="text-align:center;font-size:.82rem;color:var(--shadow);margin-bottom:10px">Tap cards to hold · ${held.size} held · ${5-held.size} replaced</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px">
        ${S.pkCards.map((c,i)=>{const h=held.has(i);return`<div id="pk-hw-${i}" class="hold-wrap" onclick="toggleHold(${i})">
          ${cardHTML(c,'md',`transition:transform .2s,box-shadow .2s;transform:${h?'translateY(-10px)':'translateY(0)'};box-shadow:${h?'0 8px 20px rgba(196,147,58,.5),0 0 0 2px var(--gold)':'2px 3px 10px rgba(0,0,0,.5),0 0 0 2px rgba(196,48,48,.65)'}`,0.04+i*0.06)}
          <div class="hold-tag" style="${h?'':'color:var(--red)'}">${h?'HOLD':'REPLACE'}</div></div>`;}).join('')}
      </div>
      <button class="btn-gold" onclick="pkDraw()">Draw Cards →</button>
      <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${fmt(S.pkBet)} chips</span></div>
    </div>`;
  }
  if(ph==='draw'){
    const replaceIdxs=[0,1,2,3,4].filter(i=>!S.pkHeld.has(i));
    const newestPos=S.pkRevealStep-1;
    return `${hdr('5 Card Poker · Hand '+(S.pkHand+1)+' of 3')}
    <div class="panel">
      <div style="text-align:center;font-size:.82rem;color:var(--shadow);margin-bottom:10px">Drawing replacements…</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px">
        ${[0,1,2,3,4].map(i=>{
          const h=S.pkHeld.has(i);
          const rPos=replaceIdxs.indexOf(i);
          const revealed=rPos!==-1&&rPos<S.pkRevealStep;
          const isNewest=rPos===newestPos;
          if(h)return`<div class="hold-wrap">${cardHTML(S.pkFinal[i],'md','transform:translateY(-10px);box-shadow:0 8px 20px rgba(196,147,58,.5),0 0 0 2px var(--gold)',0,false)}<div class="hold-tag">HOLD</div></div>`;
          if(revealed)return`<div class="hold-wrap">${cardHTML(S.pkFinal[i],'md','box-shadow:0 0 0 2px var(--gold-hi),2px 3px 10px rgba(0,0,0,.5)',0.05,isNewest)}<div class="hold-tag" style="color:var(--gold-hi);opacity:.85">NEW</div></div>`;
          return`<div class="hold-wrap">${cardHTML('back','md','box-shadow:2px 3px 10px rgba(0,0,0,.5),0 0 0 2px rgba(196,48,48,.65)')}<div class="hold-tag" style="color:var(--red)">REPLACE</div></div>`;
        }).join('')}
      </div>
      <button class="btn-gold" disabled style="opacity:.35">Drawing…</button>
      <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${fmt(S.pkBet)} chips</span></div>
    </div>`;
  }
  // result
  const h=S.pkHistory[S.pkHand-1], res=rankPoker(S.pkFinal), isLast=S.pkHand>=3;
  const isBusted=S.chips<10;
  const btnText=isBusted?'Game Over 💀':(isLast?'Final Round: Roulette →':'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?"advanceTo('roulette')":'pkNext()');

  return `${hdr('5 Card Poker · Result')}
  <div class="panel" style="text-align:center">
    <div style="font-family:var(--btn-f);font-size:3rem;color:${col(h.delta)};margin-bottom:4px;text-shadow:2px 2px 0 rgba(0,0,0,0.4)">${h.delta>0?'You Win!':h.delta<0?'You Lose!':'Push'}</div>
    <div style="font-family:var(--btn-f);font-size:1.1rem;color:var(--gold);margin-bottom:2px">${res.n}</div>
    <div style="font-family:var(--btn-f);font-size:2rem;color:${col(h.delta)};margin-bottom:14px">${sign(h.delta)} chips</div>
    <div class="sec">Your Hand</div>
    <div class="hand" style="margin-bottom:12px">
      ${S.pkFinal.map((c,i)=>{const isNew=!S.pkHeld.has(i);return cardHTML(c,'md',isNew?'box-shadow:0 0 0 2px var(--gold-hi),2px 3px 10px rgba(0,0,0,.5)':'',isNew?0.04+i*0.05:0);}).join('')}
    </div>
    ${gameDots(S.pkHistory,S.pkHand,S.pkPhase)}
    <div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
    <button class="btn-gold" style="margin-top:12px" onclick="${btnAction}">${btnText}</button>
  </div>`;
}

function screenUTH(){
  const ph=S.uthPhase;
  const CAT_NAMES=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

  if(ph==='bet'){
    const maxAnte=S.chips;
    const aios=getMod('all_in_or_skip');
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${aios
        ?`<div class="sec">All In or Skip · Wins Pay 2×</div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn-gold" style="flex:2" onclick="S.uthAnte=S.chips;uthDeal()">All In (${fmt(S.chips)}) →</button>
            <button class="ch-clear" style="flex:1;padding:17px" onclick="uthSkip()">Skip Hand</button>
          </div>`
        :`<div class="sec" style="text-align:center">Place Bet (Ante + Blind)</div>
          ${chipSel(maxAnte,S.uthAnte,[10,50,100,250,500,1000])}
          <div id="uth-summary" class="uth-summary" style="text-align:center;margin:10px 0;color:var(--cream)">
            Ante <b style="color:var(--gold)">${fmt(S.uthAnte/2)}</b> + Blind <b style="color:var(--gold)">${fmt(S.uthAnte/2)}</b> = <b style="color:var(--gold-hi)">${fmt(S.uthAnte)}</b> chips total
          </div>
          <button id="db" class="btn-gold" style="margin-top:4px" onclick="uthDeal()" ${S.uthAnte===0?'disabled':''}>Deal →</button>`}

      <div class="divider"></div>
      <div class="sec">Blind Pay Table</div>
      <div class="ptable">${[['Royal Flush','500x'],['Straight Flush','50x'],['Four of a Kind','10x'],['Full House','3x'],['Flush','3:2'],['Straight','1x'],['< Straight','Push']].map(([n,p])=>`<span class="pname">${n}</span><span class="ppay">${p}</span>`).join('')}</div>
    </div>`;
  }

  const commRow=()=>`<div id="uth-community-container" style="text-align:center;margin-bottom:8px">
    <div class="sec">Community Cards</div>
    <div id="uth-community-hand" class="hand">${[0,1,2,3,4].map(i=>{
      if(i<S.uthRevealComm){
        const isNew=i>=S.uthPrevRevealComm;
        return cardHTML(S.uthComm[i],'sm','',isNew?0.05+(i-S.uthPrevRevealComm)*0.12:0,isNew);
      }
      return cardHTML('back','sm','',0,false);
    }).join('')}</div>
  </div>`;

  const playerRow=(anim=false)=>`<div style="text-align:center;margin-bottom:8px">
    <div class="sec">Your Hand</div>
    <div class="hand">${S.uthHole.map((c,i)=>cardHTML(c,'md','',anim?0.05+i*0.2:0,anim)).join('')}</div>
  </div>`;

  const dealerRow=(reveal=false)=>`<div id="uth-dealer-container" style="text-align:center;margin-bottom:8px">
    <div id="uth-dealer-sec" class="sec">${reveal?'Dealer':getMod('peek')&&S.peekUsed?'Dealer · <span style="color:var(--gold-hi);font-size:.7rem">👁 Peeked</span>':'Dealer (Face Down)'}</div>
    <div id="uth-dealer-hand" class="hand">${reveal
      ?S.uthDealer.map((c,i)=>cardHTML(c,'md','',i*0.9+0.1)).join('')
      :[0,1].map((_,i)=>i===0&&getMod('peek')&&S.peekUsed?cardHTML(S.uthDealer[0],'md','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','md')).join('')}</div>
  </div>`;

  const betChips=()=>{
    const rows=[['Ante',S.uthAnte/2],['Blind',S.uthAnte/2]];
    if(S.uthPlay>0)rows.push(['Play ('+S.uthPlayMult+'×)',S.uthPlay]);
    return`<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0">
      ${rows.map(([lbl,amt])=>`<div style="text-align:center;padding:7px 12px;background:rgba(0,0,0,.28);border-radius:8px;border:1px solid rgba(196,147,58,.12)">
        <div style="font-size:.65rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.12em">${lbl}</div>
        <div style="font-family:var(--btn-f);color:var(--gold);font-size:1.05rem">${fmt(amt)}</div>
      </div>`).join('')}
    </div>`;
  };

  if(ph==='preflop'){
    const canR4=S.chips>=S.uthAnte*2;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      ${peekBtnHTML()}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(true)}
      ${betChips()}
      <div id="uth-actions-ui">
        <div id="uth-action-btns" class="act-btns">
          <button class="act-btn" onclick="uthRaise(4)" ${canR4?'':'disabled'}>Raise 4× (${fmt(S.uthAnte*2)})</button>
          <button class="act-btn" onclick="uthCheck()">Check</button>
        </div>
      </div>
    </div>`;
  }

  if(ph==='flop'){
    const canR2=S.chips>=S.uthAnte;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      ${peekBtnHTML()}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(false)}
      ${betChips()}
      <div id="uth-actions-ui">
        ${S.uthRaised ? `<button class="btn-gold" onclick="uthNextStreet()">See Turn &amp; River →</button>` : `
          <div id="uth-action-btns" class="act-btns">
            <button class="act-btn" onclick="uthRaise(2)" ${canR2?'':'disabled'}>Raise 2× (${fmt(S.uthAnte)})</button>
            <button class="act-btn" onclick="uthCheck()">Check</button>
          </div>`}
      </div>
    </div>`;
  }

  if(ph==='turn'){
    const canR1=S.chips>=S.uthAnte/2;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      ${peekBtnHTML()}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(false)}
      ${betChips()}
      <div id="uth-actions-ui">
        ${S.uthRaised ? `<button class="btn-gold" onclick="uthNextStreet()">→ Showdown</button>` : `
          <div id="uth-action-btns" class="act-btns">
            <button class="act-btn" onclick="uthRaise(1)" ${canR1?'':'disabled'}>Raise 1× (${fmt(S.uthAnte/2)})</button>
            <button class="act-btn" style="color:var(--lose);border-color:rgba(196,48,48,.4)" onclick="uthFold()">Fold</button>
          </div>`}
      </div>
    </div>`;
  }

  if(ph==='reveal'){
    return `${hdr("Ultimate Texas Hold'em · Dealer Reveals")}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory.slice(0,-1),S.uthHand-1,'reveal')}</div>
      <div class="divider"></div>
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;margin-bottom:12px">
        <div>
          <div class="sec" style="font-size:.62rem">Dealer</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map((c,i)=>cardHTML(c,'md','',i*0.9+0.1)).join('')}</div>
        </div>
        ${commRow()}
        <div style="width:60%;height:1px;background:rgba(196,147,58,0.1)"></div>
        <div>
          <div class="sec" style="font-size:.62rem">Your Hand</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
        </div>
      </div>
      ${betChips()}
      <div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
    </div>`;
  }

  // result
  const hist=S.uthHistory[S.uthHand-1];
  if(!hist)return'';
  const isLast=S.uthHand>=3;
  const isBusted=S.chips<10;
  const btnText=isBusted?'Game Over 💀':(isLast?'Final Round: Roulette →':'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?"advanceTo('roulette')":'uthNext()');

  if(hist.result==='fold'){
    const dealerBest=bestOf7([...S.uthDealer,...S.uthComm]);
    return `${hdr("Ultimate Texas Hold'em · Folded")}
    <div class="panel" style="text-align:center">
      ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
      <div class="divider"></div>
      <div style="font-size:1.65rem;font-weight:700;color:var(--lose);margin-bottom:2px">You Folded</div>
      <div style="font-size:1.3rem;color:var(--lose);margin-bottom:14px">${sign(hist.delta)} chips</div>
      <div class="divider"></div>
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;margin:12px 0">
        <div>
          <div class="sec" style="font-size:.62rem">Dealer's Hand</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
          <div style="font-size:1.05rem;color:var(--gold-hi);margin-top:3px">${CAT_NAMES[dealerBest.cat]}</div>
        </div>
        ${commRow()}
        <div style="width:60%;height:1px;background:rgba(196,147,58,0.1)"></div>
        <div>
          <div class="sec" style="font-size:.62rem">Your Hand</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
      <button class="btn-gold" style="margin-top:12px" onclick="${btnAction}">${btnText}</button>
    </div>`;
  }

  const pb=hist.playerBest,db2=hist.dealerBest;
  const resLabel=hist.result==='win'?'You Win!':hist.result==='push'?'Push':'You Lose!';
  const hlCards=hist.result==='win'?new Set(pb?.cards):hist.result==='lose'?new Set(db2?.cards):new Set();
  const hlStyle=hist.result==='win'?'box-shadow:0 0 0 2px var(--gold),0 0 14px 4px rgba(196,147,58,0.55)':'box-shadow:0 0 0 2px var(--lose),0 0 14px 4px rgba(196,48,48,0.5)';
  const hl=c=>hlCards.has(c)?hlStyle:'';

  return `${hdr("Ultimate Texas Hold'em · Showdown")}
  <div class="panel">
    ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
    <div class="divider"></div>
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:1.4rem;font-weight:700;color:${col(hist.delta)}">${resLabel}</div>
      <div style="font-size:1.1rem;font-weight:700;color:${col(hist.delta)}">${sign(hist.delta)} chips</div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;flex-direction:column;gap:12px;align-items:center;margin-bottom:12px;margin-top:12px">
        <div style="text-align:center">
          <div class="sec" style="font-size:.62rem">Dealer${hist.dealerQualifies?' (Qualifies)':' (No Qualify)'}</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map(c=>cardHTML(c,'md',hl(c),0,false)).join('')}</div>
          <div style="font-size:1.05rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[db2.cat]}</div>
        </div>
        <div style="text-align:center">
          <div class="sec" style="font-size:.62rem">Community</div>
          <div class="hand" style="justify-content:center">${S.uthComm.map((c,i)=>cardHTML(c,'sm',hl(c),i*0.08+0.05)).join('')}</div>
        </div>
        <div style="width:60%;height:1px;background:rgba(196,147,58,0.1)"></div>
        <div style="text-align:center">
          <div class="sec" style="font-size:.62rem">You</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map((c,i)=>cardHTML(c,'md',hl(c),i*0.15+0.05)).join('')}</div>
          <div style="font-size:1.05rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[pb.cat]}</div>
        </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:3px 14px;margin-bottom:10px">
      ${[['Ante',hist.anteDelta],['Blind',hist.blindDelta],...(hist.play>0?[['Play ('+hist.playMult+'×)',hist.playDelta]]:[])].map(([lbl,d])=>`<span class="pname">${lbl}</span><span class="ppay" style="color:${col(d)}">${sign(d)}</span>`).join('')}
    </div>
    <div class="irow" style="margin-top:8px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>
    <button class="btn-gold" style="margin-top:12px" onclick="${btnAction}">${btnText}</button>
  </div>`;
}

function screenRoulette(){
  if(S.rPhase==='bet') return screenRouletteBet();
  if(S.rPhase==='spinning') return screenRouletteSpinning();
  if(S.rPhase==='respin') return screenRouletteRespin();
  return screenRouletteResult();
}

function screenRouletteRespin(){
  const n=S.rSpin;
  let totalDelta=0;
  const betPreviews=S.rBets.map(b=>{
    const bDef=R_BETS[b.pick];
    const won=evalBet(b.pick,n);
    let pay=bDef.pay;
    if(won){
      if(getMod('r_payout_mult'))pay*=getMod('r_payout_mult');
      else if(getMod('r_number_pay')&&bDef.type==='num')pay=getMod('r_number_pay');
      else if(getMod('r_color_double')&&bDef.type==='col2')pay*=2;
    }
    const profit=won?b.bet*pay:0;
    const delta=won?profit:-b.bet;
    totalDelta+=delta;
    return{...b,won,delta,pay};
  });
  const wm=winMult();
  let displayDelta=totalDelta;
  if(wm>1&&totalDelta>0)displayDelta*=wm;
  const betRows=betPreviews.map(b=>{const d=R_BETS[b.pick];return`<div class="irow" style="margin-bottom:4px">
    <span class="ik">${d?d.type==='num'?'#'+d.lbl:d.lbl:'?'} · Pays ${b.pay}:1</span>
    <span style="font-family:var(--btn-f);font-size:1.2rem;color:${col(b.delta)}">${sign(b.delta)}</span>
  </div>`;}).join('');
  return `${hdr('Roulette · Second Chance')}
  <div class="panel" style="text-align:center">
    ${gameDots([], 0, 'spinning', 2)}
    <div class="divider"></div>
    <div style="display:flex;justify-content:center;margin-bottom:4px">
      <div class="r-res-num ${rCls(n)}">${n}</div>
    </div>
    <div style="font-size:.88rem;color:var(--shadow);margin-bottom:6px">${rName(n)}</div>
    <div style="font-size:1.6rem;font-weight:700;color:${col(displayDelta)};margin-bottom:8px">${sign(displayDelta)} chips</div>
    <div class="divider"></div>
    ${betRows}
    <div class="divider"></div>
    <div style="font-size:.9rem;color:var(--cream);margin-bottom:10px">Keep this result, or use your one re-spin?</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="act-btn" onclick="rKeepSpin()">Keep Result</button>
      <button class="btn-gold" onclick="rDoRespin()">Re-spin 🎡</button>
    </div>
  </div>`;
}

function screenRouletteSpinning(){
  const bets=S.rBets;
  const total=bets.reduce((a,b)=>a+b.bet,0);
  const betLabel=bets.length===1
    ?`Bet on <b style="color:var(--ink)">${R_BETS[bets[0].pick].type==='num'?'Number '+R_BETS[bets[0].pick].lbl:R_BETS[bets[0].pick].lbl}</b> &nbsp;|&nbsp; <b style="color:var(--gold)">${fmt(total)} chips</b>`
    :`<b style="color:var(--gold)">${bets.length} bets</b> &nbsp;|&nbsp; <b style="color:var(--gold)">${fmt(total)} chips</b>`;
  return `${hdr('Roulette · Spinning!')}
  <div class="panel">
    ${gameDots([], 0, 'play', 2)}
    <div class="divider"></div>
    <div class="wheel-outer">
      <div class="wheel-pointer"></div>
      <canvas id="rwheel" width="300" height="300"></canvas>
    </div>
    <div style="text-align:center;font-size:1.8rem;color:var(--cream);margin-top:4px">${betLabel}</div>
  </div>`;
}

function screenRouletteBet(){
  const maxBets=getMod('r_max_bets')||5;
  const aios=getMod('all_in_or_skip');
  const fg=getMod('r_force_group');
  if(fg&&R_GROUP_INFO[fg]&&S.rPick===R_GROUP_INFO[fg].bannedIdx){S.rPick=null;S.rBet=0;}
  const pb=S.rPick!==null?R_BETS[S.rPick]:null;
  const boardPad=getMod('r_color_double')||getMod('r_payout_mult')?'padding-bottom:28px':'';
  const board=`<div class="r-board-wrap" ${boardPad?`style="${boardPad}"`:''}><div style="min-width:380px">${rBoard()}</div></div>`;
  const betInfo=`<div id="r-bet-info"><div class="irow">${pb?`<span class="ik">Bet on: <b style="color:var(--ink)">${pb.type==='num'?'Number '+pb.lbl:pb.lbl}</b></span><span class="iv">${pb.pay}:1 payout</span>`:`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`}</div></div>`;

  if(aios&&S.rBets.length===0){
    return `${hdr('Roulette · 1 Spin')}
    <div class="panel">
      ${gameDots([], 0, 'bet', 2)}
      <div class="divider"></div>
      <div class="sec">The Table — select where to go all in</div>
      ${board}
      <div style="display:flex;gap:10px;margin:10px 0">
        <button class="btn-gold" style="flex:2" onclick="rAllIn()" ${!pb?'disabled':''}>All In on ${pb?pb.lbl:'...'} (${fmt(S.chips)}) →</button>
        <button class="ch-clear" style="flex:1;padding:17px" onclick="rSkip()">Skip Spin</button>
      </div>
      <div class="divider"></div>
      ${betInfo}
      <div class="sec" style="margin-top:10px">All In or Skip · Wins Pay 2×</div>
    </div>`;
  }

  const canAdd=S.rBets.length<maxBets&&pb&&S.rBet>0;
  const canSpin=S.rBets.length>0;
  const hdrTitle=maxBets===1?'Roulette · 1 Spin':`Roulette · Up to ${maxBets} Bets`;
  const secLabel=maxBets===1?'Place Your Bet':'Place Your Bets';
  return `${hdr(hdrTitle)}
  <div class="panel">
    ${gameDots([], 0, 'bet', 2)}
    <div class="divider"></div>
    ${board}
    <button id="db" class="btn-gold" style="margin:10px 0" onclick="rSpin()" ${!canSpin?'disabled':''}>Spin the Wheel 🎡</button>
    <div class="divider"></div>
    <div class="sec">${secLabel}</div>
    ${betInfo}
    ${chipSel(S.chips,S.rBet,null,`<button id="pb-add" class="btn-gold" onclick="rAddBet()" ${!canAdd?'disabled':''}>Place Bet (${S.rBets.length}/${maxBets})</button>`)}
    <div id="r-placed">${rPlacedInner(S.rBets,maxBets)}</div>
  </div>`;
}

function screenRouletteResult(){
  const res=S.rResult,n=S.rSpin;
  if(res.skipped){
    return `${hdr('Roulette · Skipped')}
    <div class="panel" style="text-align:center">
      ${gameDots([res], 0, 'result', 2)}
      <div class="divider"></div>
      <div style="font-size:1.75rem;font-weight:700;color:var(--shadow);margin-bottom:12px">Spin Skipped</div>
      <div class="irow"><span class="ik">Chips</span><span class="iv">${fmt(S.chips)}</span></div>
      <button class="btn-gold" style="margin-top:12px" onclick="advanceTo('results')">See Final Results →</button>
    </div>`;
  }
  const bets=res.bets||[{pick:S.rPick,won:res.won,delta:res.delta,pay:R_BETS[S.rPick]?.pay}];
  const betRows=bets.map(b=>{const d=R_BETS[b.pick];return`<div class="irow" style="margin-bottom:4px">
    <span class="ik">${d?d.type==='num'?'#'+d.lbl:d.lbl:'?'} · Pays ${b.pay}:1</span>
    <span style="font-family:var(--btn-f);font-size:1.2rem;color:${col(b.delta)}">${sign(b.delta)}</span>
  </div>`;}).join('');
  return `${hdr('Roulette · Result')}
  <div class="panel" style="text-align:center">
    ${gameDots([res], 1, 'result', 2)}
    <div class="divider"></div>
    <div style="display:flex;justify-content:center;margin-bottom:4px">
      <div class="r-res-num ${rCls(n)}">${n}</div>
    </div>
    <div style="font-size:.88rem;color:var(--shadow);margin-bottom:6px">${rName(n)}</div>
    <div style="font-size:2.2rem;font-weight:700;color:${col(res.delta)};margin-bottom:2px;text-shadow:2px 2px 0 rgba(0,0,0,0.4)">${res.delta>0?'You Win! 🎉':res.delta===0?'No change':'You Lose! 💸'}</div>
    <div style="font-size:1.6rem;font-weight:700;color:${col(res.delta)};margin-bottom:8px">${sign(res.delta)} chips</div>
    <div class="divider"></div>
    ${betRows}
    <div class="irow" style="margin-top:8px"><span class="ik">Chips after</span><span class="iv">${fmt(S.chips)}</span></div>
    <button class="btn-gold" style="margin-top:12px" onclick="advanceTo('results')">See Final Results →</button>
  </div>`;
}

function screenResults(){
  const bjNet=S.bjHistory.reduce((a,h)=>a+h.delta,0);
  const g2Hist=GAME2==='uth'?S.uthHistory:S.pkHistory;
  const g2Net=g2Hist.reduce((a,h)=>a+h.delta,0);
  const rNet=S.rResult?.delta||0;
  const g2Label=GAME2==='uth'?"♠ Ultimate Texas Hold'em":'♠ 5 Card Poker';
  const shareText=buildShareText();
  
  const histData = JSON.parse(localStorage.getItem('gambdle_history') || '{}');
  const historySorted = Object.entries(histData).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).slice(-7);
  const maxScore = Math.max(...historySorted.map(h => h[1]), 1000);
  const chartHtml = historySorted.length > 0 ? `
    <div class="sec" style="margin-top:6px;margin-bottom:0">Past Performance</div>
    <div class="chart-wrap">
      ${historySorted.map(([seed, score]) => {
        const s = parseInt(seed);
        const y = Math.floor(s / 10000), m = Math.floor((s % 10000) / 100), d = s % 100;
        const dayNum = Math.floor((Date.UTC(y, m - 1, d) - START_DATE_UTC) / 86400000) + 1;
        return `<div class="chart-bar" style="height:${Math.max((score/maxScore)*100, 5)}%" data-v="${fmt(score)}">
          <span class="chart-day">#${dayNum}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const high = parseInt(localStorage.getItem('gambdle_highscore') || '0');
  const {emoji,label}=getTier(S.chips);const tier=`${emoji} ${label}`;
  const msg = S.chips >= 1000 ? '📈 Excellent run!' : S.chips > 0 ? '📉 Tough session' : 'Better luck tomorrow';

  const resModTitle=getMod('title'),resModDesc=getMod('desc');
  return `${hdr('Daily Results')}
  <div class="panel" style="text-align:center">
    <div style="font-size:1.05rem;color:var(--cream);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:2px">${tier}</div>
    <div style="font-family:var(--btn-f);font-size:5rem;line-height:1;letter-spacing:.04em;color:var(--gold-hi);text-shadow:2px 2px 0 rgba(0,0,0,0.45)">${fmt(S.chips)}</div>
    <div style="color:var(--cream);opacity:0.7;letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;font-weight:600;margin-top:2px;margin-bottom:4px">chips</div>
    <div style="font-size:1.05rem;margin-bottom:8px;color:var(--cream)">${msg}</div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${[['🃏 Blackjack',bjNet],[g2Label,g2Net],['🎡 Roulette',rNet]].map(([lbl,net],i)=>`${i>0?'<div class="gm-sep"></div>':''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span style="font-size:1rem">${lbl}</span>
        <span style="font-family:var(--btn-f);font-size:1.35rem;color:${col(net)}">${sign(net)}</span>
      </div>`).join('')}
      <div class="gm-sep" style="opacity:0.35"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span class="ik">All-time high</span><span class="iv">${fmt(Math.max(S.chips, high))}</span>
      </div>
      <div id="lb-stat">
        <div class="gm-sep" style="opacity:0.35"></div>
        <div class="lb-row" style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
          <span class="ik">Today's ranking</span><span class="iv" style="color:var(--ink)">Loading…</span>
        </div>
      </div>
    </div>
    ${chartHtml}
    <div class="share-box">${shareText}</div>
    <button class="btn-gold" onclick="doShare()">📋 Copy &amp; Share</button>
  </div>`;
}

/**
 * ─── LEADERBOARD ─────────────────────────────────────────────────────
 * Submits score to Supabase once per day per device, then fetches the
 * player's percentile rank among all submissions for that day's seed.
 */
async function submitAndFetchLeaderboard() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return;
  const seed = getDailySeed();
  const subKey = `gambdle_submitted_${seed}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  if (!localStorage.getItem(subKey) && !DEV_OVERRIDE && !_testActive()) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ seed, chips: S.chips })
      });
      if (res.ok || res.status === 201) localStorage.setItem(subKey, '1');
    } catch(e) {
      if (DEV_OVERRIDE) console.error("Leaderboard submission failed:", e);
    }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_percentile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_seed: seed, p_chips: S.chips })
    });
    if (!res.ok) return;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    const el = document.getElementById('lb-stat');
    if (!el) return;
    if (!row || row.total < 1) { el.style.display = 'none'; return; }
    const iv = row.total < 5
      ? `Rank ${row.rank} of ${row.total} ${row.total === 1 ? 'player' : 'players'}`
      : row.top_pct > 50
        ? `Bottom ${100 - row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`
        : `Top ${row.top_pct}% &nbsp;·&nbsp; ${row.total.toLocaleString()} players`;
    const lr = el.querySelector('.lb-row');
    if (lr) lr.innerHTML = `<span class="ik">Today's Ranking</span><span class="iv" style="color:var(--ink)">${iv}</span>`;
  } catch(e) {
    if (DEV_OVERRIDE) console.error("Leaderboard fetch failed:", e);
  }
}

/**
 * ─── GLOBAL RENDER CONTROLLER ──────────────────────────────────────────
 * Coordinates screen transitions and the Developer UI overlay.
 */
let _noAnim=false;
let _bjResolving=false;

function devReset() {
  localStorage.removeItem(getStateKey());
  location.reload();
}

function devApplyMod(k) {
  S.forcedMod = k;
  saveState();
  render();
}
function devSpin(){
  S.screen='roulette';S.rPhase='bet';
  if(S.rBets.length===0&&S.chips>=10){S.chips-=10;S.rBets=[{pick:45,bet:10}];}
  document.querySelectorAll('.dropdown').forEach(d=>d.remove());
  saveState();
  if(S.rBets.length>0)rSpin();else render();
}
function devToggleUnlocks(){
  const on=!getPref('golden_back_unlocked');
  setPref('golden_back_unlocked', on);
  setPref('whale_back_unlocked', on);
  setPref('orange_back_unlocked', on);
  setPref('maroon_felt_unlocked', on);
  setPref('deck_emoji_unlocked', on);
  if(!on && ['gold','whale','orange'].includes(getPref('cardback'))) setPref('cardback','default');
  if(!on && getPref('felt')==='maroon') setPref('felt','default');
  if(!on && getPref('deck')==='emoji') setPref('deck','default');
  applyPrefs();
  const cb=document.getElementById('dev-unlocks-cb');
  if(cb) cb.checked=on;
}

function toggleTestSeed() {
  if (_testActive()) {
    localStorage.removeItem('gambdle_use_test_seed');
    localStorage.removeItem('gambdle_test_state');
  } else {
    localStorage.setItem('gambdle_use_test_seed', '1');
    localStorage.removeItem('gambdle_test_state');
  }
  const cb = document.getElementById('dev-test-seed-cb');
  if (cb) cb.checked = _testActive();
}


function statusBar(){
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h>=12 ? 'PM' : 'AM';
  const hh = (h%12) || 12;
  const tm = `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  const hint = STATUS_HINT[S.screen] || 'Ready.';
  return `<div class="status-bar">
    <span>${hint}</span>
    <span>Gambdle #${S.day}  ·  ${tm}</span>
  </div>`;
}

const STATUS_HINT = {
  intro:    'Idle — start a new game.',
  bj:       'Blackjack — choose action.',
  poker:    "Hold'em — choose action.",
  roulette: 'Roulette — place a bet.',
  results:  '<span class="sb-prefix">Game complete · </span>New game at midnight PST daily.',
};

function render(){
  const scr={intro:screenIntro,bj:screenBJ,poker:GAME2==='uth'?screenUTH:screenPoker,roulette:screenRoulette,results:screenResults};
  const inner = (scr[S.screen]||screenIntro)();
  document.getElementById('app').innerHTML=`<div class="app">
    <div class="window">
      ${inner}
      ${statusBar()}
    </div>
  </div>`;
  const _panel = document.querySelector('.panel');
  const _mod = modBannerHTML();
  if (_panel && _mod) _panel.insertAdjacentHTML('afterbegin', _mod);
  if(_noAnim){
    _noAnim=false;
    document.querySelectorAll('.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
  }
  saveState();
  if (S.screen === 'results') submitAndFetchLeaderboard();
}

function updateChipDisplay() {
  const el = document.getElementById('chip-badge');
  if (el) {
    el.innerHTML = `💵 ${fmt(S.chips)}`;
  }
}

// ─── ACTIONS ─────────────────────────────────────────
function goTo(s){S.screen=s;render();}
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('sounds/mediumbet.mp3');else playMp3('sounds/smallbet.mp3');}
function advanceTo(s){sndAdvance();if(s!=='results'&&S.chips<10)s='results';goTo(s);}
function startGame(){sndChip('allin');S.screen='bj';S.bjPhase='bet';render();}

function updateUthCommunityCards() {
  const commHand = document.getElementById('uth-community-hand');
  const dealerHand = document.getElementById('uth-dealer-hand');
  if (!commHand || !dealerHand) { _noAnim=true; render(); return; }

  // Update header subtitle surgically
  const hdrSub = document.getElementById('hdr-sub');
  if (hdrSub) {
    if (S.uthPhase === 'reveal') hdrSub.textContent = "Ultimate Texas Hold'em · Dealer Reveals";
    else if (S.uthPhase === 'result') hdrSub.textContent = "Ultimate Texas Hold'em · Showdown";
  }

  const actionUi = document.getElementById('uth-actions-ui');
  if (actionUi) {
    actionUi.style.pointerEvents = 'none';
    actionUi.querySelectorAll('button').forEach(b => {
      // Disable buttons and hide text during reveal animation to prevent layout shifts
      b.disabled = true;
      b.style.color = 'transparent';
    });
  }

  const startDelay = 300; // Slight delay after button press
  const interval = 400;   // Delay between community cards
  let revealedCount = 0;

  // Reveal community cards sequentially
  for (let i = S.uthPrevRevealComm; i < S.uthRevealComm; i++) {
    const cardIdx = i;
    const offset = revealedCount;
    setTimeout(() => {
      const cardHtml = cardHTML(S.uthComm[cardIdx], 'sm', '', 0, true);
      if (commHand.children[cardIdx]) {
        commHand.children[cardIdx].outerHTML = cardHtml;
        sndCard();
      }
    }, startDelay + offset * interval);
    revealedCount++;
  }

  // Update dealer reveal sounds to match HTML delays (0.1s and 1.0s)
  if (S.uthPhase === 'reveal') {
    const dSec = document.getElementById('uth-dealer-sec');
    if (dSec) dSec.textContent = 'Dealer';
    setTimeout(() => sndCard(), startDelay + 100);
    setTimeout(() => sndCard(), startDelay + 1000);
    dealerHand.innerHTML = S.uthDealer.map((c, i) => cardHTML(c, 'md', '', i * 0.9 + 0.1)).join('');
  }

  const finishDelay = startDelay + (revealedCount * interval);
  S.uthPrevRevealComm = S.uthRevealComm;

  const dotsContainer = document.getElementById('uth-dots-container');
  setTimeout(() => {
    if (dotsContainer) dotsContainer.innerHTML = S.uthPhase==='reveal'
      ? gameDots(S.uthHistory.slice(0,-1), S.uthHand-1, 'reveal')
      : gameDots(S.uthHistory, S.uthHand, S.uthPhase);
    if (actionUi && S.uthPhase !== 'reveal' && S.uthPhase !== 'result') {
      actionUi.style.pointerEvents = '';
      if (S.uthRaised) {
        actionUi.innerHTML = `<button class="btn-gold" onclick="uthNextStreet()">${S.uthPhase==='flop'?'See Turn & River →':'→ Showdown'}</button>`;
      } else {
        if (S.uthPhase === 'flop') actionUi.innerHTML = `<div id="uth-action-btns" class="act-btns"><button class="act-btn" onclick="uthRaise(2)" ${S.chips < S.uthAnte ? 'disabled' : ''}>Raise 2× (${fmt(S.uthAnte)})</button><button class="act-btn" onclick="uthCheck()">Check</button></div>`;
        else if (S.uthPhase === 'turn') actionUi.innerHTML = `<div id="uth-action-btns" class="act-btns"><button class="act-btn" onclick="uthRaise(1)" ${S.chips < S.uthAnte / 2 ? 'disabled' : ''}>Raise 1× (${fmt(S.uthAnte / 2)})</button><button class="act-btn" style="color:var(--lose);border-color:rgba(196,48,48,.4)" onclick="uthFold()">Fold</button></div>`;
      }
    }
  }, finishDelay);

  saveState();
}

/** 
 * --- BLACKJACK LOGIC --- 
 */

/** Handles the initial deal for a Blackjack hand. */
function bjDeal(){
  if(!S.bjBet)return;
  S.chips-=S.bjBet;
  S.bjAnimFrom=0;S.bjDealerAnimFrom=0;S.bjResultAnimPlayer=false;
  S.bjPlayer=[G.bjShoe[S.bjIdx++],G.bjShoe[S.bjIdx++]];
  S.bjDealer=[G.bjShoe[S.bjIdx++],G.bjShoe[S.bjIdx++]];
  const db=document.getElementById('db');if(db)db.disabled=true;
  const bjMult = getMod('bj_payout') || 1.5;
  sndShuffle(()=>{
    // Check for natural Blackjack immediately
    if(isBJ(S.bjPlayer)){
      S.bjPhase='play';S.bjCelebrating=true;
      _noAnim=true;render();
      sndCard(100);sndCard(500);
      setTimeout(()=>{sndBigWin();setTimeout(()=>{S.bjCelebrating=false;bjResolve();},1500);},1000);
      return;
    }
    S.bjPhase='play';
    render(); updateChipDisplay();
    sndCard(100);sndCard(500);sndCard(900);
  });
}
/** Player takes another card. */
function bjHit(){
  if(_bjResolving)return;
  const isSplit=S.bjSplit;
  const ai=isSplit?S.bjSplitActive:null;
  const hand=isSplit?S.bjSplitHands[ai]:S.bjPlayer;
  if(isSplit)S.bjSplitAnimFrom[ai]=hand.length;
  else S.bjAnimFrom=hand.length;
  S.bjDealerAnimFrom=ANIM_NONE;
  hand.push(G.bjShoe[S.bjIdx++]);
  sndCard(100);
  const pv=hVal(hand);
  if(pv>=21){_bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;isSplit?bjAdvanceSplit():bjRevealDealer();},700);}
  else{
    const handEl=document.getElementById(isSplit?'bj-active-hand':'bj-player-hand');
    const valEl=document.getElementById(isSplit?'bj-active-val':'bj-player-val');
    if(handEl&&valEl){
      // Surgical DOM update for Blackjack hit to avoid full screen flash
      handEl.insertAdjacentHTML('beforeend', cardHTML(hand[hand.length-1], 'lg', '', 0.1, true));
      valEl.textContent = hValDisplay(hand);
      saveState();
    }
  }
}
/** Player finishes their turn. */
function bjStand(){
  if(_bjResolving)return;
  _bjResolving=true;
  if(S.bjSplit)setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},300);
  else setTimeout(()=>{_bjResolving=false;bjRevealDealer();},300);
}
/** Double the bet and receive exactly one more card. */
function bjDouble(){
  if(_bjResolving)return;
  if(S.bjSplit){
    const i=S.bjSplitActive;
    if(S.chips<S.bjSplitBets[i])return;
    updateChipDisplay();
    S.bjSplitAnimFrom[i]=S.bjSplitHands[i].length;
    S.chips-=S.bjSplitBets[i];S.bjSplitBets[i]*=2;
    S.bjSplitDoubled[i]=true;
    S.bjSplitHands[i].push(G.bjShoe[S.bjIdx++]);
    sndCard(100);
    _bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},700);
  }else{
    if(S.chips<S.bjBet)return;
    S.bjAnimFrom=S.bjPlayer.length;
    updateChipDisplay();
    S.chips-=S.bjBet;S.bjBet*=2;
    S.bjDoubled=true;
    S.bjPlayer.push(G.bjShoe[S.bjIdx++]);
    _bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjRevealDealer();},700);
  }
}
/** Splits a pair into two separate hands. Supports re-splitting. */
function bjSplit(){
  if(S.bjSplit){
    if(S.bjSplitHands.length>=4)return;
    const ai=S.bjSplitActive,bet=S.bjSplitBets[ai];
    if(S.chips<bet)return;
    const[c0,c1]=S.bjSplitHands[ai];
    S.chips-=bet;
    S.bjSplitHands.splice(ai,1,[c0,G.bjShoe[S.bjIdx++]],[c1]);
    S.bjSplitBets.splice(ai,1,bet,bet);
    S.bjSplitDone.splice(ai,1,false,false);
    S.bjSplitAnimFrom.splice(ai,1,0,0);
    render(); updateChipDisplay();
  }else{
    const splitBet=Math.min(S.bjBet,S.chips);
    if(!splitBet)return;
    const[c0,c1]=S.bjPlayer;
    S.chips-=splitBet;
    S.bjSplit=true;
    S.bjSplitHands=[[c0,G.bjShoe[S.bjIdx++]],[c1]];
    S.bjSplitActive=0;
    S.bjSplitBets=[S.bjBet,splitBet];
    S.bjSplitResults=[];
    S.bjSplitDone=[false,false];
    S.bjSplitDoubled=[false,false];
    S.bjSplitAnimFrom=[0,0];
    render(); updateChipDisplay();
  }
  S.bjDealerAnimFrom=ANIM_NONE;
  sndCard(100);sndCard(500);
  bjCheckSplitHand();
}
function bjCheckSplitHand(){
  const hand=S.bjSplitHands[S.bjSplitActive];
  if(hVal(hand)>=21){
    if(isBJ(hand)){
      _bjResolving=true;S.bjCelebrating=true;_noAnim=true;render();
      sndCard(100);sndCard(500);
      setTimeout(()=>{sndBigWin();setTimeout(()=>{S.bjCelebrating=false;_bjResolving=false;bjAdvanceSplit();},1500);},1000);
    }else{_bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},700);}
  }else{_noAnim=true;render();}
}
/** Moves play to the next split hand, or to the dealer if all hands are done. */
function bjAdvanceSplit(){
  S.bjSplitDone[S.bjSplitActive]=true;
  const next=S.bjSplitDone.indexOf(false);
  if(next!==-1){
    S.bjSplitActive=next;
    const nextHand=S.bjSplitHands[next];
    if(nextHand.length===1){
      S.bjSplitAnimFrom[next]=1;
      nextHand.push(G.bjShoe[S.bjIdx++]);
    }
    sndCard(100);sndCard(500);
    bjCheckSplitHand();
  }
  else bjRevealDealer();
}
/** Animate the dealer's cards until they reach at least 17. */
function bjRevealDealer(){
  S.bjDealerReveal=true;
  S.bjDealerAnimFrom=1;
  S.bjAnimFrom=ANIM_NONE;S.bjSplitAnimFrom=S.bjSplitAnimFrom.map(()=>ANIM_NONE);
  _noAnim=true;render();
  sndCard(100);
  function step(){
    if(hVal(S.bjDealer)<(getMod('bj_dealer_stand')||17)){
      const at=S.bjDealer.length;
      S.bjDealer.push(G.bjShoe[S.bjIdx++]);
      S.bjDealerAnimFrom=at;
      _noAnim=true;render();
      sndCard(100);
      setTimeout(step,800);
    }else{
      setTimeout(()=>{S.bjDealerReveal=false;bjResolve(true);},1000);
    }
  }
  setTimeout(step,800);
}
/** Returns 2 when the all_in_or_skip modifier is active (wins are doubled), else 1. */
function winMult(){
  if(getMod('all_in_or_skip'))return 2;
  if(getMod('comeback')&&S.chips<1000)return 2;
  return 1;
}
function resetBJHand(){
  S.bjBet=0; S.bjPhase='bet'; S.bjPlayer=[]; S.bjDealer=[];
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0;
  S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[];
  S.bjAnimFrom=0; S.bjDealerAnimFrom=0; S.bjSplitAnimFrom=[];
  S.bjResultAnimPlayer=false; S.bjDealerReveal=false; S.bjCelebrating=false;
  _bjResolving=false;
}
function resetUTHHand(){
  S.uthAnte=0; S.uthPhase='bet'; S.uthPlay=0; S.uthPlayMult=0;
  S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[];
  S.uthRevealComm=0; S.uthPrevRevealComm=0;
}
/** Skip the current BJ hand (all_in_or_skip modifier). Records delta 0 and advances. */
function bjSkip(){
  S.bjHistory.push({bet:0,result:'skip',delta:0,player:[],dealer:[]});
  S.bjHand++;
  if(S.bjHand>=3){advanceTo('poker');return;}
  resetBJHand();
  render();
}
/** Skip the current UTH hand (all_in_or_skip modifier). Records delta 0 and advances. */
function uthSkip(){
  S.uthHistory.push({ante:0,blind:0,play:0,playMult:0,result:'skip',delta:0});
  S.uthHand++;
  if(S.uthHand>=3){advanceTo('roulette');return;}
  resetUTHHand();
  render();
}
/** Skip the roulette spin (all_in_or_skip modifier). Records delta 0 and goes to result. */
function rSkip(){
  S.rResult={delta:0,skipped:true};S.rPhase='result';render();
}
/** Final payout calculation for Blackjack, handling both standard and split hands. */
function bjResolve(dealerDrawn=false){
  if(!dealerDrawn){S.bjDealerAnimFrom=1;}
  while(hVal(S.bjDealer)<(getMod('bj_dealer_stand')||17))S.bjDealer.push(G.bjShoe[S.bjIdx++]);
  const dv=hVal(S.bjDealer),dBJ=isBJ(S.bjDealer);
  const wm=winMult();
  if(S.bjSplit){
    let totalDelta=0;
    const handResults=S.bjSplitHands.map((hand,i)=>{
      const bet=S.bjSplitBets[i],pv=hVal(hand);
      const ddm=getMod('bj_double_bonus')&&S.bjSplitDoubled[i]?2:1;
      let result,delta;
      if(pv>21){result='bust';delta=-bet;}
      else if(dv>21||pv>dv){result='win';delta=bet*wm*ddm;S.chips+=bet+delta;}
      else if(pv===dv){result='push';delta=0;S.chips+=bet;}
      else{result='lose';delta=-bet;}
      totalDelta+=delta;return{result,delta,bet};
    });
    S.bjSplitResults=handResults;
    S.bjResult={result:'split',delta:totalDelta};
    S.bjHistory.push({bet:S.bjSplitBets.reduce((a,b)=>a+b,0),result:'split',delta:totalDelta,player:S.bjSplitHands.map(h=>[...h]),dealer:[...S.bjDealer]});
  }else{
    const pv=hVal(S.bjPlayer),pBJ=isBJ(S.bjPlayer);
    const bjMult = getMod('bj_payout') || 1.5;
    const ddm=getMod('bj_double_bonus')&&S.bjDoubled?2:1;
    let result,delta;
    if(pBJ&&dBJ){result='push';delta=0;S.chips+=S.bjBet;}
    else if(pBJ){result='blackjack';delta=Math.floor(S.bjBet*bjMult*wm);S.chips+=S.bjBet+delta;}
    else if(pv>21){result='bust';delta=-S.bjBet;}
    else if(dv>21||pv>dv){result='win';delta=S.bjBet*wm*ddm;S.chips+=S.bjBet+delta;}
    else if(pv===dv){result='push';delta=0;S.chips+=S.bjBet;}
    else{result='lose';delta=-S.bjBet;}
    S.bjResult={result,delta};
    S.bjHistory.push({bet:S.bjBet,result,delta,player:[...S.bjPlayer],dealer:[...S.bjDealer]});
  }
  S.bjHand++;S.bjPhase='result';render();
  updateChipDisplay();
  const {result:_bjr,delta:_bjd}=S.bjResult;
  if(S.bjSplit?_bjd>0:_bjr==='win')setTimeout(sndBigWin,400);
}
function bjNext(){
  resetBJHand();
  sndAdvance();
  if(S.chips<10){S.screen='results';render();}else render();
}

/** 
 * --- POKER (5-CARD) LOGIC --- 
 */

/** Initial deal for 5-Card Draw Poker. */
function pkDeal(){
  if(!S.pkBet)return;
  S.chips-=S.pkBet;
  S.pkCards=G.pokerDecks[S.pkHand].slice(0,5);
  S.pkHeld=new Set();
  const db=document.getElementById('db');if(db)db.disabled=true;
  sndShuffle(()=>{
    S.pkPhase='hold';
    render(); updateChipDisplay();
    sndCard(40);sndCard(100);sndCard(160);sndCard(220);sndCard(280);
  });
}
function toggleHold(i){
  S.pkHeld.has(i)?S.pkHeld.delete(i):S.pkHeld.add(i);
  const h=S.pkHeld.has(i);
  const hw=document.getElementById('pk-hw-'+i);
  if(hw){
    const card=hw.querySelector('.card');
    const tag=hw.querySelector('.hold-tag');
    if(card){card.style.transform=h?'translateY(-10px)':'translateY(0)';card.style.boxShadow=h?'0 8px 20px rgba(196,147,58,.5),0 0 0 2px var(--gold)':'2px 3px 10px rgba(0,0,0,.5),0 0 0 2px rgba(196,48,48,.65)';}
    if(tag){tag.style.color=h?'':'var(--red)';tag.textContent=h?'HOLD':'REPLACE';}
    const status=document.querySelector('.pk-hold-status');
    if(status)status.textContent=`Tap cards to hold · ${S.pkHeld.size} held · ${5-S.pkHeld.size} replaced`;
    saveState();
  }else{_noAnim=true;render();}
}
/** Discard unheld cards and draw new ones, then calculate final rank. */
function pkDraw(){
  const draw=G.pokerDecks[S.pkHand].slice(5);let di=0;
  S.pkFinal=S.pkCards.map((c,i)=>S.pkHeld.has(i)?c:draw[di++]);
  const res=rankPoker(S.pkFinal);
  const profit=res.p>0?S.pkBet*res.p:0;
  const delta=res.p>0?profit:-S.pkBet;
  if(res.p>0)S.chips+=S.pkBet+profit;
  S.pkHistory.push({bet:S.pkBet,result:res.n,pts:res.p,delta});
  const replaceIdxs=[0,1,2,3,4].filter(i=>!S.pkHeld.has(i));
  S.pkRevealStep=0;S.pkPhase='draw';
  _noAnim=true;render();updateChipDisplay();
  function revealNext(){
    if(S.pkRevealStep>=replaceIdxs.length){
      if(delta>0)setTimeout(sndBigWin,200);
      setTimeout(()=>{S.pkHand++;S.pkPhase='result';render();},900);
      return;
    }
    S.pkRevealStep++;
    _noAnim=true;render();
    sndCard(50);
    setTimeout(revealNext,650);
  }
  setTimeout(revealNext,300);
}
function pkNext(){sndAdvance();S.pkBet=0;S.pkPhase='bet';if(S.chips<10){S.screen='results';render();}else render();}

/** 
 * --- ULTIMATE TEXAS HOLD'EM LOGIC --- 
 */

/** Initial deal for UTH: Player cards, Dealer cards (hidden), and Community cards (hidden). */
function uthDeal(){
  if(!S.uthAnte)return;
  S.chips-=S.uthAnte;
  const dk=G.uthDeck,off=S.uthHand*9;
  S.uthHole=[dk[off],dk[off+1]];
  S.uthDealer=[dk[off+2],dk[off+3]];
  S.uthComm=[dk[off+4],dk[off+5],dk[off+6],dk[off+7],dk[off+8]];
  S.uthRaised=false;S.uthFolded=false;S.uthPlay=0;S.uthPlayMult=0;
  S.uthRevealComm=0;S.uthPrevRevealComm=0;
  const db=document.getElementById('db');if(db)db.disabled=true;
  sndShuffle(()=>{
    S.uthPhase='preflop';
    render(); updateChipDisplay();
    sndCard(40);sndCard(100);sndCard(160);sndCard(220);
  });
}
function uthRaise(mult){
  const bet=(S.uthAnte/2)*mult;
  if(S.chips<bet)return;
  S.chips-=bet;S.uthPlay=bet;S.uthPlayMult=mult;S.uthRaised=true;
  sndChip();
  if(S.uthPhase==='preflop'){
    S.uthPrevRevealComm=0;S.uthRevealComm=3;S.uthPhase='flop';updateUthCommunityCards();updateChipDisplay();sndCard(50);sndCard(150);sndCard(250);
  }else if(S.uthPhase==='flop'){
    S.uthPrevRevealComm=3;S.uthRevealComm=5;S.uthPhase='turn';updateUthCommunityCards();updateChipDisplay();sndCard(50);sndCard(200);
  }else if(S.uthPhase==='turn'){
    uthResolve();
  }
}
function uthCheck(){
  if(S.uthPhase==='preflop'){
    S.uthPrevRevealComm=0;S.uthRevealComm=3;S.uthPhase='flop';updateUthCommunityCards();sndCard(50);sndCard(150);sndCard(250);
  }else if(S.uthPhase==='flop'){
    S.uthPrevRevealComm=3;S.uthRevealComm=5;S.uthPhase='turn';updateUthCommunityCards();sndCard(50);sndCard(200);
  }
}
function uthNextStreet(){
  if(S.uthPhase==='flop') {
    S.uthPrevRevealComm=3;S.uthRevealComm=5;S.uthPhase='turn';updateUthCommunityCards();sndCard(50);sndCard(200);
  }else if(S.uthPhase==='turn'){
    uthResolve();
  }
}
function uthFold(){
  S.uthFolded=true;
  const ante=S.uthAnte/2;
  S.uthHistory.push({ante,blind:ante,play:0,playMult:0,result:'fold',delta:-(ante*2),anteDelta:-ante,blindDelta:-ante,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:false});
  S.uthHand++;S.uthPhase='reveal';
  updateUthCommunityCards();
  setTimeout(()=>{_noAnim=true;S.uthPhase='result';render();updateChipDisplay();},2300);
}
/**
 * Calculates the complex UTH showdown.
 * Play bet pays 1:1 if player wins.
 * Blind bet pays according to paytable if player wins with a Straight or better.
 * Ante bet pays 1:1 if player wins AND dealer qualifies (Pair or better).
 */
function uthResolve(){
  const ante=S.uthAnte/2,play=S.uthPlay;
  const pb=bestOf7([...S.uthHole,...S.uthComm]);
  const db2=bestOf7([...S.uthDealer,...S.uthComm]);
  const dealerQualifies=db2.cat>=(getMod('uth_hard_qualify')?2:1);
  const cmp=pb.score-db2.score;
  const wm=winMult();
  let anteDelta=0,blindDelta=0,playDelta=0;
  if(cmp>0){
    const playMult=getMod('uth_double_play')?2:1;
    playDelta=play*playMult*wm;S.chips+=play+playDelta;
    if(dealerQualifies){anteDelta=ante*wm;S.chips+=ante+anteDelta;}
    else{anteDelta=0;S.chips+=ante;}
    const bd=uthBlindDelta(pb.cat,ante);
    blindDelta=bd*wm;S.chips+=ante+blindDelta;
  }else if(cmp===0){
    anteDelta=0;blindDelta=0;playDelta=0;
    S.chips+=ante+ante+play;
  }else{
    playDelta=-play;anteDelta=-ante;blindDelta=-ante;
  }
  const delta=anteDelta+blindDelta+playDelta;
  S.uthHistory.push({ante,blind:ante,play,playMult:S.uthPlayMult,result:cmp>0?'win':cmp===0?'push':'lose',delta,anteDelta,blindDelta,playDelta,playerBest:pb,dealerBest:db2,dealerQualifies});
  S.uthHand++;S.uthPhase='reveal';
  S.uthRevealComm=5;
  updateUthCommunityCards();
  setTimeout(()=>{_noAnim=true;S.uthPhase='result';render();updateChipDisplay();if(delta>0)setTimeout(sndBigWin,400);},2300);
}
function uthNext(){
  sndAdvance();
  resetUTHHand();
  if(S.chips<10){S.screen='results';render();}else render();
}

/** 
 * --- ROULETTE LOGIC --- 
 */

function pickBet(i){
  const _fg=getMod('r_force_group');
  if(_fg&&R_GROUP_INFO[_fg]&&i===R_GROUP_INFO[_fg].bannedIdx)return;
  if(S.rPick===i){
    S.rPick=null;
    document.querySelectorAll('[data-idx]').forEach(b=>b.classList.remove('r-sel'));
    document.querySelectorAll('.r-chip-sel').forEach(c=>c.remove());
    const info=document.getElementById('r-bet-info');
    if(info){const irow=info.querySelector('.irow');if(irow)irow.innerHTML=`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`;}
    patchBetUI();saveState();return;
  }
  S.rPick=i;
  const info = document.getElementById('r-bet-info');
  if(!info){ render(); return; }

  // Surgical update of board selection
  document.querySelectorAll('[data-idx]').forEach(b => b.classList.remove('r-sel'));
  const btn = document.querySelector(`[data-idx="${i}"]`);
  if(btn) btn.classList.add('r-sel');

  // Clear any stale selection chips
  document.querySelectorAll('.r-chip-sel').forEach(c => c.remove());

  const pb = R_BETS[i];
  const irow = info.querySelector('.irow');
  if(irow){
    irow.style.visibility = '';
    irow.querySelector('.ik').innerHTML = `Bet on: <b style="color:var(--ink)">${pb.type==='num'?'Number '+pb.lbl:pb.lbl}</b>`;
    irow.querySelector('.iv').textContent = pb.pay+':1 payout';
  }
  
  patchBetUI(); // Updates the Spin button state surgically
  saveState();
}
function rPlacedInner(bets,maxBets){
  if(!bets.length)return'';
  return`<div class="divider" style="margin:10px 0"></div>
    <div class="sec">Placed Bets (${bets.length}/${maxBets})</div>
    ${bets.map((b,i)=>{const d=R_BETS[b.pick];return`<div class="irow" style="margin-bottom:4px">
      <span class="ik">${d.type==='num'?'#'+d.lbl:d.lbl} · Pays ${d.pay}:1</span>
      <span style="display:flex;align-items:center;gap:8px"><span class="iv">${fmt(b.bet)}</span>
        <button onclick="rRemoveBet(${i})" style="background:none;border:none;color:var(--shadow);cursor:pointer;font-size:1rem;padding:2px 6px">×</button>
      </span></div>`;}).join('')}`;
}
/** Adds current rPick+rBet to the placed bets list (multi-bet mode). */
function rAddBet(){
  const maxBets=getMod('r_max_bets')||5;
  if(S.rPick===null||!S.rBet||S.rBets.length>=maxBets)return;

  const prevPick=S.rPick, betAmt=S.rBet;
  S.chips-=betAmt;
  S.rBets.push({pick:prevPick,bet:betAmt});
  sndChip(betAmt);
  S.rBet=0; S.rPick=null;
  saveState();

  // --- surgical DOM updates ---
  const boardBtn=document.querySelector(`[data-idx="${prevPick}"]`);
  if(!boardBtn){render();return;}

  // Board: pending chip → placed chip
  boardBtn.classList.remove('r-sel');
  boardBtn.querySelectorAll('.r-chip-sel').forEach(c=>c.remove());
  const total=S.rBets.filter(b=>b.pick===prevPick).reduce((s,b)=>s+b.bet,0);
  const chipLbl=amt=>amt>=1000?Math.floor(amt/1000)+'K':String(amt);
  const existing=boardBtn.querySelector('.r-chip-placed');
  if(existing)existing.textContent=chipLbl(total);
  else boardBtn.insertAdjacentHTML('beforeend',`<span class="r-chip r-chip-placed">${chipLbl(total)}</span>`);

  const info=document.getElementById('r-bet-info');
  const irow=info?.querySelector('.irow');
  if(irow)irow.innerHTML=`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`;

  // Chip selector: reset to 0
  const bv=document.getElementById('bv');
  if(bv)bv.textContent=fmt(0);
  document.querySelectorAll('.chbtn').forEach(b=>{b.disabled=(+b.dataset.v)>S.chips;});

  // Placed bets list
  const placed=document.getElementById('r-placed');
  if(placed)placed.innerHTML=rPlacedInner(S.rBets,maxBets);

  // Place Bet button: update count, disable (rBet=0)
  const pba=document.getElementById('pb-add');
  if(pba){pba.textContent=`Place Bet (${S.rBets.length}/${maxBets})`;pba.disabled=true;}

  // Spin button: enable now that a bet exists
  const db=document.getElementById('db');
  if(db)db.disabled=false;

  updateChipDisplay();
}
/** Removes a placed bet and refunds chips. */
function rRemoveBet(i){
  if(i<0||i>=S.rBets.length)return;
  S.chips+=S.rBets[i].bet;
  S.rBets.splice(i,1);
  saveState();render();
}
/** All In on the current pick (all_in_or_skip modifier). */
function rAllIn(){
  if(S.rPick===null||S.chips===0)return;
  S.rBets=[{pick:S.rPick,bet:S.chips}];
  S.chips=0;
  rSpin();
}
/** Initiates the Roulette spin animation. */
function rSpin(){
  if(S.rBets.length===0)return;
  const zb=getMod('r_zero_boost');
  const fg=getMod('r_force_group');
  if(G.rSpinOverride!=null){S.rSpin=G.rSpinOverride;}
  else if(fg&&R_GROUP_INFO[fg]){const ns=[...R_GROUP_INFO[fg].nums];S.rSpin=ns[Math.floor(Math.random()*ns.length)];}
  else if(zb){const r=Math.floor(Math.random()*(36+zb));S.rSpin=r<zb?0:r-zb+1;}
  else{S.rSpin=Math.floor(Math.random()*37);}
  S.rPhase='spinning';
  render();updateChipDisplay();
  sndSpin(4.6);
  setTimeout(startWheelAnim,60);
}
/** Final result calculation for Roulette after the animation. */
function _resolveRoulette(){
  const n=S.rSpin;
  let totalDelta=0;
  const betResults=S.rBets.map(b=>{
    const bDef=R_BETS[b.pick];
    const won=evalBet(b.pick,n);
    let pay=bDef.pay;
    if(won){
      if(getMod('r_payout_mult'))pay*=getMod('r_payout_mult');
      else if(getMod('r_number_pay')&&bDef.type==='num')pay=getMod('r_number_pay');
      else if(getMod('r_color_double')&&bDef.type==='col2')pay*=2;
    }
    const profit=won?b.bet*pay:0;
    const delta=won?profit:-b.bet;
    if(won)S.chips+=b.bet+profit;
    totalDelta+=delta;
    return{...b,won,delta,pay};
  });
  const wm=winMult();
  if(wm>1&&totalDelta>0){S.chips+=totalDelta;totalDelta*=wm;}
  S.rResult={delta:totalDelta,bets:betResults};
  S.rPhase='result';render();updateChipDisplay();
  if(totalDelta>0)setTimeout(sndBigWin,400);
}
function rFinish(){
  if(getMod('r_respin')&&!S.rReSpun){S.rPhase='respin';render();return;}
  _resolveRoulette();
}
function rKeepSpin(){_resolveRoulette();}
function rDoRespin(){S.rReSpun=true;rSpin();}

/** 
 * --- CHIP & BETTING LOGIC --- 
 */

const BET_REF={bj:'bjBet',roulette:'rBet'};
function curBetRef(){return BET_REF[S.screen]??(GAME2==='uth'?'uthAnte':'pkBet');}
function maxBet(){return(S.screen==='poker'&&GAME2==='uth')?Math.floor(S.chips*2/3):S.chips;}

function patchBetUI() {
  /**
   * This function performs surgical updates on the betting screen
   * to keep the experience responsive and flash-free.
   */
  const k = curBetRef();
  const bet = S[k];
  const max = maxBet();
  const minChipsMod = getMod('min_chips') || 0;
  const isBetValid = bet >= minChipsMod;
  
  const bv=document.getElementById('bv');
  if(!bv){ render(); return; }
  
  bv.textContent = fmt(bet);
  
  document.querySelectorAll('.chbtn').forEach(b => {
    b.disabled = bet + (+b.dataset.v) > max;
  });
  
  const db=document.getElementById('db');
  if(db){
    const maxBets=getMod('r_max_bets')||5;
    db.disabled=(k==='rBet'?S.rBets.length===0:(bet===0||!isBetValid));
    const pba=document.getElementById('pb-add');
    if(pba)pba.disabled=!(S.rBets.length<maxBets&&S.rPick!==null&&bet>0);
  }
  const ai=document.getElementById('ai');
  if(ai)ai.disabled=max===0 || max < minChipsMod;
  
  const us=document.getElementById('uth-summary');
  if(us) {
    us.innerHTML = `Ante <b style="color:var(--gold)">${fmt(bet/2)}</b> + Blind <b style="color:var(--gold)">${fmt(bet/2)}</b> = <b style="color:var(--gold-hi)">${fmt(bet)}</b> chips total`;
  }
}

function addChip(d){const k=curBetRef();S[k]=Math.min(S[k]+d,maxBet());sndChip();patchBetUI();}
function clearBet(){S[curBetRef()]=0;patchBetUI();}
function allIn(){S[curBetRef()]=maxBet();sndChip();patchBetUI();}

/** 
 * --- SHARING & UTILS --- 
 */

function buildShareText(){
  const bjNet=S.bjHistory.reduce((a,h)=>a+h.delta,0);
  const g2Hist=GAME2==='uth'?S.uthHistory:S.pkHistory;
  const g2Net=g2Hist.reduce((a,h)=>a+h.delta,0);
  const rNet=S.rResult?.delta||0;
  const g2Name=GAME2==='uth'?"Ultimate Texas Hold'em":'5 Card Poker';
  const trophy=getTier(S.chips).emoji;
  return [
    `🎰 Gambdle #${S.day}`,
    ``,
    `🃏 Blackjack     (${sign(bjNet)})`,
    `♠️  ${g2Name.padEnd(14)} (${sign(g2Net)})`,
    `🎡 Roulette      (${sign(rNet)})`,
    ``,
    `${trophy} Finished with ${fmt(S.chips)} chips`,
    `gambdle.net`
  ].join('\n');
}
function doShare(){
  navigator.clipboard.writeText(buildShareText()).then(()=>toast('Copied! 🎲'));
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
const _SUIT_CLS_MAP={'♠':'sym-s','♥':'sym-h','♦':'sym-d','♣':'sym-c'};
function suitSpans(s){return s.replace(/[♠♥♦♣]/g,m=>`<span class="${_SUIT_CLS_MAP[m]}">${m}</span>`);}
const INFO_SECTIONS = {
  overview: {
    title: 'How to Play',
    body: `<div><b>🎰 Gambdle</b> is a daily casino challenge. Start with <b>1,000 chips</b> and play three games back to back — Blackjack, Ultimate Texas Hold'em, and Roulette. Your final chip count is your score.</div>
      <div>Everyone plays the same hands each day. A new game unlocks every day at midnight.</div>
      <div><b>✨ Daily Modifier</b> — A special rule is active every day that tweaks payouts or gameplay for everyone. Check the gold banner at the top of each game screen.</div>`
  },
  bj: {
    title: '🃏 Blackjack',
    body: `<div>Beat the dealer without going over 21. You play <b>3 hands</b>.</div>
      <div><b>Hit</b> — take another card. &nbsp;<b>Stand</b> — end your turn.</div>
      <div><b>Double Down</b> — double your bet, receive exactly one more card, then stand.</div>
      <div><b>Split</b> — if your first two cards match in rank, split them into two separate hands (each with its own bet).</div>
      <div>Dealer must stand on 17 or higher. <b>Blackjack</b> (Ace + 10-value on the deal) pays <b>3:2</b>.</div>`
  },
  uth: {
    title: "♠ Ultimate Texas Hold'em",
    body: `<div>Beat the dealer's best 5-card hand using 2 hole cards and 5 community cards. You play <b>3 hands</b>.</div>
      <div>Place equal <b>Ante</b> and <b>Blind</b> bets to start.</div>
      <div><b>Preflop</b> — Raise 4× or 3× before seeing community cards, or check to wait.</div>
      <div><b>Flop</b> — 3 community cards are revealed. Raise 2×, or check.</div>
      <div><b>Turn / River</b> — 4th and 5th community cards. Raise 1×, or fold and forfeit your bets.</div>
      <div>Dealer needs at least a pair to qualify. If dealer doesn't qualify, your Ante pushes. The <b>Blind</b> pays bonus if you win with a Straight or better.</div>`
  },
  roulette: {
    title: '🎡 Roulette',
    body: `<div>Pick where to bet on the board, set your stake, and spin. <b>One spin</b> ends the run.</div>
      <div><b>Numbers 0–36</b> — exact match pays <b>35:1</b>.</div>
      <div><b>Columns (2:1)</b> — top, middle, or bottom row of the board.</div>
      <div><b>Dozens</b> — 1-12, 13-24, or 25-36 — pay <b>2:1</b>.</div>
      <div><b>Outside bets</b> — Red/Black, Odd/Even, 1-18/19-36 — pay <b>1:1</b>.</div>
      <div>On some modifier days you may place multiple bets before spinning.</div>`
  },
  modifiers: {
    title: '✨ Daily Modifiers',
    body: `<div>A modifier is active every day that changes the rules for everyone. The gold banner at the top of each game screen tells you what's active.</div>
      <div><b>Blackjack modifiers</b> — e.g. Blackjacks pay 2:1 · Dealer stands on 15 · Successful doubles pay 2× profit · One free dealer peek.</div>
      <div><b>Hold'em modifiers</b> — e.g. All blind payouts doubled · Blind pays on two pair and trips · Raises pay 2:1 · Dealer needs two pair to qualify.</div>
      <div><b>Roulette modifiers</b> — e.g. All wins doubled · Number bets pay 50:1 · Red/Black pays 2:1 · Place up to 10 bets.</div>
      <div><b>Cross-game</b> — e.g. All In or Skip: each hand you go all-in or skip it entirely. Wins pay 2×.</div>
      <div>The modifier rotates on a fixed cycle — the same cycle repeats for everyone.</div>`
  },
  hands: {
    title: '🃏 Poker Hands',
    body: (()=>{
      const row=(name,cards,desc)=>
        `<span style="color:var(--ink);font-size:1.3rem">${name}</span><span style="color:var(--ink);font-size:1.2rem;text-align:right">${suitSpans(cards)}</span><span style="font-size:1.05rem;grid-column:1/-1;margin-bottom:4px;color:var(--shadow)">${desc}</span>`;
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:4px 16px;font-family:var(--btn-f)">
        ${row('Royal Flush',   'A♠ K♠ Q♠ J♠ 10♠', 'Ace through Ten, all same suit — unbeatable.')}
        ${row('Straight Flush','9♦ 8♦ 7♦ 6♦ 5♦',  'Five in a row, all same suit.')}
        ${row('Four of a Kind','K♠ K♥ K♦ K♣',      'All four cards of the same rank.')}
        ${row('Full House',    'Q♠ Q♥ Q♦ 9♣ 9♥',   'Three of a kind plus a pair.')}
        ${row('Flush',         'A♣ J♣ 8♣ 5♣ 2♣',   'Any five cards of the same suit.')}
        ${row('Straight',      '10♠ 9♥ 8♦ 7♣ 6♠',  'Five in a row, any suits. Ace can be low (A-2-3-4-5).')}
        ${row('Three of a Kind','7♠ 7♥ 7♦',         'Three cards of the same rank.')}
        ${row('Two Pair',      'J♠ J♦ 4♥ 4♣',       'Two different pairs.')}
        ${row('One Pair',      'A♠ A♥',              'Two cards of the same rank.')}
        ${row('High Card',     'K♠ J♥ 9♦ 6♣ 2♠',   'No matching cards — highest card wins.')}
      </div>`;
    })()
  }
};

function showInfo(section) {
  const existing = document.getElementById('info-modal');
  if (existing) existing.remove();
  const {title, body} = INFO_SECTIONS[section] || INFO_SECTIONS.overview;
  const el = document.createElement('div');
  el.id = 'info-modal'; el.className = 'info-modal';
  el.onclick = e => { if(e.target===el) el.remove(); };
  el.innerHTML = `<div class="info-box" style="padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--btn-f);color:var(--ink);font-size:1.7rem">${title}</div>
      <button onclick="document.getElementById('info-modal').remove()" style="background:none;border:none;color:var(--shadow);font-size:1.6rem;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div class="divider" style="margin-bottom:14px"></div>
    <div style="display:flex;flex-direction:column;gap:14px;font-size:1.15rem;color:var(--ink);line-height:1.55">${body}</div>
  </div>`;
  document.body.appendChild(el);
}

function _positionSubmenu(sub, trigger) {
  const tr = trigger.getBoundingClientRect();
  sub.style.top = tr.top + 'px';
  sub.style.left = (tr.right + 4) + 'px';
  document.body.appendChild(sub);
  const sr = sub.getBoundingClientRect();
  if (sr.right > window.innerWidth - 4)
    sub.style.left = Math.max(4, tr.left - sr.width - 4) + 'px';
  if (sr.bottom > window.innerHeight - 4)
    sub.style.top = Math.max(4, window.innerHeight - sr.height - 4) + 'px';
}

function showModSubmenu(trigger) {
  document.querySelectorAll('.dd-submenu').forEach(d => d.remove());
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub1';
  const cats = [
    {key:'bj',       label:'🃏 Blackjack'},
    {key:'uth',      label:"♠ Hold'em"},
    {key:'cross',    label:'🔀 Cross-Game'},
    {key:'roulette', label:'🎡 Roulette'},
  ];
  sub.innerHTML = cats.map(c =>
    `<div class="dd-item" onclick="showModTypeSubmenu('${c.key}',this);event.stopPropagation()">${c.label} <span class="dd-key">►</span></div>`
  ).join('');
  _positionSubmenu(sub, trigger);
}

function showModTypeSubmenu(type, trigger) {
  document.querySelector('.dd-sub2')?.remove();
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub2';
  const mods = Object.entries(PRESET_MODIFIERS).filter(([, m]) => m.type === type);
  sub.innerHTML = mods.map(([k, m]) =>
    `<div class="dd-item" onclick="devApplyMod('${k}')">${m.title}</div>`
  ).join('');
  _positionSubmenu(sub, trigger);
}

function showModifiersSubmenu(trigger) {
  document.querySelectorAll('.dd-submenu').forEach(d => d.remove());
  const cats = [
    { key: 'bj',       label: '🃏 Blackjack' },
    { key: 'uth',      label: "♠ Hold'em" },
    { key: 'cross',    label: '🔀 Cross-Game' },
    { key: 'roulette', label: '🎡 Roulette' },
  ];
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub1';
  sub.innerHTML = cats.map(c =>
    `<div class="dd-item" onclick="showModifiersByType('${c.key}',this);event.stopPropagation()">${c.label} <span class="dd-key">►</span></div>`
  ).join('');
  _positionSubmenu(sub, trigger);
}

function showModifiersByType(type, trigger) {
  document.querySelector('.dd-sub2')?.remove();
  const mods = Object.entries(PRESET_MODIFIERS).filter(([, m]) => m.type === type);
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub2';
  sub.innerHTML = mods.map(([k, m]) =>
    `<div class="dd-item" onclick="showModifierPopup('${k}')">${m.title}</div>`
  ).join('');
  _positionSubmenu(sub, trigger);
}

function showModifierPopup(key) {
  document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
  const m = PRESET_MODIFIERS[key];
  if (!m) return;
  const existing = document.getElementById('info-modal');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'info-modal'; el.className = 'info-modal';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `<div class="info-box" style="padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--btn-f);color:var(--ink);font-size:1.7rem">✨ ${m.title}</div>
      <button onclick="document.getElementById('info-modal').remove()" style="background:none;border:none;color:var(--shadow);font-size:1.6rem;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div class="divider" style="margin-bottom:14px"></div>
    <div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${m.desc}</div>
    ${m.devNote ? `<div class="divider" style="margin:14px 0 10px"></div><div style="font-size:1rem;color:var(--shadow);line-height:1.5"><b>Dev Note:</b> ${m.devNote}</div>` : ''}
  </div>`;
  document.body.appendChild(el);
}

function toggleMenu(which, trigger) {
  const existing = document.querySelector('.dropdown');
  if (existing) {
    const wasThis = existing.dataset.menu === which;
    document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
    if (wasThis) return;
  }
  const rect = trigger.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'dropdown'; el.dataset.menu = which;

  if (which === 'dev') {
    el.innerHTML = `
      <div class="dd-item" onclick="devReset();document.querySelectorAll('.dropdown').forEach(d=>d.remove())">↺ Reset Run</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="goTo('bj');document.querySelectorAll('.dropdown').forEach(d=>d.remove())">→ Blackjack</div>
      <div class="dd-item" onclick="goTo('poker');document.querySelectorAll('.dropdown').forEach(d=>d.remove())">→ Hold'em</div>
      <div class="dd-item" onclick="goTo('roulette');document.querySelectorAll('.dropdown').forEach(d=>d.remove())">→ Roulette</div>
      <div class="dd-item" onclick="devSpin()">🎡 Spin Wheel</div>
      <div class="dd-item" onclick="goTo('results');document.querySelectorAll('.dropdown').forEach(d=>d.remove())">→ Results</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="S.chips+=500;render();updateChipDisplay();document.querySelectorAll('.dropdown').forEach(d=>d.remove())">+ 500 chips</div>
      <div class="dd-item" onclick="S.chips+=10000;render();updateChipDisplay();document.querySelectorAll('.dropdown').forEach(d=>d.remove())">+ 10,000 chips</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="toggleTestSeed();event.stopPropagation()" style="gap:12px">
        <span>Test Seed (reset to apply)</span>
        <input type="checkbox" id="dev-test-seed-cb" ${_testActive()?'checked':''} onclick="event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
      </div>
      <div class="dd-item" onclick="devToggleUnlocks();event.stopPropagation()" style="gap:12px">
        <span>All Unlocks</span>
        <input type="checkbox" id="dev-unlocks-cb" ${getPref('golden_back_unlocked')?'checked':''} onclick="event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
      </div>
      <div class="dd-sep"></div>
      <div class="dd-item" id="dd-mod-trigger" onclick="showModSubmenu(this);event.stopPropagation()">Force Modifier <span class="dd-key">►</span></div>`;
  } else if (which === 'file') {
    const canShare = S.screen === 'results';
    el.innerHTML = `
      <div class="dd-item dd-disabled">Gambdle #${S.day}</div>
      <div class="dd-sep"></div>
      <div class="dd-item ${canShare?'':'dd-disabled'}" onclick="${canShare?`doShare();document.querySelector('.dropdown')?.remove()`:''}">📋 Copy &amp; Share</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showPrefsSubmenu(this);event.stopPropagation()">Preferences <span class="dd-key">►</span></div>`;
  } else {
    el.innerHTML = `
      <div class="dd-item" onclick="showInfo('overview');document.querySelector('.dropdown')?.remove()">How to Play</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showInfo('bj');document.querySelector('.dropdown')?.remove()">🃏 Blackjack</div>
      <div class="dd-item" onclick="showInfo('uth');document.querySelector('.dropdown')?.remove()">♠ Ultimate Hold'em</div>
      <div class="dd-item" onclick="showInfo('roulette');document.querySelector('.dropdown')?.remove()">🎡 Roulette</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showInfo('hands');document.querySelector('.dropdown')?.remove()">🂡 Poker Hands</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showModifiersSubmenu(this);event.stopPropagation()">✨ Daily Modifiers <span class="dd-key">►</span></div>`;
  }

  // Position below the trigger, clamped to viewport
  const left = Math.min(rect.left, window.innerWidth - 200);
  el.style.left = left + 'px';
  el.style.top = rect.bottom + 'px';
  document.body.appendChild(el);
  setTimeout(() => document.addEventListener('click', () => { el.remove(); document.querySelectorAll('.dd-submenu').forEach(d=>d.remove()); }, {once:true}), 0);
}

// ─── PREFERENCES ─────────────────────────────────────
const PREFS_KEY='gambdle_prefs';
function getPrefs(){try{return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');}catch{return{};}}
function getPref(k){return getPrefs()[k];}
function setPref(k,v){const p=getPrefs();p[k]=v;localStorage.setItem(PREFS_KEY,JSON.stringify(p));}
function applyPrefs(){
  document.body.classList.toggle('four-color',!!getPref('four_color'));
  const cb=getPref('cardback')||'default';
  document.body.classList.toggle('cardback-gold',   cb==='gold'   && !!getPref('golden_back_unlocked'));
  document.body.classList.toggle('cardback-orange', cb==='orange' && !!getPref('orange_back_unlocked'));
  document.body.classList.toggle('cardback-whale',  cb==='whale'  && !!getPref('whale_back_unlocked'));
  const felt=getPref('felt')||'default';
  document.body.classList.toggle('felt-maroon', felt==='maroon' && !!getPref('maroon_felt_unlocked'));
  const deck=getPref('deck')||'default';
  document.body.classList.toggle('deck-emoji', deck==='emoji' && !!getPref('deck_emoji_unlocked'));
}

function _prefItem(key,id,label){
  const checked=!!getPref(key);
  return `<div class="dd-item" onclick="togglePref('${key}');event.stopPropagation()" style="gap:12px">
    <span>${label}</span>
    <input type="checkbox" id="${id}" ${checked?'checked':''} onclick="togglePref('${key}');event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
  </div>`;
}
function showPrefsSubmenu(trigger){
  document.querySelectorAll('.dd-submenu').forEach(d=>d.remove());
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub1';
  sub.innerHTML=_prefItem('four_color','pref-4color','Four Color Deck')+
                _prefItem('mute','pref-mute','Mute Audio')+
                `<div class="dd-item" onclick="showDeckSubmenu(this);event.stopPropagation()">Deck <span class="dd-key">►</span></div>`+
                `<div class="dd-item" onclick="showCardbackSubmenu(this);event.stopPropagation()">Card Back <span class="dd-key">►</span></div>`+
                `<div class="dd-item" onclick="showFeltSubmenu(this);event.stopPropagation()">Felt <span class="dd-key">►</span></div>`;
  _positionSubmenu(sub,trigger);
}
function showDeckSubmenu(trigger){
  document.querySelector('.dd-sub2')?.remove();
  const cur=getPref('deck')||'default';
  const emojiUnlocked=!!getPref('deck_emoji_unlocked');
  const cbStyle='width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;pointer-events:none';
  const row=(val,label)=>`<div class="dd-item" onclick="setDeck('${val}');event.stopPropagation()" style="gap:12px">
    <span>${label}</span><input type="checkbox" ${cur===val?'checked':''} style="${cbStyle}">
  </div>`;
  const locked=(label,hint)=>`<div class="dd-item dd-disabled" style="gap:12px"><span>${label}</span><span style="font-size:.8rem;opacity:.55">${hint}</span></div>`;
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub2';
  sub.innerHTML=
    row('default','Default')+
    (emojiUnlocked ? row('emoji','Emoji') : locked('Emoji','🔒 3500+'));
  _positionSubmenu(sub,trigger);
}
function setDeck(val){
  setPref('deck',val);
  applyPrefs();
  document.querySelectorAll('.dd-sub2').forEach(d=>d.remove());
  const t=document.querySelector('.dd-sub1 .dd-item:nth-last-child(3)');
  if(t) showDeckSubmenu(t);
}
function showCardbackSubmenu(trigger){
  document.querySelector('.dd-sub2')?.remove();
  const cur=getPref('cardback')||'default';
  const goldUnlocked=!!getPref('golden_back_unlocked');
  const whaleUnlocked=!!getPref('whale_back_unlocked');
  const cbStyle='width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;pointer-events:none';
  const row=(val,label)=>`<div class="dd-item" onclick="setCardback('${val}');event.stopPropagation()" style="gap:12px">
    <span>${label}</span><input type="checkbox" ${cur===val?'checked':''} style="${cbStyle}">
  </div>`;
  const locked=(label,hint)=>`<div class="dd-item dd-disabled" style="gap:12px"><span>${label}</span><span style="font-size:.8rem;opacity:.55">${hint}</span></div>`;
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub2';
  const orangeUnlocked=!!getPref('orange_back_unlocked');
  sub.innerHTML=
    row('default','Default')+
    (orangeUnlocked ? row('orange','Orange')      : locked('Orange','🔒 1500+'))+
    (whaleUnlocked  ? row('whale','Whale 🐋')     : locked('Whale 🐋','🔒 5000+'))+
    (goldUnlocked   ? row('gold','Golden')         : locked('Golden','🔒 10000+'));
  _positionSubmenu(sub,trigger);
}
function setCardback(val){
  setPref('cardback',val);
  applyPrefs();
  document.querySelectorAll('.dd-sub2').forEach(d=>d.remove());
  const t=document.querySelector('.dd-sub1 .dd-item:nth-last-child(2)');
  if(t) showCardbackSubmenu(t);
}
function showFeltSubmenu(trigger){
  document.querySelector('.dd-sub2')?.remove();
  const cur=getPref('felt')||'default';
  const maroonUnlocked=!!getPref('maroon_felt_unlocked');
  const cbStyle='width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;pointer-events:none';
  const row=(val,label)=>`<div class="dd-item" onclick="setFelt('${val}');event.stopPropagation()" style="gap:12px">
    <span>${label}</span><input type="checkbox" ${cur===val?'checked':''} style="${cbStyle}">
  </div>`;
  const locked=(label,hint)=>`<div class="dd-item dd-disabled" style="gap:12px"><span>${label}</span><span style="font-size:.8rem;opacity:.55">${hint}</span></div>`;
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub2';
  sub.innerHTML=
    row('default','Green')+
    (maroonUnlocked ? row('maroon','Maroon') : locked('Maroon','🔒 2500+'));
  _positionSubmenu(sub,trigger);
}
function setFelt(val){
  setPref('felt',val);
  applyPrefs();
  document.querySelectorAll('.dd-sub2').forEach(d=>d.remove());
  const t=document.querySelector('.dd-sub1 .dd-item:last-child');
  if(t) showFeltSubmenu(t);
}
function togglePref(k){
  document.querySelector('.dd-sub2')?.remove();
  setPref(k,!getPref(k));
  applyPrefs();
  const idMap={four_color:'pref-4color',mute:'pref-mute'};
  const cb=document.getElementById(idMap[k]);
  if(cb)cb.checked=!!getPref(k);
}

// ─── BOOT ────────────────────────────────────────────
loadState();
applyPrefs();
render();
