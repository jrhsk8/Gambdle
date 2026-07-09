// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   BLACKJACK LOGIC: timing consts · deal/hit/stand/double · dealer peek ·
//     bjSplit + split-hand flow · bjResolve settlement · _bjResumeAfterRefresh
//   BLACKJACK RENDER: screenBJ (bet phase, play phase, result panel, splits)
// ───────────────────────────────────────────────────────────────────────────

// ─── BLACKJACK LOGIC ──────────────────────────────────────────
const BJ_RESUME_MS    = 300;   // minimum re-entry delay when resuming after a page refresh
const BJ_ADVANCE_MS   = 700;   // delay after hitting 21 or doubling before advancing play
const BJ_HIT_MS       = 800;   // interval between dealer hit steps
const BJ_RESOLVE_MS   = 1000;  // delay after dealer finishes drawing before settling bets
const BJ_CELEBRATE_MS = 1500;  // inner duration of the blackjack celebration animation
const BJ_PEEK_MS      = 700;   // beat after the deal before the dealer flips a natural blackjack (casino peek)

// Mutex flag: prevents double-actions while cards are mid-animation.
let _bjResolving=false;

// Resolve choreography, kept in one place. _bjDefer: hold the action-button lock for `ms`, then
// release it and run `next` (the dealer reveal, or the next split hand). _bjAfterCard: the same,
// preceded by locking + a no-animation re-render: so a card the player can't act on (a hit to 21,
// a double's single card) stays on screen for a beat before play advances.
function _bjDefer(next, ms){ setTimeout(()=>{ _bjResolving=false; next(); }, ms); }
function _bjAfterCard(next){ _bjResolving=true; _noAnim=true; render(); _bjDefer(next, BJ_ADVANCE_MS); }

// The single sequential draw accessor for Blackjack. Normally draws from the shared seeded shoe at
// S.bjIdx; under Double Vision (bj_two_hands) the whole hand instead comes from a fresh per-hand deck
// (S.bjDeck2) so the day's other hands stay on the untouched shoe. With bjDeck2===null this is
// byte-identical to DEAL.bjShoe[S.bjIdx++], so non-mod days are unaffected.
function _bjDraw(){ return S.bjDeck2 ? S.bjDeck2[S.bjDeck2Idx++] : DEAL.bjShoe[S.bjIdx++]; }

// Called once on boot: if the page was refreshed while cards were mid-animation,
// the saved state has a resolved hand but the setTimeout chain is gone.
// Re-enter the appropriate step so the hand can resolve.
function _bjResumeAfterRefresh(){
  if(S.screen!=='bj'||S.bjPhase!=='play')return;

  if(S.bjDealerReveal){
    // Interrupted mid-dealer-reveal; the cards already shown are still in S.bjDealer, so draw
    // whatever hits remain (same cursor-advance as a fresh reveal) and stagger their reveal from a
    // short BJ_RESUME_MS beat, same cadence as bjRevealDealer.
    const hitAts=_bjDrawDealerHits();
    const steps=hitAts.map((at,k)=>({at:BJ_RESUME_MS+k*BJ_HIT_MS,do:()=>{
      S.bjDealerAnimFrom=at;
      _noAnim=true;render();
      sndCard(100);
    }}));
    const finishAt=BJ_RESUME_MS+hitAts.length*BJ_HIT_MS+BJ_RESOLVE_MS;
    runReveal({steps,finishAt,signal:()=>S.bjDealerReveal,
      onFinish:()=>{S.bjDealerReveal=false;bjResolve(true);}});
    return;
  }

  // Interrupted after player hand resolved but before dealer reveal started.
  if(S.bjCelebrating){
    // Player blackjack animation was cut off; jump straight to resolve (no re-celebration).
    runReveal({steps:[],finishAt:BJ_RESUME_MS,signal:()=>S.bjCelebrating,
      onFinish:()=>{S.bjCelebrating=false;bjResolve();}});
    return;
  }
  // The player finished acting (stood, doubled, hit to 21, or busted) but the timer that starts the
  // dealer's turn was lost to the refresh. A bust/21 is evident from the cards; a stand or a double
  // that landed under 21 is not, so bjStand/bjDouble persist S.bjActed to mark it. A refresh during
  // the dealer-blackjack peek (player hasn't acted, but the dealer is sitting on a natural 21) must
  // also resume the reveal. _bjResolving locks the (still-rendered) action buttons out during the
  // short re-reveal delay so the hand can't be re-played (e.g. hitting an already-doubled hand).
  if(!S.bjSplit&&(S.bjActed||hVal(S.bjPlayer)>=21||isBJ(S.bjDealer))){
    _bjResolving=true;
    _bjDefer(bjRevealDealer, BJ_RESUME_MS);
    return;
  }
  if(S.bjSplit){
    if(S.bjSplitDone.length&&S.bjSplitDone.every(d=>d)){
      // All split hands resolved; dealer reveal never fired.
      _bjResolving=true;
      _bjDefer(bjRevealDealer, BJ_RESUME_MS);
    } else {
      const ai=S.bjSplitActive,hand=S.bjSplitHands[ai];
      if(S.bjActed||(hand&&hVal(hand)>=21)){
        _bjResolving=true;
        _bjDefer(bjAdvanceSplit, BJ_RESUME_MS);
      }
    }
  }
}

// `reason`: see reset(reason) in core.js ('hand-advance' | 'borrow-prep' today; both
// clear the same fields, so it's accepted but unbranched).
function resetBJHand(reason){
  S.bjBet=0; S.bjPhase='bet'; S.bjPlayer=[]; S.bjDealer=[];
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0;
  S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[];
  S.bjAnimFrom=0; S.bjDealerAnimFrom=0; S.bjSplitAnimFrom=[];
  S.bjDealerReveal=false; S.bjCelebrating=false; S.bjActed=false;
  S.bjDeck2=null; S.bjDeck2Idx=0; S.bjCandidates=null; // Double Vision
  _bjResolving=false;
}
GAMES.bj.reset = resetBJHand; GAMES.bj.screen = screenBJ; GAMES.bj.resume = _bjResumeAfterRefresh; GAMES.bj.nextHand = () => _nextHand(resetBJHand); GAMES.bj.rulesFor = bjRulesFor; // register this game's fns into the Game registry (defined in this file; core.js loads first)

// Skip the current BJ hand (all_in_or_skip modifier). Records delta 0 and advances.
function bjSkip(){ tx('bj','skip'); _skipHand('bj',{bet:0,result:'skip',delta:0,player:[],dealer:[]}); }

