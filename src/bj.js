// ─── BLACKJACK LOGIC ──────────────────────────────────────────
const BJ_RESUME_MS    = 300;   // minimum re-entry delay when resuming after a page refresh
const BJ_ADVANCE_MS   = 700;   // delay after hitting 21 or doubling before advancing play
const BJ_HIT_MS       = 800;   // interval between dealer hit steps
const BJ_RESOLVE_MS   = 1000;  // delay after dealer finishes drawing before settling bets
const BJ_CELEBRATE_MS = 1500;  // inner duration of the blackjack celebration animation

// Mutex flag — prevents double-actions while cards are mid-animation.
let _bjResolving=false;

// Called once on boot — if the page was refreshed while cards were mid-animation,
// the saved state has a resolved hand but the setTimeout chain is gone.
// Re-enter the appropriate step so the hand can resolve.
function _bjResumeAfterRefresh(){
  if(S.screen!=='bj'||S.bjPhase!=='play')return;
  const standAt=getMod('bj_dealer_stand')||17;

  if(S.bjDealerReveal){
    // Interrupted mid-dealer-reveal; resume drawing cards.
    function step(){
      if(hVal(S.bjDealer)<standAt){
        const at=S.bjDealer.length;
        S.bjDealer.push(DEAL.bjShoe[S.bjIdx++]);
        S.bjDealerAnimFrom=at;
        _noAnim=true;render();
        sndCard(100);
        setTimeout(step,BJ_HIT_MS);
      }else{
        setTimeout(()=>{S.bjDealerReveal=false;bjResolve(true);},BJ_RESOLVE_MS);
      }
    }
    setTimeout(step,BJ_RESUME_MS);
    return;
  }

  // Interrupted after player hand resolved but before dealer reveal started.
  if(S.bjCelebrating){
    // Player blackjack animation was cut off; jump straight to resolve.
    setTimeout(()=>{S.bjCelebrating=false;bjResolve();},BJ_RESUME_MS);
    return;
  }
  if(!S.bjSplit&&hVal(S.bjPlayer)>=21){
    // Player busted or hit to 21; dealer reveal never fired.
    setTimeout(bjRevealDealer,BJ_RESUME_MS);
    return;
  }
  if(S.bjSplit){
    if(S.bjSplitDone.length&&S.bjSplitDone.every(d=>d)){
      // All split hands resolved; dealer reveal never fired.
      setTimeout(bjRevealDealer,BJ_RESUME_MS);
    } else {
      const ai=S.bjSplitActive,hand=S.bjSplitHands[ai];
      if(hand&&hVal(hand)>=21) setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},BJ_RESUME_MS);
    }
  }
}

function resetBJHand(){
  S.bjBet=0; S.bjPhase='bet'; S.bjPlayer=[]; S.bjDealer=[];
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0;
  S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[];
  S.bjAnimFrom=0; S.bjDealerAnimFrom=0; S.bjSplitAnimFrom=[];
  S.bjDealerReveal=false; S.bjCelebrating=false;
  _bjResolving=false;
}

/** Skip the current BJ hand (all_in_or_skip modifier). Records delta 0 and advances. */
function bjSkip(){ _skipHand(S.bjHistory,{bet:0,result:'skip',delta:0,player:[],dealer:[]},'bjHand',NEXT_SCREEN['bj'],resetBJHand); }

