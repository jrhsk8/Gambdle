// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   UTH STATE: resetUTHHand · per-hand deck slices
//   ULTIMATE TEXAS HOLD'EM LOGIC: deal · raise/check/fold · blind + ante
//     pay tables · dealer qualify · showdown settlement
//   SCREEN RENDERING: screenUTH · uthPayTableHTML
//   (The poker hand evaluator — rankPoker/cardNum/handScore/bestOf7 — lives in its own file,
//    poker-eval.js, loaded just before this one; both this file and poker.js share it.)
// ───────────────────────────────────────────────────────────────────────────

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

// ─── UTH STATE ───────────────────────────────────────────────────────────
const UTH_CARD_START_MS    = 300;  // delay before first community card animates in
const UTH_CARD_INTERVAL_MS = 400;  // stagger between each community card
// Total reveal duration: UTH_CARD_START_MS + (5 cards × UTH_CARD_INTERVAL_MS) = 2300ms
const UTH_REVEAL_TOTAL_MS  = UTH_CARD_START_MS + 5 * UTH_CARD_INTERVAL_MS;


function resetUTHHand(){
  S.uthAnte=0; S.uthPhase='bet'; S.uthRaise=0; S.uthRaiseMult=0;
  S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[];
  S.uthPrivate=null;
  S.uthRevealComm=0; S.uthPrevRevealComm=0;
}
GAMES.uth.reset = resetUTHHand; GAMES.uth.screen = screenUTH; GAMES.uth.nextHand = () => _nextHand(resetUTHHand); // register this game's fns into the Game registry (defined in this file; core.js loads first)
// Game-specific bet-UI patch (dispatched by patchBetUI): keep the stake summary + blind pay table in
// step with the staked Ante · Blind split as the bet changes.
GAMES.uth.patchBet = function(bet){
  const us=document.getElementById(DOM.uthSummary);
  if(!us) return;
  // Match the render's split: ante rounds up, blind rounds down (see _uthAntePortion/_uthBlindPortion).
  const ante=Math.ceil(bet/2), blind=Math.floor(bet/2);
  us.innerHTML = `Ante <b style="color:var(--gold)">${cfmtK(ante)}</b> + Blind <b style="color:var(--gold)">${cfmtK(blind)}</b> = <b style="color:var(--ink)">${cfmtK(bet)}</b> chips total`;
  const pt=document.getElementById(DOM.uthPtable);
  if(pt) pt.innerHTML = uthPayTableHTML(blind);
  const pth=document.getElementById(DOM.uthPtHead);
  if(pth) pth.innerHTML = uthPayTableHead(blind);
};
// Refresh landed mid-reveal: settle to the result panel after a beat, mirroring the live reveal timer.
// Doesn't consult UTH_STREET_GRAPH (below): a refresh during an active street (preflop/flop/turn) just
// re-renders that street's screen as-is via the normal render path — there's no "what's next" to derive,
// only 'reveal' needs special resume handling (settling the in-flight animation to 'result').
GAMES.uth.resume = function(){
  if(S.uthPhase!=='reveal') return;
  runReveal({steps:[],finishAt:300,signal:()=>S.uthPhase==='reveal',onFinish:()=>{
    _noAnim = true; S.uthPhase = 'result'; render(); updateChipDisplay();
    const last = S.uthHistory[S.uthHistory.length - 1];
    if (last && last.delta > 0) setTimeout(sndBigWin, UTH_CARD_INTERVAL_MS);
  }});
};

/** Skip the current UTH hand (all_in_or_skip modifier). Records delta 0 and advances. */
function uthSkip(){ txLog({g:'uth',a:'skip',h:S.uthHand}); _skipHand('uth',{ante:0,blind:0,play:0,playMult:0,result:'skip',delta:0}); }

// ─── ULTIMATE TEXAS HOLD'EM LOGIC ────────────────────────────────────────