// Handles the initial deal for a Blackjack hand.
function bjDeal(){
  if(!S.bjBet||S.bjPhase!=='bet')return;
  S.bjPhase='dealing'; // lock immediately so bet controls can't mutate S.bjBet during sndShuffle
  debit(S.bjBet,'bj-deal');
  tx('bj','deal',{bet:S.bjBet});
  S.bjAnimFrom=0;S.bjDealerAnimFrom=0;
  // Double Vision: deal the whole hand from a fresh per-hand deck (the shared shoe is left untouched,
  // so the day's other BJ hands are unchanged) and offer two candidate hands; the player keeps one.
  // A natural blackjack among the candidates is kept automatically and plays out (no pick phase).
  if(bjRules().twoHands){
    S.bjDeck2=shuffle(buildDeck(),mkRng(getRngSeed()+(S.bjHand+1)*97));S.bjDeck2Idx=0;
    const A=[_bjDraw(),_bjDraw()],B=[_bjDraw(),_bjDraw()];
    S.bjDealer=[_bjDraw(),_bjDraw()];
    S.bjCandidates=[A,B];
    const db=document.getElementById(DOM.dealBtn);if(db)db.disabled=true;
    const nat=isBJ(A)?0:isBJ(B)?1:-1;
    if(nat!==-1){
      S.bjPlayer=S.bjCandidates[nat];S.bjCandidates=null;S.bjPhase='play';
      sndShuffle(_bjAfterDeal); // celebrate / settle the natural through the shared post-deal path
    }else{
      mutate(() => { S.bjPhase='pick'; }); // persist before the DOM work below runs
      sndShuffle(()=>{ render(); updateChipDisplay(); sndCard(100);sndCard(500);sndCard(900); });
    }
    return;
  }
  // Each hand draws from its own fixed segment of the shoe, so a split/hit in one hand never shifts
  // another hand's cards (BJ hands are independent). Reset the cursor to this hand's segment, then run
  // the First Ace swap bounded to that segment (shared with the replay engine so they can't diverge).
  // Pre-cutover seeds return null → keep the old continuous cursor + unbounded swap (see bjSegStart's gate).
  const _seg=bjSegStart(DEAL.bjShoe.length,S.bjHand,getRngSeed());
  if(_seg!==null)S.bjIdx=_seg;
  bjFirstAceSwap(DEAL.bjShoe,S.bjIdx,getMod,bjSegStart(DEAL.bjShoe.length,S.bjHand+1,getRngSeed()));
  S.bjPlayer=[_bjDraw(),_bjDraw()];
  S.bjDealer=[_bjDraw(),_bjDraw()];
  const db=document.getElementById(DOM.dealBtn);if(db)db.disabled=true;
  sndShuffle(_bjAfterDeal);
}

// The post-deal resolution shared by the normal deal and Double Vision's pick. Runs inside the deal's
// sndShuffle (normal / auto-kept natural) or synchronously right after a pick (the shuffle already played).
function _bjAfterDeal(){
  // Casino peek: the dealer checks for a natural blackjack before the player acts. A dealer
  // blackjack ends the hand immediately: the player never gets to hit/double/split into a sure
  // loss: settling as a push if the player also has a blackjack, otherwise a loss of the original
  // bet. (A dealer BJ always shows an Ace or a 10 up, so this is exactly the real-table peek.)
  if(isBJ(S.bjDealer)){
    S.bjPhase='play';
    _bjResolving=true; // lock the action buttons through the brief peek before the hole card flips
    _noAnim=true;render();
    sndCard(100);sndCard(500);
    runReveal({steps:[],finishAt:BJ_PEEK_MS,signal:()=>S.bjPhase==='play',
      onFinish:()=>{_bjResolving=false;bjRevealDealer();}});
    return;
  }
  // Player blackjack with no dealer blackjack: an automatic win; celebrate, then settle.
  if(isBJ(S.bjPlayer)){
    S.bjPhase='play';S.bjCelebrating=true;
    _noAnim=true;render();
    sndCard(100);sndCard(500);
    runReveal({steps:[{at:1000,do:sndBigWin}],finishAt:1000+BJ_CELEBRATE_MS,signal:()=>S.bjCelebrating,
      onFinish:()=>{S.bjCelebrating=false;bjResolve();}});
    return;
  }
  S.bjPhase='play';
  render(); updateChipDisplay();
  sndCard(100);sndCard(500);sndCard(900);
}

// Double Vision: commit one of the two candidate hands (the player's only new decision) and play it
// out through the shared post-deal path. Wired to the candidate Buttons in the 'pick' render.
function bjPickHand(idx){
  if(S.bjPhase!=='pick'||!S.bjCandidates||(idx!==0&&idx!==1))return;
  tx('bj','pick',{s:idx});
  mutate(() => { // commit the chosen candidate before the post-deal DOM work runs
    S.bjPlayer=S.bjCandidates[idx];
    S.bjCandidates=null;
    S.bjAnimFrom=0;
  });
  _bjAfterDeal();
}

// Soft Landing (bj_safe_hit): a hand's first hit (it still holds just its 2 dealt cards) can't bust.
// If the next shoe card would push it over 21, swap in the nearest LATER card that keeps the total
// ≤21: a pure in-place shoe reorder (no extra draw), so the engine replays it identically (engine.js).
function _bjSafeHitSwap(hand){
  const idx=S.bjIdx;
  if(hVal(hand.concat(DEAL.bjShoe[idx]))<=21)return;            // the natural draw is already safe
  const end=bjSegStart(DEAL.bjShoe.length,S.bjHand+1,getRngSeed())??DEAL.bjShoe.length; // segment bound; null (pre-cutover) → unbounded
  const si=DEAL.bjShoe.findIndex((c,k)=>k>idx&&k<end&&hVal(hand.concat(c))<=21);
  if(si!==-1)[DEAL.bjShoe[idx],DEAL.bjShoe[si]]=[DEAL.bjShoe[si],DEAL.bjShoe[idx]];
}