/** Handles the initial deal for a Blackjack hand. */
function bjDeal(){
  if(!S.bjBet)return;
  S.chips-=S.bjBet;
  S.bjAnimFrom=0;S.bjDealerAnimFrom=0;
  if(getMod('bj_first_ace')&&DEAL.bjShoe[S.bjIdx]?.r!=='A'){
    const ai=DEAL.bjShoe.findIndex((c,i)=>i>S.bjIdx&&c.r==='A');
    if(ai!==-1)[DEAL.bjShoe[S.bjIdx],DEAL.bjShoe[ai]]=[DEAL.bjShoe[ai],DEAL.bjShoe[S.bjIdx]];
  }
  S.bjPlayer=[DEAL.bjShoe[S.bjIdx++],DEAL.bjShoe[S.bjIdx++]];
  S.bjDealer=[DEAL.bjShoe[S.bjIdx++],DEAL.bjShoe[S.bjIdx++]];
  const db=document.getElementById('db');if(db)db.disabled=true;
  const bjMult = getMod('bj_payout') || 1.5;
  sndShuffle(()=>{
    if(isBJ(S.bjPlayer)){
      S.bjPhase='play';S.bjCelebrating=true;
      _noAnim=true;render();
      sndCard(100);sndCard(500);
      setTimeout(()=>{sndBigWin();setTimeout(()=>{S.bjCelebrating=false;bjResolve();},BJ_CELEBRATE_MS);},1000);
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
  hand.push(DEAL.bjShoe[S.bjIdx++]);
  sndCard(100);
  const pv=hVal(hand);
  // At 21+ the player can't act; auto-advance after a short delay so the card is visible.
  if(pv>=21){_bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;isSplit?bjAdvanceSplit():bjRevealDealer();},BJ_ADVANCE_MS);}
  else{
    const handEl=document.getElementById(isSplit?'bj-active-hand':'bj-player-hand');
    const valEl=document.getElementById(isSplit?'bj-active-val':'bj-player-val');
    if(handEl&&valEl){
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
  if(S.bjSplit)setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},BJ_RESUME_MS);
  else setTimeout(()=>{_bjResolving=false;bjRevealDealer();},BJ_RESUME_MS);
}

/** Double the bet and receive exactly one more card. */
function bjDouble(){
  if(_bjResolving)return;
  if(S.bjSplit){
    const i=S.bjSplitActive;
    if(S.chips<S.bjSplitBets[i])return;
    S.bjSplitAnimFrom[i]=S.bjSplitHands[i].length;
    S.chips-=S.bjSplitBets[i];S.bjSplitBets[i]*=2;
    S.bjSplitDoubled[i]=true;
    updateChipDisplay();
    S.bjSplitHands[i].push(DEAL.bjShoe[S.bjIdx++]);
    sndCard(100);
    _bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},BJ_ADVANCE_MS);
  }else{
    if(S.chips<S.bjBet)return;
    S.bjAnimFrom=S.bjPlayer.length;
    S.chips-=S.bjBet;S.bjBet*=2;
    S.bjDoubled=true;
    updateChipDisplay();
    S.bjPlayer.push(DEAL.bjShoe[S.bjIdx++]);
    _bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjRevealDealer();},BJ_ADVANCE_MS);
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
    S.bjSplitHands.splice(ai,1,[c0,DEAL.bjShoe[S.bjIdx++]],[c1]);
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
    S.bjSplitHands=[[c0,DEAL.bjShoe[S.bjIdx++]],[c1]];
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

// After a split hand gets its second card, check if it's already at 21/BJ before the player acts.
function bjCheckSplitHand(){
  const hand=S.bjSplitHands[S.bjSplitActive];
  if(hVal(hand)>=21){
    if(isBJ(hand)){
      _bjResolving=true;S.bjCelebrating=true;_noAnim=true;render();
      sndCard(100);sndCard(500);
      setTimeout(()=>{sndBigWin();setTimeout(()=>{S.bjCelebrating=false;_bjResolving=false;bjAdvanceSplit();},BJ_CELEBRATE_MS);},1000);
    }else{_bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;bjAdvanceSplit();},BJ_ADVANCE_MS);}
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
      nextHand.push(DEAL.bjShoe[S.bjIdx++]);
    }
    sndCard(100);sndCard(500);
    bjCheckSplitHand();
  }
  else bjRevealDealer();
}