/** Initial deal for UTH: Player cards, Dealer cards (hidden), and Community cards (hidden). */
// The day's Hold'em rule bundle — a PURE function of the mod accessor, mirroring roulette's spinModsFor
// and the BJ bundle. ONE place the UTH rule scalars + deal-shape flags are derived, shared by live and
// replay (they used to mirror the same reads inline in uth.js and engine.js). blindExtended stays the
// raw accessor value and blindBoost keeps its ||1 default, both lifted verbatim from the old sites.
function uthRulesFor(mod){
  return {
    doublePlay:    !!mod('uth_double_play'),
    hardQualify:   !!mod('uth_hard_qualify'),
    blindExtended: mod('uth_blind_extended'),
    blindBoost:    mod('uth_blind_boost') || 1,
    pocketAces:    !!mod('uth_pocket_aces'),   // Pocket Aces: forced AA from a fresh per-hand deck
    suitedConn:    !!mod('uth_suited_conn'),   // Suited Up: forced suited connector hole
    threeHole:     !!mod('uth_three_hole'),    // Triple Threat: a 3rd hole card from the deck tail
    sixthCard:     !!mod('uth_sixth_card'),    // Sixth Sense: a private 6th community card
  };
}
function uthRules(){ return uthRulesFor(getMod); } // live snapshot — the only getMod read for UTH rules

function uthDeal(){
  if(!S.uthAnte||S.uthPhase!=='bet')return;
  S.uthPhase='dealing'; // lock immediately so bet controls can't mutate S.uthAnte during sndShuffle
  debit(S.uthAnte,'uth-deal');
  txLog({g:'uth',a:'deal',h:S.uthHand,ante:S.uthAnte});
  const R=uthRules(); // the day's UTH rule bundle (same shape the engine builds from _engMod)
  if(R.pocketAces){
    // +1 so hand 0 doesn't reuse the exact daily seed; *97 (prime) spaces hand seeds apart to avoid collisions.
    const hr=mkRng(getRngSeed()+(S.uthHand+1)*97);
    const d=shuffle(buildDeck(),hr);
    const aces=[],rest=[];
    for(const c of d)(c.r==='A'&&aces.length<2?aces:rest).push(c);
    S.uthHole=aces;
    S.uthDealer=[rest[0],rest[1]];
    S.uthComm=rest.slice(2,7);
  }else if(R.suitedConn){
    // Suited Up: same fresh-per-hand-deck seeding as Pocket Aces, but the hole is a forced suited
    // connector that varies per hand. suitedConnectorDeal (core.js) is shared with the engine replay.
    const sc=suitedConnectorDeal(mkRng(getRngSeed()+(S.uthHand+1)*97));
    S.uthHole=sc.hole;S.uthDealer=sc.dealer;S.uthComm=sc.comm;
  }else{
    const dk=DEAL.uthDeck,off=S.uthHand*9;
    S.uthHole=[dk[off],dk[off+1]];
    // Triple Threat's third hole card comes from the deck's unused tail (27+), the same region
    // Time Travel re-deals from. The two mods never run on the same day, so no collision; and
    // the per-hand 9-card layout stays untouched, so test card overrides keep working.
    if(R.threeHole)S.uthHole.push(dk[27+S.uthHand]);
    // Sixth Sense's private 6th community card comes from the same unused tail (27+) Triple Threat /
    // Time Travel draw from. The mods never share a day, so the tail card can't collide.
    if(R.sixthCard)S.uthPrivate=dk[27+S.uthHand];
    S.uthDealer=[dk[off+2],dk[off+3]];
    S.uthComm=[dk[off+4],dk[off+5],dk[off+6],dk[off+7],dk[off+8]];
  }
  S.uthRaised=false;S.uthFolded=false;S.uthRaise=0;S.uthRaiseMult=0;
  S.uthRevealComm=0;S.uthPrevRevealComm=0;
  const db=document.getElementById(DOM.dealBtn);if(db)db.disabled=true;
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
// Sixth Sense: the private 6th community card is dealt up front but stays face-down through preflop/flop,
// flipping with the turn + river (revealComm 5). It's face-up for the final turn bet.
function _uthPrivateShown(){ return S.uthRevealComm>=5; }
// The player's showdown pool: 2 hole + 5 community, plus the Sixth Sense private card when active.
// Dealer's pool is unchanged (the private card is the player's alone), so this only wraps the player side.
function _uthPlayerPool(){ return [...S.uthHole, ...S.uthComm, ...(S.uthPrivate?[S.uthPrivate]:[])]; }
// Sixth Sense render: the private card sits as a 6th card in the community row with a gold glow + a YOU
// tag. Face-down until the turn (_uthPrivateShown), then the real card. _uthPrivCardHTML is the card
// element alone (so the turn flip can swap it surgically); _uthPrivSlot wraps it with the tag.
const _UTH_PRIV_GLOW='box-shadow:0 0 0 2px var(--gold-hi),0 0 12px 3px rgba(196,147,58,.5);border-radius:8px';
function _uthPrivCardHTML(anim){
  return _uthPrivateShown()?cardHTML(S.uthPrivate,'sm',_UTH_PRIV_GLOW,anim?0.05:0,!!anim):cardHTML('back','sm',_UTH_PRIV_GLOW,0,false);
}
function _uthPrivSlot(){ return `<div id="${DOM.uthPrivSlot}" class="uth-priv-slot">${_uthPrivCardHTML(false)}<span class="uth-priv-tag">YOU</span></div>`; }
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
  return `<div id="${DOM.ttBtnWrap}"><button class="btn-timetravel-glow" onclick="doTimeTravel()" style="background:rgba(43,127,255,.12);border:1.5px solid rgba(90,160,255,.55);color:#9cc4ff;padding:11px 20px;border-radius:8px;font-size:1.25rem;font-weight:700;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;line-height:1.15;white-space:nowrap">⏳ Re-deal<span style="display:block;font-size:.78rem;font-weight:400;opacity:.7;letter-spacing:.04em">1 left today</span></button></div>`;
}