// Player takes another card.
function bjHit(){
  if(!bjCanAct().hit)return; // ONE eligibility check, same one the Hit button's disabled attr reads
  const isSplit=S.bjSplit;
  const ai=isSplit?S.bjSplitActive:null;
  const hand=isSplit?S.bjSplitHands[ai]:S.bjPlayer;
  tx('bj','hit',{s:isSplit?ai:0});
  if(isSplit)S.bjSplitAnimFrom[ai]=hand.length;
  else S.bjAnimFrom=hand.length;
  S.bjDealerAnimFrom=ANIM_NONE;
  // Soft Landing: protect the first hit of each hand (and each split sub-hand). length===2 ⇒ no prior
  // hit (you can't hit-then-split, and a double ends the hand), so this fires exactly once per hand.
  if(getMod('bj_safe_hit')&&hand.length===2)_bjSafeHitSwap(hand);
  hand.push(_bjDraw());
  sndCard(100);
  const pv=hVal(hand);
  // At 21+ the player can't act; auto-advance after a short delay so the card is visible.
  if(pv>=21){_bjAfterCard(isSplit?bjAdvanceSplit:bjRevealDealer);}
  else{
    // Surgically append the card + update the total; patchOrRender falls back to a full render (which
    // rebuilds from S and saves) if the target is missing, so the pushed card is never lost.
    // Not wrapped in mutate(): the S writes (hand.push, animFrom) already happened above the patch,
    // and this saveState deliberately fires AFTER the DOM patch (not before): wrapping would pull the
    // save earlier than it runs today, so it stays a bare call to preserve that ordering.
    patchOrRender([isSplit?DOM.bjActiveHand:DOM.bjPlayerHand, isSplit?DOM.bjActiveVal:DOM.bjPlayerVal], (handEl, valEl) => {
      handEl.insertAdjacentHTML('beforeend', cardHTML(hand[hand.length-1], 'lg', '', 0.1, true));
      valEl.textContent = hValDisplay(hand);
      _bjSyncActBtns(); // legality changed (Double/Split die after a hit) but the buttons stay in the DOM
      saveState(); // boundary-ok: save must follow the DOM patch (see comment above)
    });
  }
}

// Player finishes their turn.
function bjStand(){
  if(!bjCanAct().stand)return; // ONE eligibility check, same one the Stand button's disabled attr reads
  tx('bj','stand',{s:S.bjSplit?S.bjSplitActive:0});
  _bjResolving=true;
  // Persist that the player finished acting, so a refresh during the brief reveal delay resumes the
  // dealer's turn instead of stranding the hand in 'play' with the action buttons live again
  // (a stand leaves the cards unchanged, so without this flag the saved state is indistinguishable
  // from "still deciding"). See _bjResumeAfterRefresh.
  mutate(() => { S.bjActed=true; }); // persists immediately
  _bjDefer(S.bjSplit?bjAdvanceSplit:bjRevealDealer, BJ_RESUME_MS);
}

// Double the bet and receive exactly one more card.
function bjDouble(){
  // ONE eligibility check (covers the resolving lock + the chips>=bet coverage requirement below),
  // same one the Double button's disabled attr reads: bjCanAct().double already folds in
  // hand.length===2 (initial hand only) via splitCanAct, so no separate chips<bet guard is needed here.
  if(!bjCanAct().double)return;
  if(S.bjSplit){
    const i=S.bjSplitActive;
    tx('bj','double',{s:i});
    S.bjSplitAnimFrom[i]=S.bjSplitHands[i].length;
    S.bjDealerAnimFrom=ANIM_NONE; // don't re-deal the dealer upcard on the post-double render (matches bjHit/bjSplit)
    debit(S.bjSplitBets[i],'bj-split-double');S.bjSplitBets[i]*=2;
    S.bjSplitDoubled[i]=true;
    updateChipDisplay();
    S.bjSplitHands[i].push(_bjDraw());
    sndCard(100);
    S.bjActed=true; // hand is done after the one card; a refresh in the deal-out delay resumes (render() persists it)
    _bjAfterCard(bjAdvanceSplit);
  }else{
    tx('bj','double',{s:0});
    S.bjAnimFrom=S.bjPlayer.length;
    S.bjDealerAnimFrom=ANIM_NONE; // don't re-deal the dealer upcard on the post-double render (matches bjHit/bjSplit)
    debit(S.bjBet,'bj-double');S.bjBet*=2;
    S.bjDoubled=true;
    updateChipDisplay();
    S.bjPlayer.push(_bjDraw());
    S.bjActed=true; // hand is done after the one card; a refresh in the deal-out delay resumes (render() persists it)
    _bjAfterCard(bjRevealDealer);
  }
}

// Splits a pair into two separate hands. Supports re-splitting.
function bjSplit(){
  // ONE eligibility check (resolving lock + pair/wild-split + hands<4 + chips>=bet), same one the
  // Split button's disabled attr reads via bjCanAct().split.
  if(!bjCanAct().split)return;
  if(S.bjSplit){
    const ai=S.bjSplitActive,bet=S.bjSplitBets[ai];
    tx('bj','split',{s:ai});
    debit(bet,'bj-resplit');
    // splitResplit (the shared state machine) owns the array-shape transition; live keeps its own
    // AnimFrom (display-only) in step, splicing the same slot the same way.
    const{hands,bets,doubled,done}=splitResplit(S.bjSplitHands,S.bjSplitBets,S.bjSplitDoubled,S.bjSplitDone,ai,_bjDraw);
    S.bjSplitHands=hands;S.bjSplitBets=bets;S.bjSplitDoubled=doubled;S.bjSplitDone=done;
    S.bjSplitAnimFrom.splice(ai,1,0,0);
    render(); updateChipDisplay();
  }else{
    // Splitting stakes a second hand at the full original bet, so it requires full coverage:
    // same rule as double-down (bjCanAct().double). Coverage + pair/wild-split legality both
    // already checked above via bjCanAct().split.
    tx('bj','split',{s:0});
    debit(S.bjBet,'bj-split');
    // splitInit (the shared state machine) owns the initial-split array shape.
    const{hands,bets,doubled,done}=splitInit(S.bjPlayer,S.bjBet,_bjDraw);
    S.bjSplit=true;
    S.bjSplitHands=hands;S.bjSplitActive=0;S.bjSplitBets=bets;
    S.bjSplitResults=[];S.bjSplitDone=done;S.bjSplitDoubled=doubled;
    S.bjSplitAnimFrom=[0,0];
    render(); updateChipDisplay();
  }
  S.bjDealerAnimFrom=ANIM_NONE;
  sndCard(100);sndCard(500);
  bjCheckSplitHand();
}

// After a split hand gets its second card, check if it's already at 21/BJ before the player acts.
// splitIsActionable (the shared machine) is the same >=21 gate bjSplitStep's settleToActionable uses;
// the BJ-vs-plain-21 distinction below is celebration-timing only, not a decision divergence.
function bjCheckSplitHand(){
  const hand=S.bjSplitHands[S.bjSplitActive];
  if(!splitIsActionable(hand)){
    if(isBJ(hand)){
      _bjResolving=true;S.bjCelebrating=true;_noAnim=true;render();
      sndCard(100);sndCard(500);
      runReveal({steps:[{at:1000,do:sndBigWin}],finishAt:1000+BJ_CELEBRATE_MS,signal:()=>S.bjCelebrating,
        onFinish:()=>{S.bjCelebrating=false;_bjResolving=false;bjAdvanceSplit();}});
    }else{_bjAfterCard(bjAdvanceSplit);}
  }else{_noAnim=true;render();}
}