/** Reveals the dealer's hole card, then hits recursively every 800ms until standing (17+). */
function bjRevealDealer(){
  S.bjDealerReveal=true;
  S.bjDealerAnimFrom=1; // animate the hole card reveal
  S.bjAnimFrom=ANIM_NONE;S.bjSplitAnimFrom=S.bjSplitAnimFrom.map(()=>ANIM_NONE);
  _noAnim=true;render();
  sndCard(100);
  function step(){
    if(hVal(S.bjDealer)<(getMod('bj_dealer_stand')||17)){
      const at=S.bjDealer.length;
      S.bjDealer.push(DEAL.bjShoe[S.bjIdx++]);
      S.bjDealerAnimFrom=at; // only animate the new card
      _noAnim=true;render();
      sndCard(100);
      setTimeout(step,BJ_HIT_MS);
    }else{
      setTimeout(()=>{S.bjDealerReveal=false;bjResolve(true);},BJ_RESOLVE_MS);
    }
  }
  setTimeout(step,BJ_HIT_MS);
}

/** Settles all bets and records history. dealerDrawn=true means the dealer already animated; false means we skip straight to resolve (e.g. player blackjack). */
function bjResolve(dealerDrawn=false){
  if(!dealerDrawn){S.bjDealerAnimFrom=1;}
  while(hVal(S.bjDealer)<(getMod('bj_dealer_stand')||17))S.bjDealer.push(DEAL.bjShoe[S.bjIdx++]);
  const dv=hVal(S.bjDealer),dBJ=isBJ(S.bjDealer);
  const wm=winMult();
  if(S.bjSplit){
    let totalDelta=0;
    const handResults=S.bjSplitHands.map((hand,i)=>{
      const bet=S.bjSplitBets[i],pv=hVal(hand);
      const ddm=getMod('bj_double_bonus')&&S.bjSplitDoubled[i]?2:1; // double-down profit multiplier
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
    const ddm=getMod('bj_double_bonus')&&S.bjDoubled?2:1; // double-down profit multiplier
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

function bjNext(){ _nextHand(resetBJHand); }

// ─── BLACKJACK RENDER ─────────────────────────────────────────
// Renders the hand-val div for result screens. Handles bust class/text and the BJ case.
function _handValDiv(val, style='', cls='') {
  return `<div class="hand-val ${val>21?'bust':cls}"${style?` style="${style}"`:''}>${val}${val>21?' BUST':cls==='bj'?' BJ!':''}</div>`;
}
function bjDealerHTML(){
  const dv=hVal(S.bjDealer);
  const valHTML = S.bjDealerReveal
    ? `<div class="hand-val ${dv>21?'bust':''}">${hValDisplay(S.bjDealer)}${dv>21?' BUST':''}</div>`
    : `<div class="hand-val" style="visibility:hidden">&nbsp;</div>`;
  return S.bjDealerReveal
    ?`<div class="sec">Dealer${dv>21?' · BUST':''}</div>
      <div class="hand">${renderCards(S.bjDealer,'lg',S.bjDealerAnimFrom,0.85,0.1)}</div>
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
  return `<div id="peek-btn-wrap" style="text-align:center;margin-top:8px"><button class="btn-peek-glow" onclick="doPeek()" style="background:rgba(196,147,58,.12);border:1.5px solid rgba(196,147,58,.5);color:var(--gold-hi);padding:6px 18px;border-radius:8px;font-size:.8rem;font-weight:700;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;line-height:1.3">🔍 Peek<span style="display:block;font-size:.65rem;font-weight:400;opacity:.7;letter-spacing:.04em">1 remaining today</span></button></div>`;
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
          ${aiosRow('allIn();bjDeal()', 'bjSkip()')}`
        :`<div class="sec">Place Your Bet</div>
          ${chipSel(S.chips,S.bjBet)}
          <button id="db" class="btn-gold" style="margin-top:12px" onclick="bjDeal()" ${S.bjBet===0?'disabled':''}>Deal →</button>`}
    </div>`;
  }
  if(ph==='play'){
    if(S.bjSplit){
      const ai=S.bjSplitActive;
      const activeHand=S.bjSplitHands[ai];
      const pv=hVal(activeHand),bust=pv>21,done21=pv===21,pvStr=S.bjDealerReveal?String(pv):hValDisplay(activeHand);
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
            <div class="sec bj-split-lbl">Hand ${i+1} (${fmt(S.bjSplitBets[i])})</div>
            <div class="hand hand-fan" style="justify-content:center">${renderCards(hand,'sm')}</div>
            <div class="bj-split-val" style="color:${hv>21?'var(--lose)':'var(--shadow)'}">${hv}${hv>21?' BUST':''}</div>
          </div>`;}).join('')}
        </div>`:''}
        <div class="bj-split-active" style="text-align:center;flex:1;">
          <div class="sec bj-active-lbl">Hand ${ai+1}</div>
          <div id="bj-active-hand" class="hand">${renderCards(activeHand,'lg',af,0.4,0.1)}</div>
          ${S.bjCelebrating||isBJ(activeHand)
            ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}"><div class="bj-celebrate-txt">Blackjack!</div></div>`
            :`<div id="bj-active-val" class="hand-val ${bust?'bust':done21?'bj':''}">${bust?pvStr+' BUST':done21?'21!':pvStr}</div>`}
        </div>
        <div style="margin-top:auto;">
          ${(S.bjCelebrating||done21)?'':bjActionBtns(bust,done21,can2,canResplit)}
          <div class="irow" style="margin-top:10px"><span class="ik">Hand ${ai+1} Bet</span><span class="iv">${fmt(S.bjSplitBets[ai])} chips</span></div>
        </div>
