// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   POKER HAND EVALUATION: rankPoker (shared 5-card evaluator)
//   UTH / POKER STATE: resetUTHHand · per-hand deck slices
//   5-CARD POKER LOGIC: the partially built 'poker' game
//   ULTIMATE TEXAS HOLD'EM LOGIC: deal · raise/check/fold · blind + ante
//     pay tables · dealer qualify · showdown settlement
//   SCREEN RENDERING: screenUTH · screenPoker · uthPayTableHTML
// ───────────────────────────────────────────────────────────────────────────

// ─── POKER HAND EVALUATION ────────────────────────────────────────────────

// Standard video poker hand evaluator (Jacks or Better threshold).
function rankPoker(cs){
  const rs=cs.map(c=>c.r),ss=cs.map(c=>c.s),vs=cs.map(c=>cardNum(c.r));
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

// Numeric rank value for UTH hand comparison (Ace is always 14 here, unlike BJ where it flexes).
function cardNum(r){return({'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14})[r];}

// Scores a 5-card hand as (category * 1e12 + rank tiebreakers), so category always beats kickers.
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

  let ranks;
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

// Checks every five-card combination and returns the best. Despite the name it takes any
// hand size ≥ 5: 7 cards normally (21 combos), 8 under Triple Threat's third hole card (56).
function bestOf7(cards){
  let best=null,bs=-1,bc=0;
  const n=cards.length;
  for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){
    const five=[cards[a],cards[b],cards[c],cards[d],cards[e]];
    const{cat,score}=handScore(five);
    if(score>bs){bs=score;bc=cat;best=five;}
  }
  return{cards:best,score:bs,cat:bc,rank:rankPoker(best)};
}

// Blind bonus payout: cat is the hand category (9=Royal Flush … 0=High Card).
// Base amounts match the standard UTH blind paytable; boost/extended come from modifiers.
function uthBlindDelta(cat,blind,mods={extended:getMod('uth_blind_extended'),boost:getMod('uth_blind_boost')||1}){
  const extended=mods.extended;
  const boost=mods.boost||1;
  let base=0;
  if(cat===9)base=blind*500;       // Royal Flush
  else if(cat===8)base=blind*50;   // Straight Flush
  else if(cat===7)base=blind*10;   // Four of a Kind
  else if(cat===6)base=blind*3;    // Full House
  else if(cat===5)base=blind*1.5;  // Flush
  else if(cat===4)base=blind;      // Straight
  else if(extended&&cat===3)base=blind;          // Three of a Kind (extended only)
  else if(extended&&cat===2)base=blind*0.5;      // Two Pair (extended only)
  return Math.ceil(base*boost);
}

// Blind pay-table rows: [name, hand-category (null = the "below" push row), fallback ratio].
// Shared by the bet-screen render and the surgical chip-insert patch so both stay in sync.
function _uthPayRows(){
  const ext=getMod('uth_blind_extended');
  // cat=9 Royal, 8 SF, 7 Quads, 6 Full, 5 Flush, 4 Straight; ext also 3 ToK, 2 TwoPair
  const rows=[['Royal Flush',9,'500x'],['Straight Flush',8,'50x'],['Four of a Kind',7,'10x'],['Full House',6,'3x'],['Flush',5,'3:2'],['Straight',4,'1x']];
  if(ext){rows.push(['Three of a Kind',3,'1:1']);rows.push(['Two Pair',2,'1:2']);}
  rows.push(['< '+(ext?'Two Pair':'Straight'),null,'Push']);
  return rows;
}
// Pay-table body: once a blind is staked, show the actual chip payout per hand; otherwise the ratio.
function uthPayTableHTML(blind){
  return _uthPayRows().map(([n,cat,ratio])=>{
    const display=(blind>0&&cat!==null)?cfmtK(uthBlindDelta(cat,blind)):ratio;
    return `<span class="pname">${n}</span><span class="ppay">${display}</span>`;
  }).join('');
}
function uthPayTableHead(blind){ return `Blind Pay Table${blind>0?` · ${cfmtK(blind)} chips`:''}`; }

// ─── UTH / POKER STATE ───────────────────────────────────────────────────
const UTH_CARD_START_MS    = 300;  // delay before first community card animates in
const UTH_CARD_INTERVAL_MS = 400;  // stagger between each community card
// Total reveal duration: UTH_CARD_START_MS + (5 cards × UTH_CARD_INTERVAL_MS) = 2300ms
const UTH_REVEAL_TOTAL_MS  = UTH_CARD_START_MS + 5 * UTH_CARD_INTERVAL_MS;


function resetUTHHand(){
  S.uthAnte=0; S.uthPhase='bet'; S.uthPlay=0; S.uthPlayMult=0;
  S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[];
  S.uthRevealComm=0; S.uthPrevRevealComm=0;
}
GAMES.uth.reset = resetUTHHand; GAMES.uth.screen = screenUTH; // register this game's fns into the Game registry (defined in this file; core.js loads first)
// Game-specific bet-UI patch (dispatched by patchBetUI): keep the stake summary + blind pay table in
// step with the staked Ante · Blind split as the bet changes.
GAMES.uth.patchBet = function(bet){
  const us=document.getElementById('uth-summary');
  if(!us) return;
  // Match the render's split: ante rounds up, blind rounds down (see _uthAntePortion/_uthBlindPortion).
  const ante=Math.ceil(bet/2), blind=Math.floor(bet/2);
  us.innerHTML = `Ante <b style="color:var(--gold)">${cfmtK(ante)}</b> + Blind <b style="color:var(--gold)">${cfmtK(blind)}</b> = <b style="color:var(--ink)">${cfmtK(bet)}</b> chips total`;
  const pt=document.getElementById('uth-ptable');
  if(pt) pt.innerHTML = uthPayTableHTML(blind);
  const pth=document.getElementById('uth-pt-head');
  if(pth) pth.innerHTML = uthPayTableHead(blind);
};
// Refresh landed mid-reveal: settle to the result panel after a beat, mirroring the live reveal timer.
GAMES.uth.resume = function(){
  if(S.uthPhase!=='reveal') return;
  setTimeout(() => {
    _noAnim = true; S.uthPhase = 'result'; render(); updateChipDisplay();
    const last = S.uthHistory[S.uthHistory.length - 1];
    if (last && last.delta > 0) setTimeout(sndBigWin, UTH_CARD_INTERVAL_MS);
  }, 300);
};

/** Skip the current UTH hand (all_in_or_skip modifier). Records delta 0 and advances. */
function uthSkip(){ txLog({g:'uth',a:'skip',h:S.uthHand}); _skipHand(S.uthHistory,{ante:0,blind:0,play:0,playMult:0,result:'skip',delta:0},'uthHand',NEXT_SCREEN['uth'],resetUTHHand); }

/** Skip the current poker hand (all_in_or_skip modifier). Records delta 0 and advances. */
function pkSkip(){ txLog({g:'pk',a:'skip',h:S.pkHand}); _skipHand(S.pkHistory,{bet:0,result:'skip',pts:0,delta:0},'pkHand',NEXT_SCREEN['poker'],()=>{S.pkBet=0;S.pkPhase='bet';}); }

// ─── 5-CARD POKER LOGIC ──────────────────────────────────────────────────

/** Initial deal for 5-Card Draw Poker. */
function pkDeal(){
  if(!S.pkBet||S.pkPhase!=='bet')return;
  S.pkPhase='dealing'; // lock immediately
  debit(S.pkBet,'pk-deal');
  txLog({g:'pk',a:'deal',h:S.pkHand,bet:S.pkBet});
  S.pkCards=DEAL.pokerDecks[S.pkHand].slice(0,5);
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
  // Idempotency guard (see _resolveRoulette): draw/settle exactly once. A double-tap on "Draw
  // Cards" must not credit the payout and push a second history entry twice. Only runs from the
  // 'hold' phase and flips to 'draw' below, so a duplicate call bails.
  if(S.pkPhase!=='hold')return;
  txLog({g:'pk',a:'draw',h:S.pkHand,held:[...S.pkHeld].sort((a,b)=>a-b)});
  const draw=DEAL.pokerDecks[S.pkHand].slice(5);let di=0;
  S.pkFinal=S.pkCards.map((c,i)=>S.pkHeld.has(i)?c:draw[di++]);
  const res=rankPoker(S.pkFinal);
  const wm=winMult();
  const profit=res.p>0?S.pkBet*res.p*wm:0;
  const delta=res.p>0?profit:-S.pkBet;
  if(res.p>0)credit(S.pkBet+profit,'pk-win');
  S.pkHistory.push(mkRound('pk',delta,res.n,{bet:S.pkBet,pts:res.p}));
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
GAMES.poker.reset = () => { S.pkBet=0; S.pkPhase='bet'; }; GAMES.poker.screen = screenPoker; // 5-Card Poker has no dedicated file; its registry slots live here
// Refresh landed mid-draw: bump the hand counter and show the result panel.
GAMES.poker.resume = function(){
  if(S.pkPhase!=='draw') return;
  setTimeout(() => { S.pkHand++; S.pkPhase = 'result'; render(); }, 300);
};
function pkNext(){ _nextHand(GAMES.poker.reset); }

// ─── ULTIMATE TEXAS HOLD'EM LOGIC ────────────────────────────────────────

/** Initial deal for UTH: Player cards, Dealer cards (hidden), and Community cards (hidden). */
function uthDeal(){
  if(!S.uthAnte||S.uthPhase!=='bet')return;
  S.uthPhase='dealing'; // lock immediately so bet controls can't mutate S.uthAnte during sndShuffle
  debit(S.uthAnte,'uth-deal');
  txLog({g:'uth',a:'deal',h:S.uthHand,ante:S.uthAnte});
  if(getMod('uth_pocket_aces')){
    // +1 so hand 0 doesn't reuse the exact daily seed; *97 (prime) spaces hand seeds apart to avoid collisions.
    const hr=mkRng(getRngSeed()+(S.uthHand+1)*97);
    const d=shuffle(buildDeck(),hr);
    const aces=[],rest=[];
    for(const c of d)(c.r==='A'&&aces.length<2?aces:rest).push(c);
    S.uthHole=aces;
    S.uthDealer=[rest[0],rest[1]];
    S.uthComm=rest.slice(2,7);
  }else{
    const dk=DEAL.uthDeck,off=S.uthHand*9;
    S.uthHole=[dk[off],dk[off+1]];
    // Triple Threat's third hole card comes from the deck's unused tail (27+), the same region
    // Time Travel re-deals from. The two mods never run on the same day, so no collision; and
    // the per-hand 9-card layout stays untouched, so test card overrides keep working.
    if(getMod('uth_three_hole'))S.uthHole.push(dk[27+S.uthHand]);
    S.uthDealer=[dk[off+2],dk[off+3]];
    S.uthComm=[dk[off+4],dk[off+5],dk[off+6],dk[off+7],dk[off+8]];
  }
  S.uthRaised=false;S.uthFolded=false;S.uthPlay=0;S.uthPlayMult=0;
  S.uthRevealComm=0;S.uthPrevRevealComm=0;
  const db=document.getElementById('db');if(db)db.disabled=true;
  sndShuffle(()=>{
    S.uthPhase='preflop';
    render(); updateChipDisplay();
    sndCard(100);sndCard(500);
    if(S.uthHole.length>2)sndCard(900);
  });
}
// Reveal the first 3 community cards (flop). Sounds staggered to match card-flip animation.
function _uthDealFlop(){
  S.uthPrevRevealComm=0;S.uthRevealComm=3;S.uthPhase='flop';
  updateUthCommunityCards();
}

// Whether community card i should be face-up. Cards reveal left-to-right by uthRevealComm;
// River Monster additionally shows the river (index 4) from the start, before any street.
function _uthCommShown(i){ return i < S.uthRevealComm || (getMod('uth_river_monster')===true && i===4); }
// Reveal community cards 4 and 5 (turn + river combined).
function _uthDealTurn(){
  S.uthPrevRevealComm=3;S.uthRevealComm=5;S.uthPhase='turn';
  updateUthCommunityCards();
}

// Time Travel button — mirrors the dealer-peek button (same shape/position) but with a blue glow.
// Offered once per day, only during the flop or turn decision (a street must be on the board to re-deal).
function timeTravelBtnHTML(){
  if(!getMod('uth_time_travel')||S.timeTravelUsed) return '';
  if(S.uthPhase!=='flop'&&S.uthPhase!=='turn') return '';
  return `<div id="tt-btn-wrap"><button class="btn-timetravel-glow" onclick="doTimeTravel()" style="background:rgba(43,127,255,.12);border:1.5px solid rgba(90,160,255,.55);color:#9cc4ff;padding:11px 20px;border-radius:8px;font-size:1.25rem;font-weight:700;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;line-height:1.15;white-space:nowrap">⏳ Re-deal<span style="display:block;font-size:.78rem;font-weight:400;opacity:.7;letter-spacing:.04em">1 left today</span></button></div>`;
}

// Re-deal the just-revealed street once per day. Replacement cards come from the unused tail of
// DEAL.uthDeck (indices 27+), which no hand touches, so they can never duplicate a card in play.
function doTimeTravel(){
  if(!getMod('uth_time_travel')||S.timeTravelUsed) return;
  if(S.uthPhase!=='flop'&&S.uthPhase!=='turn') return;
  txLog({g:'uth',a:'timetravel',h:S.uthHand,st:S.uthPhase}); // re-deals cards, so replay needs it
  S.timeTravelUsed=true;
  let ptr=S.uthRedealPtr;
  if(S.uthPhase==='flop'){
    for(let i=0;i<3;i++) S.uthComm[i]=DEAL.uthDeck[ptr++];
    S.uthPrevRevealComm=0;S.uthRevealComm=3;
  }else{ // turn — re-deal the turn + river cards (indices 3 and 4)
    S.uthComm[3]=DEAL.uthDeck[ptr++];S.uthComm[4]=DEAL.uthDeck[ptr++];
    S.uthPrevRevealComm=3;S.uthRevealComm=5;
  }
  S.uthRedealPtr=ptr;
  const btn=document.getElementById('tt-btn-wrap');if(btn)btn.style.display='none';
  saveState();
  updateUthCommunityCards();
}
// Split uthAnte into whole-chip portions. Ante gets the extra chip on odd totals
// so a 25-chip ante becomes ante 13 + blind 12 (sum still 25), and no half-chips
// ever surface in displays, multipliers, or settlement math.
function _uthAntePortion(){  return Math.ceil(S.uthAnte/2); }
function _uthBlindPortion(){ return Math.floor(S.uthAnte/2); }

// Compact one-line stake breakdown shown in the bet inlay box on the play/reveal screens:
// "Ante 125 · Blind 125" (· Raise N once the player has raised). fmtK keeps it on one line at
// any size. Patched in place via #uth-bet-inlay on each street change (updateUthCommunityCards).
function uthBetSummary(){
  const part=(lbl,v)=>`${lbl} <b style="color:var(--gold)">${cfmtK(v)}</b>`;
  let s=`${part('Ante',_uthAntePortion())} · ${part('Blind',_uthBlindPortion())}`;
  if(S.uthPlay>0) s+=` · ${part('Raise',S.uthPlay)}`;
  return s;
}

function uthRaise(mult){
  const bet=_uthAntePortion()*mult;
  if(S.chips<bet)return;
  txLog({g:'uth',a:'raise',h:S.uthHand,mult,st:S.uthPhase});
  debit(bet,'uth-raise');S.uthPlay=bet;S.uthPlayMult=mult;S.uthRaised=true;
  sndChip();
  if(S.uthPhase==='preflop'){_uthDealFlop();updateChipDisplay();}
  else if(S.uthPhase==='flop'){_uthDealTurn();updateChipDisplay();}
  else if(S.uthPhase==='turn'){uthResolve();}
}
function uthCheck(){
  if(S.uthPhase!=='preflop'&&S.uthPhase!=='flop')return;
  txLog({g:'uth',a:'check',h:S.uthHand,st:S.uthPhase});
  if(S.uthPhase==='preflop') _uthDealFlop();
  else _uthDealTurn();
}
function uthNextStreet(){
  if(S.uthPhase==='flop') _uthDealTurn();
  else if(S.uthPhase==='turn') uthResolve();
}
function uthFold(){
  // Idempotency guard (see _resolveRoulette): a double-tap on Fold must not push the loss twice
  // or advance the hand counter twice. uthFolded is reset per hand by resetUTHHand/uthDeal.
  if(S.uthFolded)return;
  txLog({g:'uth',a:'fold',h:S.uthHand,st:S.uthPhase});
  S.uthFolded=true;
  const ante=_uthAntePortion(),blind=_uthBlindPortion();
  S.uthHistory.push(mkRound('uth',-(ante+blind),'fold',{ante,blind,play:0,playMult:0,anteDelta:-ante,blindDelta:-blind,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:false}));
  S.uthHand++;S.uthPhase='reveal';
  updateUthCommunityCards();
  setTimeout(()=>{_noAnim=true;S.uthPhase='result';render();updateChipDisplay();},2300);
}
// Settles the UTH hand: three independent payouts (play, ante, blind) each have their own rules.
// Play: 1:1 if player wins. Ante: 1:1 only if dealer qualifies. Blind: paytable if Straight+.
// Pure UTH Resolver: the three-way ante/blind/play settlement. PURE — bestOf7 results (`pb`/`db`,
// each {cat, score}), the three stakes, and the resolved mods in; the per-leg deltas + net + result
// out. No S, no DOM, no credit. The caller credits each leg (the stake was debited at deal/raise) and
// records. mods: { wm, doublePlay, hardQualify, blindExtended, blindBoost }.
function resolveUTH(pb, db, ante, blind, play, mods){
  const dealerQualifies = db.cat >= (mods.hardQualify ? 2 : 1);
  const cmp = pb.score - db.score;
  const wm = mods.wm;
  let anteDelta=0, blindDelta=0, playDelta=0;
  if(cmp>0){
    const playMult = mods.doublePlay ? 2 : 1;
    playDelta = play*playMult*wm;
    anteDelta = dealerQualifies ? ante*wm : 0;
    blindDelta = uthBlindDelta(pb.cat, blind, {extended:mods.blindExtended, boost:mods.blindBoost}) * wm;
  }else if(cmp===0){
    anteDelta=0; blindDelta=0; playDelta=0;
  }else{
    playDelta=-play; anteDelta=-ante; blindDelta=-blind;
  }
  const delta = anteDelta+blindDelta+playDelta;
  return { anteDelta, blindDelta, playDelta, delta, dealerQualifies, result: cmp>0?'win':cmp===0?'push':'lose' };
}

function uthResolve(){
  // Idempotency guard (see _resolveRoulette): settle a hand exactly once. A double-tap on the
  // resolving action or a stray call must not credit the three payouts and push a second history
  // entry twice. Only ever runs from the 'turn' phase and flips to 'reveal' below, so bail otherwise.
  if(S.uthPhase!=='turn')return;
  const ante=_uthAntePortion(),blind=_uthBlindPortion(),play=S.uthPlay;
  const pb=bestOf7([...S.uthHole,...S.uthComm]);
  const db2=bestOf7([...S.uthDealer,...S.uthComm]);
  const {anteDelta,blindDelta,playDelta,delta,dealerQualifies,result}=resolveUTH(pb,db2,ante,blind,play,{
    wm:winMult(), doublePlay:!!getMod('uth_double_play'), hardQualify:!!getMod('uth_hard_qualify'),
    blindExtended:getMod('uth_blind_extended'), blindBoost:getMod('uth_blind_boost')||1,
  });
  // Apply chips per leg (stake debited at deal/raise). Win: return each stake + profit; the ante
  // pushes (stake back, no profit) when the dealer doesn't qualify. A tie returns all three stakes;
  // a loss keeps nothing. Same credits/reasons as before — only the delta math moved into resolveUTH.
  if(result==='win'){
    credit(play+playDelta,'uth-play');
    if(dealerQualifies)credit(ante+anteDelta,'uth-ante'); else credit(ante,'uth-ante-push');
    credit(blind+blindDelta,'uth-blind');
  }else if(result==='push'){
    credit(ante+blind+play,'uth-push');
  }
  S.uthHistory.push(mkRound('uth',delta,result,{ante,blind,play,playMult:S.uthPlayMult,anteDelta,blindDelta,playDelta,playerBest:pb,dealerBest:db2,dealerQualifies}));
  S.uthHand++;S.uthPhase='reveal';
  S.uthRevealComm=5;
  updateUthCommunityCards();
  setTimeout(()=>{_noAnim=true;S.uthPhase='result';render();updateChipDisplay();if(delta>0)setTimeout(sndBigWin,UTH_CARD_INTERVAL_MS);},UTH_REVEAL_TOTAL_MS);
}
function uthNext(){ _nextHand(resetUTHHand); }

// Surgically animates only the newly revealed community cards (uthPrevRevealComm → uthRevealComm).
// Also updates the action UI and progress dots after the animation finishes.
function updateUthCommunityCards() {
  const t = patchOrRender(['uth-community-hand', 'uth-dealer-hand'], null, { noAnim: true });
  if (!t) return; // patchOrRender already fell back to a full render
  const [commHand, dealerHand] = t;

  // The bet inlay box persists across streets (no full render mid-hand), so refresh its stake
  // breakdown here — this is when a just-locked Raise should join the Ante · Blind line.
  const betInlayEl = document.getElementById('uth-bet-inlay');
  if (betInlayEl) betInlayEl.innerHTML = uthBetSummary();

  const hdrSub = document.getElementById('hdr-sub');
  if (hdrSub) {
    if (S.uthPhase === 'reveal') hdrSub.textContent = "Ultimate Texas Hold'em · Dealer Reveals";
    else if (S.uthPhase === 'result') hdrSub.textContent = "Ultimate Texas Hold'em · Showdown";
  }

  const actionUi = document.getElementById('uth-actions-ui');
  if (actionUi) {
    actionUi.style.pointerEvents = 'none';
    actionUi.querySelectorAll('button').forEach(b => {
      b.disabled = true;
      b.style.color = 'transparent';
    });
  }

  const startDelay = UTH_CARD_START_MS;
  const interval = UTH_CARD_INTERVAL_MS;
  let revealedCount = 0;

  for (let i = S.uthPrevRevealComm; i < S.uthRevealComm; i++) {
    if (getMod('uth_river_monster') && i === 4) continue; // river is already face-up from the deal
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

  if (S.uthPhase === 'reveal') {
    const dSec = document.getElementById('uth-dealer-sec');
    if (dSec) dSec.textContent = 'Dealer';
    setTimeout(() => sndCard(), startDelay + 100);
    setTimeout(() => sndCard(), startDelay + 1000);
    dealerHand.innerHTML = renderCards(S.uthDealer,'md',0,0.9,0.1);
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
        if (S.uthPhase === 'flop') { const r2=_uthAntePortion()*2; actionUi.innerHTML = `<div id="uth-action-btns" class="act-btns"><button class="act-btn" onclick="uthRaise(2)" ${S.chips < r2 ? 'disabled' : ''}>Raise 2× (${cfmt(r2)})</button><button class="act-btn" onclick="uthCheck()">Check</button></div>`; }
        else if (S.uthPhase === 'turn') { const r1=_uthAntePortion(); actionUi.innerHTML = `<div id="uth-action-btns" class="act-btns"><button class="act-btn" onclick="uthRaise(1)" ${S.chips < r1 ? 'disabled' : ''}>Raise 1× (${cfmt(r1)})</button><button class="act-btn" style="color:var(--lose);border-color:rgba(196,48,48,.4)" onclick="uthFold()">Fold</button></div>`; }
      }
      // The dealer row isn't re-rendered on a street change, so the phase-gated Time Travel button
      // must be injected here when the flop/turn lands (it returns '' when used or off, a safe no-op).
      const dRow = document.querySelector('.dealer-hand-row');
      if (dRow && !document.getElementById('tt-btn-wrap')) dRow.insertAdjacentHTML('beforeend', timeTravelBtnHTML());
    }
  }, finishDelay);

  saveState();
}

// Returns a parenthetical like "(Aces and Fives)" or "(Kings-high)" for same-category disambiguation.
function handDetail(cards, cat) {
  const PL={2:'Twos',3:'Threes',4:'Fours',5:'Fives',6:'Sixes',7:'Sevens',8:'Eights',9:'Nines',10:'Tens',11:'Jacks',12:'Queens',13:'Kings',14:'Aces'};
  const SG={2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine',10:'Ten',11:'Jack',12:'Queen',13:'King',14:'Ace'};
  const ns=cards.map(c=>cardNum(c.r));
  const rc={};for(const n of ns)rc[n]=(rc[n]||0)+1;
  const grp=Object.entries(rc).map(([n,c])=>[+n,c]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const sv=[...ns].sort((a,b)=>a-b);
  if(cat===7)return`(${PL[grp[0][0]]})`;
  if(cat===6)return`(${PL[grp[0][0]]} full of ${PL[grp[1][0]]})`;
  if(cat===5)return`(${SG[sv[4]]}-high)`;
  if(cat===4){const sh=sv.join(',')===`2,3,4,5,14`?5:sv[4];return`(${SG[sh]}-high)`;}
  if(cat===3)return`(${PL[grp[0][0]]})`;
  if(cat===2)return`(${PL[grp[0][0]]} and ${PL[grp[1][0]]})`;
  if(cat===1)return`(${PL[grp[0][0]]})`;
  if(cat===0)return`(${SG[sv[4]]}-high)`;
  return'';
}

// ─── SCREEN RENDERING ────────────────────────────────────────────────────

function screenPoker(){
  const ph=S.pkPhase;
  if(ph==='bet'){
    const aios=getMod('all_in_or_skip');
    return `${hdr('5 Card Poker · Hand '+(S.pkHand+1)+' of 3')}
    <div class="panel">
      ${gameDots(S.pkHistory,S.pkHand,S.pkPhase)}
      <div class="divider"></div>
      ${aios
        ?`<div class="sec" style="text-align:center"><span class="sec-game-prefix">5 Card Poker · </span>All In or Skip · Wins Pay 2×</div>
          ${aiosRow('allIn();pkDeal()', 'pkSkip()')}`
        :`<div class="sec" style="text-align:center"><span class="sec-game-prefix">5 Card Poker · </span>Place Your Bet</div>
          ${chipSel(S.chips,S.pkBet)}
          <button id="db" class="btn-gold" style="margin-top:12px" onclick="pkDeal()" ${S.pkBet===0?'disabled':''}>Deal ${icon('shuffle',{cls:'btn-icon-gap'})}</button>
          <div class="divider"></div>
          <div class="sec">Paytable</div>
          <div class="ptable">${[['Royal Flush','800x'],['Straight Flush','50x'],['Four of a Kind','25x'],['Full House','9x'],['Flush','6x'],['Straight','4x'],['Three of a Kind','3x'],['Two Pair','2x'],['Jacks or Better','1x']].map(([n,p])=>`<span class="pname">${n}</span><span class="ppay">${p}</span>`).join('')}</div>`}
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
      <button class="btn-gold" style="margin-top:12px" onclick="pkDraw()">Draw Cards →</button>
      <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${cfmt(S.pkBet)} chips</span></div>
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
      <button class="btn-gold" style="margin-top:12px;opacity:.35" disabled>Drawing…</button>
      <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${cfmt(S.pkBet)} chips</span></div>
    </div>`;
  }
  // result
  const h=S.pkHistory[S.pkHand-1], res=rankPoker(S.pkFinal);
  const {text:btnText, action:btnAction} = resultAdvanceBtn(S.pkHand>=3, NEXT_SCREEN['poker'], 'pkNext()');

  return `${hdr('5 Card Poker · Result')}
  <div class="panel" style="text-align:center">
    ${gameDots(S.pkHistory,S.pkHand,S.pkPhase)}
    <div class="divider"></div>
    <div class="result-hl" style="color:${col(h.delta)}">${h.delta>0?'You Win!':h.delta<0?'You Lose!':'Push'}</div>
    <div style="font-family:var(--btn-f);font-size:1.1rem;color:var(--gold);margin-bottom:2px">${res.n}</div>
    <div class="result-sub" style="color:${col(h.delta)}">${csign(h.delta)} chips</div>
    <div class="sec sec-sm">Your Hand</div>
    <div class="hand" style="margin-bottom:12px">
      ${S.pkFinal.map((c,i)=>{const isNew=!S.pkHeld.has(i);return cardHTML(c,'md',isNew?'box-shadow:0 0 0 2px var(--gold-hi),2px 3px 10px rgba(0,0,0,.5)':'',isNew?0.04+i*0.05:0);}).join('')}
    </div>
    ${gameControls(betInlay('Total', cfmt(S.chips)), `<button class="btn-gold" onclick="${btnAction}">${btnText}</button>`)}
  </div>`;
}

function screenUTH(){
  const ph=S.uthPhase;
  const CAT_NAMES=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

  if(ph==='bet'){
    const maxAnte=S.chips;
    const aios=getMod('all_in_or_skip');
    // Pay table box with its caption hugging right below it (the .uth-pt-wrap group), inside a flex:1
    // spacer that mirrors the BJ bet table: it eats the panel slack so the chip selector + Deal button
    // land exactly where Blackjack puts them, and centres the box-group in whatever slack exists.
    const center=`<div class="uth-bet-center">
            <div class="uth-pt-wrap">
              <div id="uth-ptable" class="ptable">${uthPayTableHTML(_uthBlindPortion())}</div>
              <div id="uth-pt-head" class="sec">${uthPayTableHead(_uthBlindPortion())}</div>
            </div>
          </div>`;
    // The Ante+Blind+total summary lives inside the bet box (replacing the plain "Bet" readout);
    // keep id="uth-summary" so patchBetUI can live-update it and the bet-screen CSS hook still matches.
    const betSummary=`<div id="uth-summary" class="uth-bet-sum">Ante <b style="color:var(--gold)">${cfmtK(_uthAntePortion())}</b> + Blind <b style="color:var(--gold)">${cfmtK(_uthBlindPortion())}</b> = <b style="color:var(--ink)">${cfmtK(S.uthAnte)}</b> chips</div>`;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${aios
        ?`<div class="sec" style="text-align:center"><span class="sec-game-prefix">Hold'em · </span>All In or Skip · Wins Pay 2×</div>
          ${center}
          ${aiosRow('S.uthAnte=S.chips;uthDeal()', 'uthSkip()')}`
        :`<div class="sec" style="text-align:center"><span class="sec-game-prefix">Hold'em · </span>Place Bet (Ante + Blind)</div>
          ${center}
          ${chipSel(maxAnte,S.uthAnte,[10,25,50,100,250,500,1000],'',betSummary)}
          <button id="db" class="btn-gold" style="margin-top:6px" onclick="uthDeal()" ${S.uthAnte===0?'disabled':''}>Deal ${icon('shuffle',{cls:'btn-icon-gap'})}</button>`}
    </div>`;
  }

  const commRow=()=>`<div id="uth-community-container" style="text-align:center">
    <div class="sec">Community Cards</div>
    <div id="uth-community-hand" class="hand">${[0,1,2,3,4].map(i=>{
      // Count-revealed cards animate when freshly dealt; River Monster's river (i=4) is shown
      // face-up from the start but is not count-revealed, so it stays static (isNew=false).
      const countShown=i<S.uthRevealComm;
      if(countShown||(getMod('uth_river_monster')&&i===4)){
        const isNew=countShown&&i>=S.uthPrevRevealComm;
        return cardHTML(S.uthComm[i],'sm','',isNew?0.05+(i-S.uthPrevRevealComm)*0.12:0,isNew);
      }
      return cardHTML('back','sm','',0,false);
    }).join('')}</div>
  </div>`;

  const playerRow=(anim=false)=>`<div style="text-align:center">
    <div class="sec">Your Hand</div>
    <div class="hand">${renderCards(S.uthHole,'md',anim?0:ANIM_NONE,0.2,0.05)}</div>
  </div>`;

  const dealerRow=(reveal=false)=>`<div id="uth-dealer-container" style="text-align:center">
    <div id="uth-dealer-sec" class="sec">${reveal?'Dealer':peekRevealed()?`Dealer · <span style="color:var(--gold-hi);font-size:.7rem">${icon('eye')} Peeked</span>`:'Dealer (Face Down)'}</div>
    <div class="dealer-hand-row">
      <div id="uth-dealer-hand" class="hand">${reveal
        ?renderCards(S.uthDealer,'md',0,0.9,0.1)
        :[0,1].map((_,i)=>i===0&&peekRevealed()?cardHTML(S.uthDealer[0],'md','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','md')).join('')}</div>
      ${reveal?'':peekBtnHTML()}${reveal?'':timeTravelBtnHTML()}
    </div>
  </div>`;

  // Bottom control cluster: the stake-breakdown inlay box stacked above the per-street action
  // buttons (kept in #uth-actions-ui for the surgical street-change updates).
  const uthControls=(actionsInner)=>gameControls(
    betInlaySum(uthBetSummary(),'uth-bet-inlay'),
    `<div id="uth-actions-ui">${actionsInner}</div>`);

  if(ph==='preflop'){
    const r4Cost=_uthAntePortion()*4, r3Cost=_uthAntePortion()*3;
    const canR4=S.chips>=r4Cost, canR3=S.chips>=r3Cost;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(true)}
      <div class="divider"></div>
      ${uthControls(`<div id="uth-action-btns" class="act-btns">
          <button class="act-btn" onclick="uthRaise(4)" ${canR4?'':'disabled'}>Raise 4× (${cfmt(r4Cost)})</button>
          <button class="act-btn" onclick="uthRaise(3)" ${canR3?'':'disabled'}>Raise 3× (${cfmt(r3Cost)})</button>
          <button class="act-btn" onclick="uthCheck()">Check</button>
        </div>`)}
    </div>`;
  }

  if(ph==='flop'){
    const canR2=S.chips>=S.uthAnte;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(false)}
      <div class="divider"></div>
      ${uthControls(S.uthRaised ? `<button class="btn-gold" onclick="uthNextStreet()">See Turn &amp; River →</button>` : `
          <div id="uth-action-btns" class="act-btns">
            <button class="act-btn" onclick="uthRaise(2)" ${canR2?'':'disabled'}>Raise 2× (${cfmt(S.uthAnte)})</button>
            <button class="act-btn" onclick="uthCheck()">Check</button>
          </div>`)}
    </div>`;
  }

  if(ph==='turn'){
    const canR1=S.chips>=_uthAntePortion();
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      <div class="divider"></div>
      ${commRow()}
      <div class="divider"></div>
      ${playerRow(false)}
      <div class="divider"></div>
      ${uthControls(S.uthRaised ? `<button class="btn-gold" onclick="uthNextStreet()">→ Showdown</button>` : `
          <div id="uth-action-btns" class="act-btns">
            <button class="act-btn" onclick="uthRaise(1)" ${canR1?'':'disabled'}>Raise 1× (${cfmt(_uthAntePortion())})</button>
            <button class="act-btn" style="color:var(--lose);border-color:rgba(196,48,48,.4)" onclick="uthFold()">Fold</button>
          </div>`)}
    </div>`;
  }

  if(ph==='reveal'){
    return `${hdr("Ultimate Texas Hold'em · Dealer Reveals")}
    <div class="panel">
      <div id="uth-dots-container">${gameDots(S.uthHistory.slice(0,-1),S.uthHand-1,'reveal')}</div>
      <div class="divider"></div>
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;margin-bottom:12px">
        <div>
          <div class="sec sec-sm">Dealer</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthDealer,'md',0,0.9,0.1)}</div>
        </div>
        ${commRow()}
        <div class="gold-divider"></div>
        <div>
          <div class="sec sec-sm">Your Hand</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthHole,'md')}</div>
        </div>
      </div>
      ${gameControls(betInlaySum(uthBetSummary(),'uth-bet-inlay'), '')}
    </div>`;
  }

  // result
  const hist=S.uthHistory[S.uthHand-1];
  if(!hist)return'';
  const {text:btnText, action:btnAction} = resultAdvanceBtn(S.uthHand>=3, NEXT_SCREEN['uth'], 'uthNext()');

  if(hist.result==='fold'){
    const dealerBest=bestOf7([...S.uthDealer,...S.uthComm]);
    const playerBest=bestOf7([...S.uthHole,...S.uthComm]);
    const foldSameRank=dealerBest.cat===playerBest.cat;
    const foldDbDetail=foldSameRank?' '+handDetail(dealerBest.cards,dealerBest.cat):'';
    const foldPbDetail=foldSameRank?' '+handDetail(playerBest.cards,playerBest.cat):'';
    return `${hdr("Ultimate Texas Hold'em · Folded")}
    <div class="panel uth-result-panel" style="text-align:center">
      ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
      <div class="divider"></div>
      <div class="result-hl" style="color:var(--lose)">You Folded</div>
      <div class="result-sub" style="color:var(--lose)">${csign(hist.delta)} chips</div>
      <div class="uth-cards-col">
        <div>
          <div class="sec sec-sm">Dealer's Hand</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthDealer,'md')}</div>
          <div class="uth-hand-name" style="font-size:1.3rem;color:var(--gold-hi);margin-top:3px">${CAT_NAMES[dealerBest.cat]}${foldDbDetail}</div>
        </div>
        <div class="divider" style="width:100%;margin:10px 0"></div>
        ${commRow()}
        <div class="divider" style="width:100%;margin:10px 0"></div>
        <div>
          <div class="sec sec-sm">Your Hand (Folded)</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthHole,'md')}</div>
          <div class="uth-hand-name" style="font-size:1.3rem;color:var(--shadow);margin-top:3px">${CAT_NAMES[playerBest.cat]}${foldPbDetail}</div>
        </div>
      </div>
      ${gameControls(betInlay('Total', cfmt(S.chips)), `<button class="btn-gold" onclick="${btnAction}">${btnText}</button>`)}
    </div>`;
  }

  const pb=hist.playerBest,db2=hist.dealerBest;
  const resLabel=hist.result==='win'?'You Win!':hist.result==='push'?'Push':'You Lose!';
  const _ck=c=>c.r+c.s;
  const hlKeys=hist.result==='win'?new Set(pb?.cards.map(_ck)):hist.result==='lose'?new Set(db2?.cards.map(_ck)):new Set();
  const hlStyle=hist.result==='win'?'box-shadow:0 0 0 2px var(--gold),0 0 14px 4px rgba(196,147,58,0.55)':'box-shadow:0 0 0 2px var(--lose),0 0 14px 4px rgba(196,48,48,0.5)';
  const hl=c=>hlKeys.has(_ck(c))?hlStyle:'';
  const sameRank=pb&&db2&&pb.cat===db2.cat;
  const pbDetail=sameRank?' '+handDetail(pb.cards,pb.cat):'';
  const dbDetail=sameRank?' '+handDetail(db2.cards,db2.cat):'';

  return `${hdr("Ultimate Texas Hold'em · Showdown")}
  <div class="panel uth-result-panel">
    ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
    <div class="divider"></div>
    <div class="uth-result-top" style="text-align:center">
      <div class="result-hl" style="color:${col(hist.delta)}">${resLabel}</div>
      <div class="result-sub" style="color:${col(hist.delta)}">${csign(hist.delta)} chips</div>
    </div>
    <div class="uth-cards-col">
        <div style="text-align:center">
          <div class="sec sec-sm">Dealer${hist.dealerQualifies?' (Qualifies)':' (No Qualify)'}</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthDealer,'md',ANIM_NONE,0,0,hl)}</div>
          <div class="uth-hand-name" style="font-size:1.3rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[db2.cat]}${dbDetail}</div>
        </div>
        <div class="divider" style="width:100%;margin:10px 0"></div>
        <div style="text-align:center">
          <div class="sec sec-sm">Community</div>
          <div id="uth-community-hand" class="hand" style="justify-content:center">${renderCards(S.uthComm,'sm',0,0.08,0.05,hl)}</div>
        </div>
        <div class="divider" style="width:100%;margin:10px 0"></div>
        <div style="text-align:center">
          <div class="sec sec-sm">You</div>
          <div class="hand" style="justify-content:center">${renderCards(S.uthHole,'md',0,0.15,0.05,hl)}</div>
          <div class="uth-hand-name" style="font-size:1.3rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[pb.cat]}${pbDetail}</div>
        </div>
    </div>
    <div class="uth-bets-grid">
      ${[['Ante',hist.anteDelta],['Blind',hist.blindDelta],...(hist.play>0?[['Raise ('+hist.playMult+'×)',hist.playDelta]]:[])].map(([lbl,d])=>`<span class="pname">${lbl}</span><span class="ppay" style="color:${col(d)}">${csign(d)}</span>`).join('')}
    </div>
    ${gameControls(betInlay('Total', cfmt(S.chips)), `<button class="btn-gold" onclick="${btnAction}">${btnText}</button>`)}
  </div>`;
}