// Moves play to the next split hand, or to the dealer if all hands are done.
function bjAdvanceSplit(){
  S.bjActed=false; // this sub-hand's action is consumed; the next sub-hand (if any) is freshly playable
  // splitAdvance (the shared machine) picks the next undone sub-hand; live still owns dealing that
  // hand's 2nd card + the animation/sound pacing around it.
  const{done,active,allDone}=splitAdvance(S.bjSplitDone,S.bjSplitActive);
  S.bjSplitDone=done;
  if(!allDone){
    S.bjSplitActive=active;
    const nextHand=S.bjSplitHands[active];
    if(nextHand.length===1){
      S.bjSplitAnimFrom[active]=1;
      nextHand.push(_bjDraw());
    }
    sndCard(100);sndCard(500);
    bjCheckSplitHand();
  }
  else bjRevealDealer();
}

// Draws the dealer's remaining hits up front (pure cursor advance, same total draws/order as the old
// recursive loop: just no longer interleaved with the reveal timing) so runReveal's step list can be
// built once. Returns the indices (in S.bjDealer, post-draw) each hit lands at, in draw order.
function _bjDrawDealerHits(){
  const standAt=getMod('bj_dealer_stand')||17;
  const hitAts=[];
  while(hVal(S.bjDealer)<standAt){
    S.bjDealer.push(_bjDraw());
    hitAts.push(S.bjDealer.length-1);
  }
  return hitAts;
}
// Reveals the dealer's hole card, then hits every BJ_HIT_MS until standing (17+), via runReveal.
function bjRevealDealer(){
  S.bjDealerReveal=true;
  S.bjActed=false; // consumed: from here the dealer-reveal branch owns refresh recovery
  S.bjDealerAnimFrom=1; // animate the hole card reveal
  S.bjAnimFrom=ANIM_NONE;S.bjSplitAnimFrom=S.bjSplitAnimFrom.map(()=>ANIM_NONE);
  _noAnim=true;render();
  sndCard(100);
  // The dealer's full hit sequence is data-dependent (stand-at-17+) but deterministic from the shoe,
  // so it's safe to draw all of it now and just stagger the REVEAL of each card: byte-identical shoe
  // consumption to the old draw-per-step loop, since nothing reads the shoe cursor between hits.
  const hitAts=_bjDrawDealerHits();
  const steps=hitAts.map((at,k)=>({at:(k+1)*BJ_HIT_MS,do:()=>{
    S.bjDealerAnimFrom=at; // only animate this card
    _noAnim=true;render();
    sndCard(100);
  }}));
  const finishAt=(hitAts.length+1)*BJ_HIT_MS+BJ_RESOLVE_MS;
  runReveal({steps,finishAt,signal:()=>S.bjDealerReveal,
    onFinish:()=>{S.bjDealerReveal=false;bjResolve(true);}});
}

// ─── BLACKJACK RESOLVERS (pure) ───────────────────────────────────────────────
// The payout × modifier decision for one settled hand: kept separate from bjResolve so the win/loss
// math is testable in isolation and replayable by the engine. PURE: hand values + bet + resolved
// multipliers in, {result, delta} out: no S, no DOM, no credit. The caller draws the dealer, applies
// chips (derivable from result), and records. `delta` is signed net profit; the stake was debited at
// deal, so the caller credits bet+delta on a win, bet on a push, nothing on a loss/bust.
//   wm = winMult()  ·  bjMult = bj_payout (blackjack pay, default 1.5)  ·  ddm = doubled-profit mult
function resolveBJHand({pv, pBJ, dv, dBJ, bet, wm, bjMult, ddm}){
  if(pBJ&&dBJ)     return {result:'push',      delta:0};
  if(pBJ)          return {result:'blackjack', delta:Math.floor(bet*bjMult*wm)};
  if(pv>21)        return {result:'bust',      delta:-bet};
  if(dv>21||pv>dv) return {result:'win',       delta:bet*wm*ddm};
  if(pv===dv)      return {result:'push',      delta:0};
  return {result:'lose', delta:-bet};
}
// A split sub-hand can't be a natural blackjack (21 after a split is an ordinary 21), so there is no
// blackjack branch; `spm` is the wild-split winning multiplier.
function resolveBJSplitHand({pv, dv, bet, wm, ddm, spm}){
  if(pv>21)        return {result:'bust', delta:-bet};
  if(dv>21||pv>dv) return {result:'win',  delta:bet*wm*ddm*spm};
  if(pv===dv)      return {result:'push', delta:0};
  return {result:'lose', delta:-bet};
}

// ─── SPLIT-HAND STATE MACHINE (pure transitions) ──────────────────────────────
// The ONE place the split-hand decisions live: who can act, what a split/resplit does to the
// parallel hand/bet/doubled/done arrays, and which sub-hand plays next. Both the live handlers
// below (bjSplit/bjAdvanceSplit) and the replay Engine's bjSplitStep (engine.js, driven by a
// transcript instead of clicks) call these, so the two can't decide differently. PURE: arrays +
// a draw() accessor in, new arrays out; no S, no DOM, no timers. The live handlers still own
// S.bjSplit*/bjAnimFrom/txLog/render/animation pacing; this only owns the state-shape transitions,
// so live storage (the 6 parallel S arrays) stays compatible with old saves (mid-split resume still loads).
//
// splitCanAct: the split/double-down legality for the active sub-hand (mirrors bjSplitStep's
// per-iteration `ctx`, and bjCanAct() below, the live convergence point for BOTH split and
// non-split hands). `wildSplit`: bj_wild_split lets ANY pair resplit, not just a matching rank.
function splitCanAct(hands, bets, active, chips, wildSplit){
  const hand=hands[active];
  const isPair=hand.length===2&&(hand[0].r===hand[1].r||!!wildSplit);
  return {
    canResplit: isPair&&hands.length<4&&chips>=bets[active],
    canDouble:  hand.length===2&&chips>=bets[active],
  };
}