// Re-deal the just-revealed street once per day. Replacement cards come from the unused tail of
// DEAL.uthDeck (indices 27+), which no hand touches, so they can never duplicate a card in play.
function doTimeTravel(){
  if(!getMod('uth_time_travel')||S.timeTravelUsed) return;
  if(S.uthPhase!=='flop'&&S.uthPhase!=='turn') return;
  txLog({g:'uth',a:'timetravel',h:S.uthHand,st:S.uthPhase}); // re-deals cards, so replay needs it
  mutate(s=>{
    s.timeTravelUsed=true;
    let ptr=s.uthRedealPtr;
    if(s.uthPhase==='flop'){
      for(let i=0;i<3;i++) s.uthComm[i]=DEAL.uthDeck[ptr++];
      s.uthPrevRevealComm=0;s.uthRevealComm=3;
    }else{ // turn — re-deal the turn + river cards (indices 3 and 4)
      s.uthComm[3]=DEAL.uthDeck[ptr++];s.uthComm[4]=DEAL.uthDeck[ptr++];
      s.uthPrevRevealComm=3;s.uthRevealComm=5;
    }
    s.uthRedealPtr=ptr;
  });
  const btn=document.getElementById(DOM.ttBtnWrap);if(btn)btn.style.display='none';
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
  if(S.uthRaise>0) s+=` · ${part('Raise',S.uthRaise)}`;
  return s;
}