</div>`;
    }
    const pv=hVal(S.bjPlayer),bust=pv>21,done21=pv===21,pvStr=S.bjDealerReveal?String(pv):hValDisplay(S.bjPlayer);
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
    <div id="bj-player-hand" class="hand">${renderCards(S.bjPlayer,'lg',S.bjAnimFrom,0.4,0.1)}</div>
    ${(S.bjCelebrating||isBJ(S.bjPlayer))
      ?`<div style="${S.bjDealerReveal?'':'animation:fadein .4s .6s ease both'}">
          <div class="bj-celebrate-txt">Blackjack!</div>
          ${isBJ(S.bjPlayer)?`<div style="font-size:.72rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.22em;margin-top:6px">Pays 3 · 2</div>`:''}
        </div>`
      :`<div id="bj-player-val" class="hand-val ${bust?'bust':done21?'bj':''}">${bust?pvStr+' BUST':done21?'21!':pvStr}</div>`}
  </div>
  <div style="margin-top:auto;">
    ${(S.bjCelebrating||done21)?'':bjActionBtns(bust,done21,can2,canSplit)}
    <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${fmt(S.bjBet)} chips</span></div>
  </div>
</div>`;
  }
  // result
  const res=S.bjResult, isLast=S.bjHand>=3;
  const isBusted=isChipBusted();
  const btnText=isBusted?'Game Over 💀':(isLast?`Round 2: ${GAME_META[GAME2].name} →`:'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?`advanceTo('${GAME2}')`:'bjNext()');

  if(S.bjSplit){
    const dv=hVal(S.bjDealer);
    const RES_LBL2={win:'Win!',push:'Push',bust:'Bust',lose:'Lose'};
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
          <div style="font-size:1rem;color:${col(r.delta)};margin-bottom:4px">${sign(r.delta)}</div>
          <div class="hand hand-fan" style="justify-content:center">${renderCards(hand,'sm')}</div>
          ${_handValDiv(hv,'font-size:1.4rem')}
        </div>`;}).join('')}
      </div>`,
      btnAction, btnText, 'bj-split-result'
    )}`;
  }
  const dv=hVal(S.bjDealer), pv=hVal(S.bjPlayer);
  const bjMult = getMod('bj_payout') || 1.5;
  const RES_LBL={win:'You Win!',blackjack:'Blackjack! 🂡',push:'Push',bust:'You Bust!',lose:'You Lose!'};
  return `${hdr('Blackjack · Result')}
  ${_resultPanel(
    gameDots(S.bjHistory, S.bjHand, S.bjPhase), res.delta,
    res.result === 'blackjack' && bjMult === 2 ? 'Mega Blackjack! 💎' : RES_LBL[res.result],
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