// bjCanAct(): the ONE eligibility resolver for "can the player act right now, and on
// what" for the live active hand (split or not). Both the render (screenBJ/bjActionBtns: which buttons
// exist/are disabled) and the action handlers (bjHit/bjStand/bjDouble/bjSplit early-return guards) call
// this instead of keeping separate inline chains and separate _bjResolving checks, so the two can't
// silently disagree. A non-split hand is just a length-1 "hands" array through the same splitCanAct
// logic (hands=[S.bjPlayer], active=0): splitCanAct already generalizes to it exactly, so
// there's no second parallel legality formula to keep in sync. Reads S directly (this is the live-only
// convergence point, not a pure function shared with the engine like splitCanAct itself).
function bjCanAct(){
  const locked=S.bjPhase!=='play'||S.bjDealerReveal||_bjResolving;
  const isSplit=S.bjSplit;
  const ai=isSplit?S.bjSplitActive:0;
  const hands=isSplit?S.bjSplitHands:[S.bjPlayer];
  const bets=isSplit?S.bjSplitBets:[S.bjBet];
  const hand=hands[ai];
  const pv=hVal(hand),bust=pv>21,done21=pv===21;
  const isInitial=hand.length===2;
  const{canResplit,canDouble:canDbl}=splitCanAct(hands,bets,ai,S.chips,getMod('bj_wild_split'));
  return {
    hit:    !locked&&!bust&&!done21,
    stand:  !locked&&!done21,
    double: !locked&&!bust&&!done21&&isInitial&&canDbl,
    split:  !locked&&!done21&&isInitial&&canResplit,
    locked,
  };
}
// splitInit: the very first split: stakes hand 0 a 2nd card (drawn), hand 1 waits for its 2nd card
// until it becomes active. Mirrors bjSplit()'s non-split branch and bjSplitStep's setup.
function splitInit(pair, bet, draw){
  return {
    hands: [[pair[0], draw()], [pair[1]]],
    bets: [bet, bet],
    doubled: [false, false],
    done: [false, false],
  };
}
// splitResplit: resplitting the active sub-hand into two (its 2nd card draws now; the new second
// sub-hand waits, same as the initial split). Mirrors bjSplit()'s split branch and bjSplitStep's
// 'split' action. Returns new arrays (caller assigns via splice or replaces wholesale).
function splitResplit(hands, bets, doubled, done, active, draw){
  const [c0,c1]=hands[active];
  const newHands=hands.slice(); newHands.splice(active,1,[c0,draw()],[c1]);
  const newBets=bets.slice(); newBets.splice(active,1,bets[active],bets[active]);
  const newDoubled=doubled.slice(); newDoubled.splice(active,1,false,false);
  const newDone=done.slice(); newDone.splice(active,1,false,false);
  return {hands:newHands, bets:newBets, doubled:newDoubled, done:newDone};
}
// splitAdvance: marks the active sub-hand done and picks the next undone one. Mirrors
// bjAdvanceSplit / bjSplitStep's advance(). Returns {done, active, allDone}; when allDone the caller
// moves on to the dealer (no next hand to deal a 2nd card to).
function splitAdvance(done, active){
  const newDone=done.slice(); newDone[active]=true;
  const next=newDone.indexOf(false);
  return {done:newDone, active: next===-1?active:next, allDone: next===-1};
}
// splitIsActionable: true once the active sub-hand has its 2nd card and is still under 21 (needs a
// player decision). False means it auto-resolves (21/BJ or a bust already showing on 1 card can't
// happen pre-2nd-card): the caller deals the missing 2nd card first, THEN re-checks. Mirrors
// bjCheckSplitHand's `hVal(hand)>=21` gate and bjSplitStep's settleToActionable loop condition.
function splitIsActionable(hand){ return hVal(hand)<21; }

// Settles all bets and records history. dealerDrawn=true means the dealer already animated; false means we skip straight to resolve (e.g. player blackjack).
// Settlement Ledger for a settled Blackjack hand: the ONE credit mapping shared by the live settle
// (bjResolve) and the replay Engine. PURE: returns the list of {op,n,reason} entries (applied via
// applyLedger), no acct, no S. The stake was debited at deal, so a win/blackjack returns stake +
// profit, a push the stake, a loss/bust nothing. Entries are built via mkCredit/mkDebit (core.js): 
// which validate {op,n,reason}, so a typo'd reason throws in strict mode instead of entering the ledger silently.
function bjAward(result, bet, delta){
  if(result==='blackjack') return [mkCredit(bet+delta, 'bj-blackjack')];
  if(result==='win')       return [mkCredit(bet+delta, 'bj-win')];
  if(result==='push')      return [mkCredit(bet,       'bj-push')];
  return [];
}
// Per sub-hand Ledger for a split: no blackjack branch (a split hand can't be a natural).
function bjAwardSplit(result, bet, delta){
  if(result==='win')  return [mkCredit(bet+delta, 'bj-split-win')];
  if(result==='push') return [mkCredit(bet,       'bj-split-push')];
  return [];
}
// The day's Blackjack rule bundle: a PURE function of the mod accessor (getMod live, the engine's
// _engMod in replay), mirroring roulette's spinModsFor. ONE place the BJ payout/rule scalars are
// derived, so live and replay can't compute them differently. Card-forcing swaps
// (first_ace, safe_hit) keep reading the accessor directly in their helpers, by design.
function bjRulesFor(mod){
  return {
    payout:      mod('bj_payout') || 1.5,        // blackjack payout ratio
    standAt:     mod('bj_dealer_stand') || 17,   // dealer draws below this total
    doubleBonus: !!mod('bj_double_bonus'),       // a successful double pays 2× profit
    wildSplit:   !!mod('bj_wild_split'),         // split any two; split wins pay 2×
    twoHands:    !!mod('bj_two_hands'),           // Double Vision: deal two starting hands, pick one
  };
}
function bjRules(){ return bjRulesFor(getMod); } // live snapshot: the only getMod read for BJ rules