// ─── STREET-PHASE GRAPH ──────────────────────────────────────────────────
// UTH's phase machine ('preflop' → 'flop' → 'turn' → resolve/fold → 'reveal') used to be re-derived
// inline in each handler (uthCheck deciding its own next deal, uthPlaceRaise branching on phase,
// uthFold hardcoding its own path) — three places that had to agree on the same three streets.
// This table is the ONE place that maps a phase to what's legal there and what "continue" does;
// the handlers below become thin (legality + txLog + ask the graph). Shape:
//   raiseMult:  the multiplier(s) offered as a fresh Raise at this phase (null once already raised —
//               real UTH allows exactly one Raise per hand, so a later street just continues).
//   checkable:  whether Check is a legal action at this phase (turn has no Check, only Raise/Fold).
//   showsFold:  whether the Fold button is offered at this phase (real UTH: turn only — you must
//               Raise or Check pre-turn, Raise or Fold on the turn). Distinct from _uthFoldable
//               below, which is a broader defensive guard for uthFold's own early-return.
//   advance():  what "this street's decision is resolved" does — deal the next street, or settle.
//               Called by uthCheck, by uthPlaceRaise after staking, and by uthNextStreet (the
//               continue button shown once uthRaised is already true from an earlier street).
// FINDING #17: _uthActionsHTML (below) reads raiseMult/checkable/showsFold straight off this table
// instead of re-deriving its own per-phase button literals, so the buttons shown can never drift
// from the legality the handlers (uthPlaceRaise/uthCheck/uthFold) already enforce off this same table.
const UTH_STREET_GRAPH = {
  preflop: { raiseMult:[4,3], checkable:true,  showsFold:false, advance:_uthDealFlop },
  flop:    { raiseMult:[2],   checkable:true,  showsFold:false, advance:_uthDealTurn },
  turn:    { raiseMult:[1],   checkable:false, showsFold:true,  advance:uthResolve  },
};
// Fold is legal from any street with an active decision (every key above); reveal/result/bet/dealing
// are not — Fold doesn't appear in the graph itself since it doesn't "advance" a street, it ends the hand.
// (Broader than showsFold above: this is uthFold's own defensive guard, not what the UI offers.)
function _uthFoldable(phase){ return phase in UTH_STREET_GRAPH; }

