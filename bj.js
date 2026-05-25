// ─── BLACKJACK LOGIC ──────────────────────────────────────────
// Mutex flag — prevents double-actions while cards are mid-animation.
let _bjResolving=false;

function resetBJHand(){
  S.bjBet=0; S.bjPhase='bet'; S.bjPlayer=[]; S.bjDealer=[];
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0;
  S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[];
  S.bjAnimFrom=0; S.bjDealerAnimFrom=0; S.bjSplitAnimFrom=[];
  S.bjResultAnimPlayer=false; S.bjDealerReveal=false; S.bjCelebrating=false;
  _bjResolving=false;
}

/** Skip the current BJ hand (all_in_or_skip modifier). Records delta 0 and advances. */
function bjSkip(){
  S.bjHistory.push({bet:0,result:'skip',delta:0,player:[],dealer:[]});
  S.bjHand++;
  if(S.bjHand>=3){advanceTo(GAME2);return;}
  resetBJHand();
  render();
}

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
  // At 21+ the player can't act; auto-advance after a short delay so the card is visible.
  if(pv>=21){_bjResolving=true;_noAnim=true;render();setTimeout(()=>{_bjResolving=false;isSplit?bjAdvanceSplit():bjRevealDealer();},700);}
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

// After a split hand gets its second card, check if it's already at 21/BJ before the player acts.
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
      S.bjDealer.push(G.bjShoe[S.bjIdx++]);
      S.bjDealerAnimFrom=at; // only animate the new card
      _noAnim=true;render();
      sndCard(100);
      setTimeout(step,800);
    }else{
      setTimeout(()=>{S.bjDealerReveal=false;bjResolve(true);},1000);
    }
  }
  setTimeout(step,800);
}

/** Settles all bets and records history. dealerDrawn=true means the dealer already animated; false means we skip straight to resolve (e.g. player blackjack). */
function bjResolve(dealerDrawn=false){
  if(!dealerDrawn){S.bjDealerAnimFrom=1;}
  while(hVal(S.bjDealer)<(getMod('bj_dealer_stand')||17))S.bjDealer.push(G.bjShoe[S.bjIdx++]);
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

function bjNext(){
  resetBJHand();
  sndAdvance();
  if(S.chips<10){S.screen='results';render();}else render();
}

// ─── BLACKJACK RENDER ─────────────────────────────────────────
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
  const btnText=isBusted?'Game Over 💀':(isLast?`Round 2: ${GAME_META[GAME2].name} →`:'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?`advanceTo('${GAME2}')`:'bjNext()');

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
        <div class="sec" style="font-size:1rem">Dealer</div>
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
        <div class="sec" style="font-size:1rem">Dealer</div>
        <div class="hand">${S.bjDealer.map((c, i) => {
          const n = i >= S.bjDealerAnimFrom;
          return cardHTML(c, 'sm', '', n ? dOff + (i - S.bjDealerAnimFrom) * 0.75 + 0.05 : 0, n);
        }).join('')}</div>
        <div class="hand-val ${dv > 21 ? 'bust' : ''}" style="font-size:1.6rem">${dv}${dv > 21 ? ' BUST' : ''}</div>
      </div>`;
}

function renderBJResultPlayer(pv, result) {
  return `<div style="text-align:center">
        <div class="sec" style="font-size:1rem">You</div>
        <div class="hand">${S.bjPlayer.map((c, i) => {
          const n = S.bjResultAnimPlayer;
          return cardHTML(c, 'sm', '', n ? i * 0.4 + 0.1 : 0, n);
        }).join('')}</div>
        <div class="hand-val ${pv > 21 ? 'bust' : result === 'blackjack' ? 'bj' : ''}" style="font-size:1.6rem">${pv}${pv > 21 ? ' BUST' : result === 'blackjack' ? ' BJ!' : ''}</div>
      </div>`;
}