function bjResolve(dealerDrawn=false){
  // Idempotency guard (see _resolveRoulette): settle a hand exactly once. bjResolve is fired
  // from timers (deal celebration, dealer-reveal step) and the refresh-resume path, so a stray
  // or duplicate timer must not credit the payout and push a second history entry twice. It only
  // ever runs from the 'play' phase and flips to 'result' at the end, so bail if we're past that.
  if(S.bjPhase!=='play')return;
  const R=bjRules(); // the day's BJ rule bundle (same shape the engine builds from _engMod)
  if(!dealerDrawn){S.bjDealerAnimFrom=1;}
  while(hVal(S.bjDealer)<R.standAt)S.bjDealer.push(_bjDraw());
  const dv=hVal(S.bjDealer),dBJ=isBJ(S.bjDealer);
  const wm=winMult();
  const acct=liveAcct();
  if(S.bjSplit){
    let totalDelta=0;
    const spm=R.wildSplit?2:1; // wild split: winning hands pay 2× profit
    const handResults=S.bjSplitHands.map((hand,i)=>{
      const bet=S.bjSplitBets[i];
      const ddm=R.doubleBonus&&S.bjSplitDoubled[i]?2:1; // double-down profit multiplier
      const {result,delta}=resolveBJSplitHand({pv:hVal(hand),dv,bet,wm,ddm,spm});
      applyLedger(acct,bjAwardSplit(result,bet,delta));
      totalDelta+=delta;return{result,delta,bet};
    });
    S.bjSplitResults=handResults;
    S.bjResult={result:'split',delta:totalDelta};
    S.bjHistory.push(mkOutcome('bj',totalDelta,'split',{bet:S.bjSplitBets.reduce((a,b)=>a+b,0),player:S.bjSplitHands.map(h=>[...h]),dealer:[...S.bjDealer]}));
  }else{
    const bjMult = R.payout;
    const ddm=R.doubleBonus&&S.bjDoubled?2:1; // double-down profit multiplier
    const {result,delta}=resolveBJHand({pv:hVal(S.bjPlayer),pBJ:isBJ(S.bjPlayer),dv,dBJ,bet:S.bjBet,wm,bjMult,ddm});
    applyLedger(acct,bjAward(result,S.bjBet,delta));
    S.bjResult={result,delta};
    S.bjHistory.push(mkOutcome('bj',delta,result,{bet:S.bjBet,player:[...S.bjPlayer],dealer:[...S.bjDealer]}));
  }
  S.bjHand++;S.bjPhase='result';navRender(); // crossfade play → result panel
  updateChipDisplay();
  const {result:_bjr,delta:_bjd}=S.bjResult;
  if(S.bjSplit?_bjd>0:_bjr==='win')setTimeout(sndBigWin,400);
}

// ─── BLACKJACK RENDER ─────────────────────────────────────────
// Renders the hand-val div for result screens. Handles bust class/text and the BJ case.
function _handValDiv(val, style='', cls='') {
  return `<div class="hand-val ${val>21?'bust':cls}"${style?` style="${style}"`:''}>${val}${val>21?' BUST':cls==='bj'?' BJ!':''}</div>`;
}
function bjDealerHTML(){
  // During the staggered reveal the total counts up in lock-step with the cards: score only the cards
  // dealt so far (through S.bjDealerAnimFrom, the one animating in on this step) instead of jumping to
  // the full total while later hit cards are still sliding in. clamp guards a stale/ANIM_NONE animFrom.
  const shown = S.bjDealerReveal
    ? S.bjDealer.slice(0, Math.min(S.bjDealerAnimFrom, S.bjDealer.length - 1) + 1)
    : S.bjDealer;
  const dv=hVal(shown);
  const valHTML = S.bjDealerReveal
    ? `<div class="hand-val ${dv>21?'bust':''}">${hValDisplay(shown)}${dv>21?' BUST':''}</div>`
    : `<div class="hand-val hand-val-ghost" style="visibility:hidden">&nbsp;</div>`;
  return S.bjDealerReveal
    ?`<div class="sec">Dealer${dv>21?' · BUST':''}</div>
      <div class="hand">${renderCards(S.bjDealer,'lg',S.bjDealerAnimFrom,0.85,0.1)}</div>
      ${valHTML}`
    :`<div class="sec">Dealer Shows${peekRevealed()?` · <span style="color:var(--gold-hi);font-size:.7rem">${icon('eye')} Peeked</span>`:''}</div>
      <div class="dealer-hand-row">
        <div class="hand">${cardHTML(S.bjDealer[0],'lg','',S.bjDealerAnimFrom<=0?0.9:0,S.bjDealerAnimFrom<=0)} ${peekRevealed()?cardHTML(S.bjDealer[1],'lg','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','lg')}</div>
        ${peekBtnHTML()}
      </div>
      ${valHTML}`;
}

// Renders the Hit/Stand/Double/Split row from bjCanAct(): the SAME eligibility resolver bjHit/
// bjStand/bjDouble/bjSplit's own early-return guards consult, so a button is enabled here iff its
// handler would actually act on a click. `done21` is read only for the Split glow's
// cosmetic timing (see below), not for legality: that's entirely inside bjCanAct() now.
function bjActionBtns(){
  const{hit,stand,double,split}=bjCanAct();
  const wildSplit=getMod('bj_wild_split');
  const done21=hVal(S.bjSplit?S.bjSplitHands[S.bjSplitActive]:S.bjPlayer)===21;
  // The glow is a "you get a free upgrade" nudge, not a legality signal · it intentionally uses a
  // narrower "not mid-reveal" condition than the full `locked` (which also covers the brief
  // _bjResolving window), matching the pre-convergence behavior.
  const splitLit=wildSplit&&split&&!done21&&!S.bjDealerReveal;
  return`<div id="${DOM.bjActBtns}" class="act-btns">
    <button class="act-btn" onclick="bjHit()" ${hit?'':'disabled'}>Hit</button>
    <button class="act-btn" onclick="bjStand()" ${stand?'':'disabled'}>Stand</button>
    <button class="act-btn" onclick="bjDouble()" ${double?'':'disabled'}>Double</button>
    <button class="act-btn${splitLit?' btn-peek-glow':''}" onclick="bjSplit()" ${split?'':'disabled'}>${wildSplit?'Split 2×':'Split'}</button>
  </div>`;
}

// Re-syncs the action buttons' disabled attrs to bjCanAct() after a surgical (non-render) card
// change: a hit ends Double/Split eligibility mid-hand, but the button row stays in the DOM, so
// without this the buttons keep their deal-time enabled look while their handlers no-op.
// Button order must match bjActionBtns(): Hit, Stand, Double, Split.
function _bjSyncActBtns(){
  const row=document.getElementById(DOM.bjActBtns);
  if(!row)return;
  const{hit,stand,double,split}=bjCanAct();
  [hit,stand,double,split].forEach((ok,i)=>{ if(row.children[i]) row.children[i].disabled=!ok; });
}

function peekBtnHTML(){
  const limit=getMod('peek');
  if(!limit||S.peeksUsed>=limit) return '';
  const left=limit-S.peeksUsed;
  return `<div id="${DOM.peekBtnWrap}"><button class="btn-peek-glow" onclick="doPeek()" style="background:rgba(196,147,58,.12);border:1.5px solid rgba(196,147,58,.5);color:var(--gold-hi);padding:11px 20px;border-radius:8px;font-size:1.25rem;font-weight:700;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;line-height:1.15;white-space:nowrap">${icon('magnifying-glass')} Peek<span style="display:block;font-size:.78rem;font-weight:400;opacity:.7;letter-spacing:.04em">${left} left today</span></button></div>`;
}