function uthPlaceRaise(mult){
  const node=UTH_STREET_GRAPH[S.uthPhase];
  if(!node||!node.raiseMult.includes(mult))return; // illegal mult/phase for this street — no-op
  const bet=_uthAntePortion()*mult;
  if(S.chips<bet)return;
  txLog({g:'uth',a:'raise',h:S.uthHand,mult,st:S.uthPhase});
  debit(bet,'uth-raise');S.uthRaise=bet;S.uthRaiseMult=mult;S.uthRaised=true;
  sndChip();
  const advanced=node.advance();
  if(S.uthPhase!=='reveal') updateChipDisplay(); // uthResolve (turn's advance) already renders past 'reveal'; the deal-fns don't
  return advanced;
}
function uthCheck(){
  const node=UTH_STREET_GRAPH[S.uthPhase];
  if(!node||!node.checkable)return;
  txLog({g:'uth',a:'check',h:S.uthHand,st:S.uthPhase});
  node.advance();
}
// The "continue" button shown once uthRaised is already true from an earlier street (real UTH allows
// only one Raise per hand, so later streets have no fresh decision — just click through). Reads the
// same graph node's advance() as uthCheck/uthPlaceRaise so all three paths agree on what's next.
function uthNextStreet(){
  const node=UTH_STREET_GRAPH[S.uthPhase];
  if(node) node.advance();
}
function uthFold(){
  // Idempotency guard (see _resolveRoulette): a double-tap on Fold must not push the loss twice
  // or advance the hand counter twice. uthFolded is reset per hand by resetUTHHand/uthDeal.
  if(S.uthFolded)return;
  if(!_uthFoldable(S.uthPhase))return; // not on an active street (e.g. already revealing/settled)
  txLog({g:'uth',a:'fold',h:S.uthHand,st:S.uthPhase});
  S.uthFolded=true;
  const ante=_uthAntePortion(),blind=_uthBlindPortion();
  S.uthHistory.push(mkOutcome('uth',-(ante+blind),'fold',{ante,blind,play:0,playMult:0,anteDelta:-ante,blindDelta:-blind,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:false}));
  S.uthHand++;S.uthPhase='reveal';
  updateUthCommunityCards();
  runReveal({steps:[],finishAt:UTH_REVEAL_TOTAL_MS,signal:()=>S.uthPhase==='reveal',
    onFinish:()=>{_noAnim=true;S.uthPhase='result';navRender();updateChipDisplay();}});
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

// Settlement Ledger for a settled UTH hand — the ONE credit mapping shared by the live settle
// (uthResolve) and the replay Engine. PURE: returns the ordered {op,n,reason} list (applied via
// applyLedger). `res` is the resolveUTH outcome. Each leg's stake was debited at deal/raise, so a win
// returns each stake + its profit (the ante pushes its stake back when the dealer doesn't qualify), a
// tie returns all three stakes as one credit, a loss keeps nothing. Order (play, ante, blind) is
// load-bearing: each entry rounds independently.
function uthAward(res, ante, blind, play){
  if(res.result==='win') return [
    {op:'credit', n:play+res.playDelta, reason:'uth-play'},
    res.dealerQualifies ? {op:'credit', n:ante+res.anteDelta, reason:'uth-ante'}
                        : {op:'credit', n:ante, reason:'uth-ante-push'},
    {op:'credit', n:blind+res.blindDelta, reason:'uth-blind'},
  ];
  if(res.result==='push') return [{op:'credit', n:ante+blind+play, reason:'uth-push'}];
  return [];
}
function uthResolve(){
  // Idempotency guard (see _resolveRoulette): settle a hand exactly once. A double-tap on the
  // resolving action or a stray call must not credit the three payouts and push a second history
  // entry twice. Only ever runs from the 'turn' phase and flips to 'reveal' below, so bail otherwise.
  if(S.uthPhase!=='turn')return;
  const ante=_uthAntePortion(),blind=_uthBlindPortion(),play=S.uthRaise;
  const pb=bestOf7(_uthPlayerPool());
  const db2=bestOf7([...S.uthDealer,...S.uthComm]);
  const R=uthRules();
  const res=resolveUTH(pb,db2,ante,blind,play,{
    wm:winMult(), doublePlay:R.doublePlay, hardQualify:R.hardQualify,
    blindExtended:R.blindExtended, blindBoost:R.blindBoost,
  });
  // Apply chips per leg through the shared settlement ledger (the same one the Engine replays).
  applyLedger(liveAcct(),uthAward(res,ante,blind,play));
  const {anteDelta,blindDelta,playDelta,delta,dealerQualifies,result}=res;
  S.uthHistory.push(mkOutcome('uth',delta,result,{ante,blind,play,playMult:S.uthRaiseMult,anteDelta,blindDelta,playDelta,playerBest:pb,dealerBest:db2,dealerQualifies}));
  S.uthHand++;S.uthPhase='reveal';
  S.uthRevealComm=5;
  updateUthCommunityCards();
  // Settle to the result panel after the reveal, via the shared scheduler's single-fire finish.
  runReveal({steps:[],finishAt:UTH_REVEAL_TOTAL_MS,signal:()=>S.uthPhase==='reveal',
    onFinish:()=>{_noAnim=true;S.uthPhase='result';navRender();updateChipDisplay();if(delta>0)setTimeout(sndBigWin,UTH_CARD_INTERVAL_MS);}});
}

// Surgically animates only the newly revealed community cards (uthPrevRevealComm → uthRevealComm).
// Also updates the action UI and progress dots after the animation finishes.
function updateUthCommunityCards() {
  const t = patchOrRender([DOM.uthCommunityHand, DOM.uthDealerHand], null, { noAnim: true });
  if (!t) return; // patchOrRender already fell back to a full render
  const [commHand, dealerHand] = t;

  // The bet inlay box persists across streets (no full render mid-hand), so refresh its stake
  // breakdown here — this is when a just-locked Raise should join the Ante · Blind line.
  const betInlayEl = document.getElementById(DOM.uthBetInlay);
  if (betInlayEl) betInlayEl.innerHTML = uthBetSummary();

  const hdrSub = document.getElementById(DOM.hdrSub);
  if (hdrSub) {
    if (S.uthPhase === 'reveal') hdrSub.textContent = "Ultimate Texas Hold'em · Dealer Reveals";
    else if (S.uthPhase === 'result') hdrSub.textContent = "Ultimate Texas Hold'em · Showdown";
  }

  const actionUi = document.getElementById(DOM.uthActionsUi);
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
    const dSec = document.getElementById(DOM.uthDealerSec);
    if (dSec) dSec.textContent = 'Dealer';
    setTimeout(() => sndCard(), startDelay + 100);
    setTimeout(() => sndCard(), startDelay + 1000);
    dealerHand.innerHTML = renderCards(S.uthDealer,'md',0,0.9,0.1);
  }

  // Sixth Sense: flip the private 6th card face-up the moment the turn lands (revealComm crosses to 5),
  // alongside the turn + river cards. It stays static on later updates (already shown).
  if (getMod('uth_sixth_card') && S.uthRevealComm >= 5 && S.uthPrevRevealComm < 5) {
    const slot = commHand.querySelector(`#${DOM.uthPrivSlot}`);
    if (slot) setTimeout(() => {
      slot.innerHTML = _uthPrivCardHTML(true) + '<span class="uth-priv-tag">YOU</span>';
      sndCard();
    }, startDelay + revealedCount * interval);
  }

  const finishDelay = startDelay + (revealedCount * interval);
  // Persist the reveal progress before the timers fire (street changes don't get interrupted mid-animate).
  mutate(s=>{ s.uthPrevRevealComm = s.uthRevealComm; });

  const dotsContainer = document.getElementById(DOM.uthDotsContainer);
  setTimeout(() => {
    if (dotsContainer) dotsContainer.innerHTML = S.uthPhase==='reveal'
      ? gameDots(S.uthHistory.slice(0,-1), S.uthHand-1, 'reveal')
      : gameDots(S.uthHistory, S.uthHand, S.uthPhase);
    if (actionUi && S.uthPhase !== 'reveal' && S.uthPhase !== 'result') {
      actionUi.style.pointerEvents = '';
      actionUi.innerHTML = _uthActionsHTML(); // ONE source for the street buttons (also used by screenUTH)
      // The dealer row isn't re-rendered on a street change, so the phase-gated Time Travel button
      // must be injected here when the flop/turn lands (it returns '' when used or off, a safe no-op).
      const dRow = document.querySelector('.dealer-hand-row');
      if (dRow && !document.getElementById(DOM.ttBtnWrap)) dRow.insertAdjacentHTML('beforeend', timeTravelBtnHTML());
    }
  }, finishDelay);
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

// Continue-button label shown once uthRaised is already true from an earlier street (real UTH:
// one Raise per hand, so a later street has no fresh decision). Mirrors the phase-specific copy the
// old per-phase branches hardcoded (flop → "See Turn & River", turn → "Showdown").
const _UTH_CONTINUE_LABEL = { flop:'See Turn &amp; River →', turn:'→ Showdown' };

// The per-street action-button cluster — the inner HTML of #uth-actions-ui — for the current phase.
// ONE source for these buttons: screenUTH seeds them on a full render, and updateUthCommunityCards
// repaints the IDENTICAL markup on a street change, so the two can no longer drift. (They did before:
// the flop "Raise 2×" label read S.uthAnte in the screen but the correct _uthAntePortion()*2 on the
// street change — they disagree on odd antes. The raise cost mirrors uthPlaceRaise, the source of
// truth.) FINDING #17: the button SET (which raises, Check vs Fold) is asked off UTH_STREET_GRAPH —
// the same table uthPlaceRaise/uthCheck/uthFold already gate on — instead of separate per-phase
// literals, so render and handler legality can't drift apart. Whitespace preserved from the originals.
function _uthActionsHTML(){
  const ph=S.uthPhase;
  const node=UTH_STREET_GRAPH[ph];
  if(!node) return '';
  if(S.uthRaised) return `<button class="btn-gold" onclick="uthNextStreet()">${_UTH_CONTINUE_LABEL[ph]}</button>`;
  const raiseBtns=node.raiseMult.map(mult=>{
    const cost=_uthAntePortion()*mult;
    return `<button class="act-btn" onclick="uthPlaceRaise(${mult})" ${S.chips>=cost?'':'disabled'}>Raise ${mult}× (${cfmt(cost)})</button>`;
  }).join('\n          ');
  const tailBtn=node.checkable
    ?`<button class="act-btn" onclick="uthCheck()">Check</button>`
    :node.showsFold
      ?`<button class="act-btn" style="color:var(--lose);border-color:rgba(196,48,48,.4)" onclick="uthFold()">Fold</button>`
      :'';
  return `<div id="uth-action-btns" class="act-btns">
          ${raiseBtns}
          ${tailBtn}
        </div>`;
}

function screenUTH(){
  const ph=S.uthPhase;
  const CAT_NAMES=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

  if(ph==='bet'){
    // Cap the ante at the 2/3 stake limit (maxBet → maxFor) so the chip buttons + All In match the
    // handlers, and the player always keeps enough for the mandatory 1× play raise (else they'd be
    // stuck folding on the turn). Was S.chips (full stack) — stale, predates the 2/3 cap.
    const maxAnte=maxBet();
    const aios=getMod('all_in_or_skip');
    // Pay table box with its caption hugging right below it (the .uth-pt-wrap group), inside a flex:1
    // spacer that mirrors the BJ bet table: it eats the panel slack so the chip selector + Deal button
    // land exactly where Blackjack puts them, and centres the box-group in whatever slack exists.
    const center=`<div class="uth-bet-center">
            <div class="uth-pt-wrap">
              <div id="${DOM.uthPtable}" class="ptable">${uthPayTableHTML(_uthBlindPortion())}</div>
              <div id="${DOM.uthPtHead}" class="sec">${uthPayTableHead(_uthBlindPortion())}</div>
            </div>
          </div>`;
    // The Ante+Blind+total summary lives inside the bet box (replacing the plain "Bet" readout);
    // keep id="uth-summary" so patchBetUI can live-update it and the bet-screen CSS hook still matches.
    const betSummary=`<div id="${DOM.uthSummary}" class="uth-bet-sum">Ante <b style="color:var(--gold)">${cfmtK(_uthAntePortion())}</b> + Blind <b style="color:var(--gold)">${cfmtK(_uthBlindPortion())}</b> = <b style="color:var(--ink)">${cfmtK(S.uthAnte)}</b> chips</div>`;
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="${DOM.uthDotsContainer}">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${aios
        ?`<div class="sec" style="text-align:center"><span class="sec-game-prefix">Hold'em · </span>All In or Skip · Wins Pay 2×</div>
          ${center}
          ${aiosRow('S.uthAnte=S.chips;uthDeal()', 'uthSkip()')}`
        :`<div class="sec" style="text-align:center"><span class="sec-game-prefix">Hold'em · </span>Place Bet (Ante + Blind)</div>
          ${center}
          ${chipSel(maxAnte,S.uthAnte,[10,25,50,100,250,500,1000],'',betSummary)}
          <button id="${DOM.dealBtn}" class="btn-gold" style="margin-top:6px" onclick="uthDeal()" ${S.uthAnte===0?'disabled':''}>Deal ${icon('shuffle',{cls:'btn-icon-gap'})}</button>`}
    </div>`;
  }

  const sixth=getMod('uth_sixth_card');
  const commRow=(band=false)=>`<div id="uth-community-container" class="${band?'vband':''}" style="text-align:center">
    <div class="sec">Community Cards</div>
    <div id="${DOM.uthCommunityHand}" class="hand${sixth?' sixth-sense':''}">${[0,1,2,3,4].map(i=>{
      // Count-revealed cards animate when freshly dealt; River Monster's river (i=4) is shown
      // face-up from the start but is not count-revealed, so it stays static (isNew=false).
      const countShown=i<S.uthRevealComm;
      if(countShown||(getMod('uth_river_monster')&&i===4)){
        const isNew=countShown&&i>=S.uthPrevRevealComm;
        return cardHTML(S.uthComm[i],'sm','',isNew?0.05+(i-S.uthPrevRevealComm)*0.12:0,isNew);
      }
      return cardHTML('back','sm','',0,false);
    }).join('')}${sixth?_uthPrivSlot():''}</div>
  </div>`;

  const playerRow=(anim=false)=>`<div class="vband" style="text-align:center">
    <div class="sec">Your Hand</div>
    <div class="hand">${renderCards(S.uthHole,'md',anim?0:ANIM_NONE,0.2,0.05)}</div>
  </div>`;

  const dealerRow=(reveal=false)=>`<div id="uth-dealer-container" class="vband" style="text-align:center">
    <div id="${DOM.uthDealerSec}" class="sec">${reveal?'Dealer':peekRevealed()?`Dealer · <span style="color:var(--gold-hi);font-size:.7rem">${icon('eye')} Peeked</span>`:'Dealer (Face Down)'}</div>
    <div class="dealer-hand-row">
      <div id="${DOM.uthDealerHand}" class="hand">${reveal
        ?renderCards(S.uthDealer,'md',0,0.9,0.1)
        :[0,1].map((_,i)=>i===0&&peekRevealed()?cardHTML(S.uthDealer[0],'md','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','md')).join('')}</div>
      ${reveal?'':peekBtnHTML()}${reveal?'':timeTravelBtnHTML()}
    </div>
  </div>`;

  // Bottom control cluster: the stake-breakdown inlay box stacked above the per-street action
  // buttons (kept in #uth-actions-ui for the surgical street-change updates).
  const uthControls=(actionsInner)=>gameControls(
    betInlaySum(uthBetSummary(),DOM.uthBetInlay),
    `<div id="${DOM.uthActionsUi}">${actionsInner}</div>`);

  // preflop / flop / turn share ONE skeleton (dealer · community · your hand · controls); only the
  // action buttons differ, and those live in _uthActionsHTML() — the same source the street-change
  // repaint (updateUthCommunityCards) uses. Preflop animates the freshly dealt hole cards.
  if(ph==='preflop'||ph==='flop'||ph==='turn'){
    return `${hdr("Ultimate Texas Hold'em · Hand "+(S.uthHand+1)+' of 3')}
    <div class="panel">
      <div id="${DOM.uthDotsContainer}">${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}</div>
      <div class="divider"></div>
      ${dealerRow(false)}
      <div class="divider"></div>
      ${commRow(true)}
      <div class="divider"></div>
      ${playerRow(ph==='preflop')}
      <div class="divider"></div>
      ${uthControls(_uthActionsHTML())}
    </div>`;
  }

  if(ph==='reveal'){
    return `${hdr("Ultimate Texas Hold'em · Dealer Reveals")}
    <div class="panel">
      <div id="${DOM.uthDotsContainer}">${gameDots(S.uthHistory.slice(0,-1),S.uthHand-1,'reveal')}</div>
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
      ${gameControls(betInlaySum(uthBetSummary(),DOM.uthBetInlay), '')}
    </div>`;
  }

  // result
  const hist=S.uthHistory[S.uthHand-1];
  if(!hist)return'';
  const {text:btnText, action:btnAction} = resultAdvanceBtn(S.uthHand>=3, NEXT_SCREEN['uth']);

  if(hist.result==='fold'){
    const dealerBest=bestOf7([...S.uthDealer,...S.uthComm]);
    const playerBest=bestOf7(_uthPlayerPool());
    const foldSameRank=dealerBest.cat===playerBest.cat;
    const foldDbDetail=foldSameRank?' '+handDetail(dealerBest.cards,dealerBest.cat):'';
    const foldPbDetail=foldSameRank?' '+handDetail(playerBest.cards,playerBest.cat):'';
    return `${hdr("Ultimate Texas Hold'em · Folded")}
    <div class="panel uth-result-panel" style="text-align:center">
      ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
      <div class="divider"></div>
      <div class="result-head">
        <div class="result-hl" style="color:var(--lose)">You Folded</div>
        <div class="result-sub" style="color:var(--lose)">${csign(hist.delta)} chips</div>
      </div>
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
    <div class="result-head">
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
          <div id="${DOM.uthCommunityHand}" class="hand${getMod('uth_sixth_card')?' sixth-sense':''}" style="justify-content:center">${renderCards(S.uthComm,'sm',0,0.08,0.05,hl)}${getMod('uth_sixth_card')?_uthPrivSlot():''}</div>
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