// The current hand index for the active dealer-card screen, or -1 if peek doesn't apply here.
function _peekHand(){ return S.screen==='bj'?S.bjHand:S.screen==='uth'?S.uthHand:-1; }

// True only when the peek was used on THIS exact game+hand. Keeps the revealed
// hole card from leaking onto later hands or the other game.
function peekRevealed(){
  if(!getMod('peek')||!S.peekAt) return false;
  return S.peekAt.game===S.screen && S.peekAt.hand===_peekHand();
}

function doPeek(){
  const limit=getMod('peek');
  if(!limit||S.peeksUsed>=limit) return;
  mutate(() => { // persist the peek usage before touching the DOM below
    S.peeksUsed++;
    S.peekAt={game:S.screen,hand:_peekHand()};
  });
  const btn=document.getElementById(DOM.peekBtnWrap);
  if(btn) btn.style.display='none';
  const glow='box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px';
  if(S.screen==='bj'){
    const sec=document.getElementById(DOM.bjDealerSection);
    if(sec){
      const lbl=sec.querySelector('.sec');
      if(lbl) lbl.innerHTML=`Dealer Shows · <span style="color:var(--gold-hi);font-size:.7rem">${icon('eye')} Peeked</span>`;
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
    const lbl=document.getElementById(DOM.uthDealerSec);
    const hand=document.getElementById(DOM.uthDealerHand);
    if(lbl&&hand&&hand.children.length>=1){
      lbl.innerHTML=`Dealer · <span style="color:var(--gold-hi);font-size:.7rem">${icon('eye')} Peeked</span>`;
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
        ?`<div class="sec" style="text-align:center"><span class="sec-game-prefix">Blackjack · </span>All In or Skip · Wins Pay 2×</div>
          ${aiosRow('allIn();bjDeal()', 'bjSkip()')}`
        :(()=>{
          const bjMult=getMod('bj_payout')||1.5;
          const payTxt=bjMult===1.5?'3 to 2':bjMult===2?'2 to 1':bjMult===3?'3 to 1':`${bjMult}×`;
          const standAt=getMod('bj_dealer_stand')||17;
          return `<div class="sec" style="text-align:center"><span class="sec-game-prefix">Blackjack · </span>Place Your Bet</div>
          <div class="bj-bet-table">
            <div class="bj-bet-slot-row">
              <div class="bj-bet-slot-lbl">Dealer</div>
              <div class="bj-bet-slots"><div class="card-slot"></div><div class="card-slot"></div></div>
            </div>
            <div class="felt-rules">
              <div class="felt-rule-line">Blackjack pays ${payTxt}</div>
              <div class="felt-rule-line">Dealer must draw to ${standAt-1} and stand on all ${standAt}s</div>
            </div>
            <div class="bj-bet-slot-row">
              <div class="bj-bet-slot-lbl">Your hand</div>
              <div class="bj-bet-slots"><div class="card-slot"></div><div class="card-slot"></div></div>
            </div>
          </div>
          ${chipSel(maxBet(),S.bjBet)}
          <button id="${DOM.dealBtn}" class="btn-gold" style="margin-top:6px" onclick="bjDeal()" ${S.bjBet===0?'disabled':''}>Deal ${icon('shuffle',{cls:'btn-icon-gap'})}</button>`;})()}
    </div>`;
  }
  if(ph==='pick'){
    // Double Vision: the dealer upcard is visible; the two candidate hands are shown side by side in the
    // middle (where the play hand sits), and the keep action is two solid-gold buttons in the action-
    // button zone: Hand 1 on the left (the Hit/Stand half), Hand 2 on the right (the Double/Split half).
    // The bottom cluster mirrors the play screen exactly, so the bet inlay lands in the same spot.
    const [A,B]=S.bjCandidates||[[],[]];
    const cand=(hand)=>`<div style="text-align:center">
      <div class="hand bj-pick-cards" style="justify-content:center">${renderCards(hand,'sm',0,0.4,0.1)}</div>
      <div class="bj-pick-val">${hValDisplay(hand)}</div>
    </div>`;
    const pickBtn=(hand,i,lbl)=>`<button class="act-btn primary bj-pick-btn" onclick="bjPickHand(${i})">
      <span class="bj-pick-btn-lbl">${lbl}</span><span class="bj-pick-btn-val">${hValDisplay(hand)}</span>
    </button>`;
    return `${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
<div class="panel" style="display:flex;flex-direction:column">
  ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
  <div class="divider"></div>
  <div id="${DOM.bjDealerSection}" class="vband" style="text-align:center">${bjDealerHTML()}</div>
  <div class="divider"></div>
  <div class="vband" style="text-align:center">
    <div class="sec">Pick a Hand</div>
    <div class="bj-pick-row">${cand(A)}${cand(B)}</div>
  </div>
  <div class="divider"></div>
  <div>
    ${gameControls(betInlay('Bet', cfmt(S.bjBet)), `<div class="act-btns">${pickBtn(A,0,'Hand 1')}${pickBtn(B,1,'Hand 2')}</div>`)}
  </div>
</div>`;
  }
  if(ph==='play'){
    if(S.bjSplit){
      const ai=S.bjSplitActive;
      const activeHand=S.bjSplitHands[ai];
      const pv=hVal(activeHand),bust=pv>21,done21=pv===21,pvStr=S.bjDealerReveal?String(pv):hValDisplay(activeHand);
      const af=S.bjSplitAnimFrom[ai]??0;
      return `${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
<div class="panel" style="display:flex;flex-direction:column">
        ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
        <div class="divider"></div>
        <div id="${DOM.bjDealerSection}" class="vband" style="text-align:center">${bjDealerHTML()}</div>
        <div class="divider"></div>
        <div class="vband">
        ${S.bjSplitHands.length>1?`<div class="bj-split-aside">
          ${S.bjSplitHands.map((hand,i)=>{if(i===ai)return'';const hv=hVal(hand);const isDone=S.bjSplitDone[i];return`<div style="text-align:center;opacity:${isDone?0.55:0.8}">
            <div class="sec bj-split-lbl">Hand ${i+1} (${cfmt(S.bjSplitBets[i])})</div>
            <div class="hand hand-fan" style="justify-content:center">${renderCards(hand,'sm')}</div>
            <div class="bj-split-val" style="color:${hv>21?'var(--lose)':'var(--shadow)'}">${hv}${hv>21?' BUST':''}</div>
          </div>`;}).join('')}
        </div>`:''}
        <div class="bj-split-active" style="text-align:center;">
          <div class="sec bj-active-lbl">Hand ${ai+1} <span class="bj-active-bet">· Bet ${cfmt(S.bjSplitBets[ai])}</span></div>
          <div id="${DOM.bjActiveHand}" class="hand">${renderCards(activeHand,'lg',af,0.4,0.1)}</div>
          ${S.bjCelebrating||isBJ(activeHand)
            ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}"><div class="bj-celebrate-txt">Blackjack!</div></div>`
            :`<div id="${DOM.bjActiveVal}" class="hand-val ${bust?'bust':done21?'bj':''}">${bust?pvStr+' BUST':done21?'21!':pvStr}</div>`}
        </div>
        </div>
        <div class="divider"></div>
        <div style="margin-top:auto;">
          ${gameControls(betInlay('Total Bet', cfmt(S.bjSplitBets.reduce((a,b)=>a+b,0))), (S.bjCelebrating||done21)?'':bjActionBtns())}
        </div>
</div>`;
    }
    const pv=hVal(S.bjPlayer),bust=pv>21,done21=pv===21,pvStr=S.bjDealerReveal?String(pv):hValDisplay(S.bjPlayer);
    return `${hdr('Blackjack · Hand '+(S.bjHand+1)+' of 3')}
<div class="panel" style="display:flex;flex-direction:column">
  ${gameDots(S.bjHistory,S.bjHand,S.bjPhase)}
  <div class="divider"></div>
  <div id="${DOM.bjDealerSection}" class="vband" style="text-align:center">${bjDealerHTML()}</div>
  <div class="divider"></div>
  <div class="vband" style="text-align:center">
    <div class="sec">Your Hand</div>
    <div id="${DOM.bjPlayerHand}" class="hand">${renderCards(S.bjPlayer,'lg',S.bjAnimFrom,0.4,0.1)}</div>
    ${(S.bjCelebrating||isBJ(S.bjPlayer))
      ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}">
          <div class="bj-celebrate-txt">Blackjack!</div>
          ${isBJ(S.bjPlayer)?`<div style="font-size:.72rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.22em;margin-top:6px">Pays 3 · 2</div>`:''}
        </div>`
      :`<div id="${DOM.bjPlayerVal}" class="hand-val ${bust?'bust':done21?'bj':''}">${bust?pvStr+' BUST':done21?'21!':pvStr}</div>`}
  </div>
  <div class="divider"></div>
  <div>
    ${gameControls(betInlay('Bet', cfmt(S.bjBet)), (S.bjCelebrating||done21)?'':bjActionBtns())}
  </div>
</div>`;
  }
  // result
  const res=S.bjResult;
  const {text:btnText, action:btnAction} = resultAdvanceBtn(S.bjHand>=3, NEXT_SCREEN['bj']);

  if(S.bjSplit){
    const dv=hVal(S.bjDealer);
    // 'BJ' (not 'Blackjack') so the label never wraps in the tight 3-/4-across grid.
    const RES_LBL2={win:'Win!',push:'Push',bust:'Bust',lose:'Lose',blackjack:'BJ'};
    const splitNet=S.bjSplitResults.reduce((a,r)=>a+r.delta,0);
    return `${hdr('Blackjack · Split Result')}
    ${_resultPanel(
      gameDots(S.bjHistory,S.bjHand,S.bjPhase), splitNet,
      splitNet>0?'You Win!':splitNet<0?'You Lose!':'Push',
      `<div class="bj-sr-dealer">
        <div class="sec sec-sm">Dealer</div>
        <div class="hand" style="justify-content:center">${renderCards(S.bjDealer,'sm',S.bjDealerAnimFrom,0.75,0.15)}</div>
        ${_handValDiv(dv,'font-size:1.6rem')}
      </div>
      <div class="divider"></div>
      <div class="bj-sr-hands" style="display:flex;flex-wrap:${S.bjSplitHands.length===4?'wrap':'nowrap'};justify-content:space-evenly;gap:8px;margin-bottom:14px">
        ${S.bjSplitHands.map((hand,i)=>{const r=S.bjSplitResults[i];const hv=hVal(hand);return`<div style="text-align:center;${S.bjSplitHands.length===4?'flex:0 0 calc(50% - 8px);min-width:0':'flex:1'}">
          <div class="sec" style="font-size:.85rem">Hand ${i+1}: <span style="color:${col(r.delta)}">${RES_LBL2[r.result]||r.result}</span></div>
          <div style="font-size:1rem;color:${col(r.delta)};margin-bottom:4px">${csign(r.delta)}</div>
          <div class="hand hand-fan" style="justify-content:center">${renderCards(hand,'sm')}</div>
          ${_handValDiv(hv,'font-size:1.4rem')}
        </div>`;}).join('')}
      </div>`,
      btnAction, btnText, 'bj-split-result sr-'+S.bjSplitHands.length
    )}`;
  }
  const dv=hVal(S.bjDealer), pv=hVal(S.bjPlayer);
  const bjMult = getMod('bj_payout') || 1.5;
  const RES_LBL={win:'You Win!',blackjack:'Blackjack!',push:'Push',bust:'You Bust!',lose:'You Lose!'};
  // Name the loss for what it is when the dealer turned over a natural blackjack (the casino peek),
  // so the player understands why the hand ended before they could act.
  const headline = res.result === 'blackjack' && bjMult === 2 ? `Mega Blackjack! ${icon('diamond',{fill:true})}`
    : res.result === 'lose' && isBJ(S.bjDealer) ? 'Dealer Blackjack'
    : RES_LBL[res.result];
  return `${hdr('Blackjack · Result')}
  ${_resultPanel(
    gameDots(S.bjHistory, S.bjHand, S.bjPhase), res.delta,
    headline,
    `<div style="display:flex;flex-direction:column;gap:16px;align-items:center;margin-bottom:14px">
      ${renderBJResultDealer(dv, 0)}
      <div class="gold-divider"></div>
      ${renderBJResultPlayer(pv, res.result)}
    </div>`,
    btnAction, btnText
  )}`;
}

function renderBJResultDealer(dv, dOff) {
  return `<div style="text-align:center">
        <div class="sec sec-sm">Dealer</div>
        <div class="hand">${renderCards(S.bjDealer,'sm',S.bjDealerAnimFrom,0.75,dOff+0.05)}</div>
        ${_handValDiv(dv, 'font-size:1.6rem')}
      </div>`;
}

function renderBJResultPlayer(pv, result) {
  return `<div style="text-align:center">
        <div class="sec sec-sm">You</div>
        <div class="hand">${renderCards(S.bjPlayer,'sm')}</div>
        ${_handValDiv(pv, 'font-size:1.6rem', result==='blackjack'?'bj':'')}
      </div>`;
}
