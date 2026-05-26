
// ─── POKER HAND EVALUATION ────────────────────────────────────────────────

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

// Checks all C(7,5)=21 five-card combinations by dropping each pair (i,j), returns the best.
function bestOf7(cards){
  let best=null,bs=-1,bc=0;
  for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){
    const five=cards.filter((_,k)=>k!==i&&k!==j);
    const{cat,score}=handScore(five);
    if(score>bs){bs=score;bc=cat;best=five;}
  }
  return{cards:best,score:bs,cat:bc,rank:rankPoker(best)};
}

// Blind bonus payout: cat is the hand category (9=Royal Flush … 0=High Card).
// Base amounts match the standard UTH blind paytable; boost/extended come from modifiers.
function uthBlindDelta(cat,blind){
  const extended=getMod('uth_blind_extended');
  const boost=getMod('uth_blind_boost')||1;
  let base=0;
  if(cat===9)base=blind*500;       // Royal Flush
  else if(cat===8)base=blind*50;   // Straight Flush
  else if(cat===7)base=blind*10;   // Four of a Kind
  else if(cat===6)base=blind*3;    // Full House
  else if(cat===5)base=Math.floor(blind*1.5); // Flush
  else if(cat===4)base=blind;      // Straight
  else if(extended&&cat===3)base=blind;          // Three of a Kind (extended only)
  else if(extended&&cat===2)base=Math.floor(blind*0.5); // Two Pair (extended only)
  return Math.floor(base*boost);
}

// ─── UTH / POKER STATE ───────────────────────────────────────────────────

function resetUTHHand(){
  S.uthAnte=0; S.uthPhase='bet'; S.uthPlay=0; S.uthPlayMult=0;
  S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[];
  S.uthRevealComm=0; S.uthPrevRevealComm=0;
}

/** Skip the current UTH hand (all_in_or_skip modifier). Records delta 0 and advances. */
function uthSkip(){
  S.uthHistory.push({ante:0,blind:0,play:0,playMult:0,result:'skip',delta:0});
  S.uthHand++;
  if(S.uthHand>=3){advanceTo(NEXT_SCREEN['uth']);return;}
  resetUTHHand();
  render();
}

/** Skip the current poker hand (all_in_or_skip modifier). Records delta 0 and advances. */
function pkSkip(){
  S.pkHistory.push({bet:0,result:'skip',pts:0,delta:0});
  S.pkHand++;
  if(S.pkHand>=3){advanceTo(NEXT_SCREEN['poker']);return;}
  S.pkBet=0;S.pkPhase='bet';
  render();
}

// ─── 5-CARD POKER LOGIC ──────────────────────────────────────────────────

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
  const wm=winMult();
  const profit=res.p>0?S.pkBet*res.p*wm:0;
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

// ─── ULTIMATE TEXAS HOLD'EM LOGIC ────────────────────────────────────────

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
    sndCard(100);sndCard(500);
  });
}
// Reveal the first 3 community cards (flop). Sounds staggered to match card-flip animation.
function _uthDealFlop(){
  S.uthPrevRevealComm=0;S.uthRevealComm=3;S.uthPhase='flop';
  updateUthCommunityCards();
}
// Reveal community cards 4 and 5 (turn + river combined).
function _uthDealTurn(){
  S.uthPrevRevealComm=3;S.uthRevealComm=5;S.uthPhase='turn';
  updateUthCommunityCards();
}
function uthRaise(mult){
  const bet=(S.uthAnte/2)*mult;
  if(S.chips<bet)return;
  S.chips-=bet;S.uthPlay=bet;S.uthPlayMult=mult;S.uthRaised=true;
  sndChip();
  if(S.uthPhase==='preflop'){_uthDealFlop();updateChipDisplay();}
  else if(S.uthPhase==='flop'){_uthDealTurn();updateChipDisplay();}
  else if(S.uthPhase==='turn'){uthResolve();}
}
function uthCheck(){
  if(S.uthPhase==='preflop') _uthDealFlop();
  else if(S.uthPhase==='flop') _uthDealTurn();
}
function uthNextStreet(){
  if(S.uthPhase==='flop') _uthDealTurn();
  else if(S.uthPhase==='turn') uthResolve();
}
function uthFold(){
  S.uthFolded=true;
  const ante=S.uthAnte/2;
  S.uthHistory.push({ante,blind:ante,play:0,playMult:0,result:'fold',delta:-(ante*2),anteDelta:-ante,blindDelta:-ante,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:false});
  S.uthHand++;S.uthPhase='reveal';
  updateUthCommunityCards();
  setTimeout(()=>{_noAnim=true;S.uthPhase='result';render();updateChipDisplay();},2300);
}
// Settles the UTH hand: three independent payouts (play, ante, blind) each have their own rules.
// Play: 1:1 if player wins. Ante: 1:1 only if dealer qualifies. Blind: paytable if Straight+.
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

// Surgically animates only the newly revealed community cards (uthPrevRevealComm → uthRevealComm).
// Also updates the action UI and progress dots after the animation finishes.
function updateUthCommunityCards() {
  const commHand = document.getElementById('uth-community-hand');
  const dealerHand = document.getElementById('uth-dealer-hand');
  if (!commHand || !dealerHand) { _noAnim=true; render(); return; }

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

  const startDelay = 300;
  const interval = 400;
  let revealedCount = 0;

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
        ?`<div class="sec">All In or Skip · Wins Pay 2×</div>
          ${aiosRow('allIn();pkDeal()', 'pkSkip()')}`
        :`<div class="sec">Place Your Bet</div>
          ${chipSel(S.chips,S.pkBet)}
          <button id="db" class="btn-gold" style="margin-top:12px" onclick="pkDeal()" ${S.pkBet===0?'disabled':''}>Deal →</button>
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
      <button class="btn-gold" style="margin-top:12px;opacity:.35" disabled>Drawing…</button>
      <div class="irow" style="margin-top:10px"><span class="ik">Bet</span><span class="iv">${fmt(S.pkBet)} chips</span></div>
    </div>`;
  }
  // result
  const h=S.pkHistory[S.pkHand-1], res=rankPoker(S.pkFinal), isLast=S.pkHand>=3;
  const isBusted=isChipBusted();
  const _pkNext=NEXT_SCREEN['poker'];
  const btnText=isBusted?'Game Over 💀':(isLast?(_pkNext==='roulette'?'Final Round: Roulette →':`Round 2: ${GAME_META[_pkNext].name} →`):'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?`advanceTo('${_pkNext}')`:'pkNext()');

  return `${hdr('5 Card Poker · Result')}
  <div class="panel" style="text-align:center">
    ${gameDots(S.pkHistory,S.pkHand,S.pkPhase)}
    <div class="divider"></div>
    <div class="result-hl" style="color:${col(h.delta)}">${h.delta>0?'You Win!':h.delta<0?'You Lose!':'Push'}</div>
    <div style="font-family:var(--btn-f);font-size:1.1rem;color:var(--gold);margin-bottom:2px">${res.n}</div>
    <div class="result-sub" style="color:${col(h.delta)}">${sign(h.delta)} chips</div>
    <div class="sec sec-sm">Your Hand</div>
    <div class="hand" style="margin-bottom:12px">
      ${S.pkFinal.map((c,i)=>{const isNew=!S.pkHeld.has(i);return cardHTML(c,'md',isNew?'box-shadow:0 0 0 2px var(--gold-hi),2px 3px 10px rgba(0,0,0,.5)':'',isNew?0.04+i*0.05:0);}).join('')}
    </div>
    ${runningTotalRow()}
    ${nextBtn(btnAction, btnText)}
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
          ${aiosRow('S.uthAnte=S.chips;uthDeal()', 'uthSkip()')}`
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

  const commRow=()=>`<div id="uth-community-container" style="text-align:center">
    <div class="sec">Community Cards</div>
    <div id="uth-community-hand" class="hand">${[0,1,2,3,4].map(i=>{
      if(i<S.uthRevealComm){
        const isNew=i>=S.uthPrevRevealComm;
        return cardHTML(S.uthComm[i],'sm','',isNew?0.05+(i-S.uthPrevRevealComm)*0.12:0,isNew);
      }
      return cardHTML('back','sm','',0,false);
    }).join('')}</div>
  </div>`;

  const playerRow=(anim=false)=>`<div style="text-align:center">
    <div class="sec">Your Hand</div>
    <div class="hand">${S.uthHole.map((c,i)=>cardHTML(c,'md','',anim?0.05+i*0.2:0,anim)).join('')}</div>
  </div>`;

  const dealerRow=(reveal=false)=>`<div id="uth-dealer-container" style="text-align:center">
    <div id="uth-dealer-sec" class="sec">${reveal?'Dealer':getMod('peek')&&S.peekUsed?'Dealer · <span style="color:var(--gold-hi);font-size:.7rem">👁 Peeked</span>':'Dealer (Face Down)'}</div>
    <div id="uth-dealer-hand" class="hand">${reveal
      ?S.uthDealer.map((c,i)=>cardHTML(c,'md','',i*0.9+0.1)).join('')
      :[0,1].map((_,i)=>i===0&&getMod('peek')&&S.peekUsed?cardHTML(S.uthDealer[0],'md','box-shadow:0 0 18px 5px rgba(196,147,58,.65);border-radius:8px',0,false):cardHTML('back','md')).join('')}</div>
  </div>`;

  const betChips=()=>{
    const rows=[['Ante',S.uthAnte/2],['Blind',S.uthAnte/2]];
    if(S.uthPlay>0)rows.push(['Play ('+S.uthPlayMult+'×)',S.uthPlay]);
    return`<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:10px 0">
      ${rows.map(([lbl,amt])=>`<div style="text-align:center;padding:8px 16px;background:rgba(0,0,0,.28);border-radius:8px;border:1px solid rgba(196,147,58,.18)">
        <div style="font-size:.82rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.12em">${lbl}</div>
        <div style="font-family:var(--btn-f);color:var(--gold);font-size:1.55rem;line-height:1.15">${fmt(amt)}</div>
      </div>`).join('')}
    </div>`;
  };

  if(ph==='preflop'){
    const r4Cost=(S.uthAnte/2)*4, r3Cost=(S.uthAnte/2)*3;
    const canR4=S.chips>=r4Cost, canR3=S.chips>=r3Cost;
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
          <button class="act-btn" onclick="uthRaise(4)" ${canR4?'':'disabled'}>Raise 4× (${fmt(r4Cost)})</button>
          <button class="act-btn" onclick="uthRaise(3)" ${canR3?'':'disabled'}>Raise 3× (${fmt(r3Cost)})</button>
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
          <div class="sec sec-sm">Dealer</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map((c,i)=>cardHTML(c,'md','',i*0.9+0.1)).join('')}</div>
        </div>
        ${commRow()}
        <div class="gold-divider"></div>
        <div>
          <div class="sec sec-sm">Your Hand</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
        </div>
      </div>
      ${betChips()}
      ${runningTotalRow()}
    </div>`;
  }

  // result
  const hist=S.uthHistory[S.uthHand-1];
  if(!hist)return'';
  const isLast=S.uthHand>=3;
  const isBusted=isChipBusted();
  const _uthNext=NEXT_SCREEN['uth'];
  const btnText=isBusted?'Game Over 💀':(isLast?(_uthNext==='roulette'?'Final Round: Roulette →':`Round 2: ${GAME_META[_uthNext].name} →`):'Next Hand →');
  const btnAction=isBusted?"advanceTo('results')":(isLast?`advanceTo('${_uthNext}')`:'uthNext()');

  if(hist.result==='fold'){
    const dealerBest=bestOf7([...S.uthDealer,...S.uthComm]);
    return `${hdr("Ultimate Texas Hold'em · Folded")}
    <div class="panel uth-result-panel" style="text-align:center">
      ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
      <div class="divider"></div>
      <div class="result-hl" style="color:var(--lose)">You Folded</div>
      <div class="result-sub" style="color:var(--lose)">${sign(hist.delta)} chips</div>
      <div class="uth-cards-col">
        <div>
          <div class="sec sec-sm">Dealer's Hand</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
          <div style="font-size:1.3rem;color:var(--gold-hi);margin-top:3px">${CAT_NAMES[dealerBest.cat]}</div>
        </div>
        ${commRow()}
        <div class="gold-divider"></div>
        <div>
          <div class="sec sec-sm">Your Hand</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map(c=>cardHTML(c,'md','',0,false)).join('')}</div>
        </div>
      </div>
      <div class="divider"></div>
      ${runningTotalRow()}
      ${nextBtn(btnAction, btnText)}
    </div>`;
  }

  const pb=hist.playerBest,db2=hist.dealerBest;
  const resLabel=hist.result==='win'?'You Win!':hist.result==='push'?'Push':'You Lose!';
  const hlCards=hist.result==='win'?new Set(pb?.cards):hist.result==='lose'?new Set(db2?.cards):new Set();
  const hlStyle=hist.result==='win'?'box-shadow:0 0 0 2px var(--gold),0 0 14px 4px rgba(196,147,58,0.55)':'box-shadow:0 0 0 2px var(--lose),0 0 14px 4px rgba(196,48,48,0.5)';
  const hl=c=>hlCards.has(c)?hlStyle:'';

  return `${hdr("Ultimate Texas Hold'em · Showdown")}
  <div class="panel uth-result-panel">
    ${gameDots(S.uthHistory,S.uthHand,S.uthPhase)}
    <div class="divider"></div>
    <div class="uth-result-top" style="text-align:center">
      <div class="result-hl" style="color:${col(hist.delta)}">${resLabel}</div>
      <div class="result-sub" style="color:${col(hist.delta)}">${sign(hist.delta)} chips</div>
    </div>
    <div class="uth-cards-col">
        <div style="text-align:center">
          <div class="sec sec-sm">Dealer${hist.dealerQualifies?' (Qualifies)':' (No Qualify)'}</div>
          <div class="hand" style="justify-content:center">${S.uthDealer.map(c=>cardHTML(c,'md',hl(c),0,false)).join('')}</div>
          <div style="font-size:1.3rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[db2.cat]}</div>
        </div>
        <div style="text-align:center">
          <div class="sec sec-sm">Community</div>
          <div class="hand" style="justify-content:center">${S.uthComm.map((c,i)=>cardHTML(c,'sm',hl(c),i*0.08+0.05)).join('')}</div>
        </div>
        <div class="gold-divider"></div>
        <div style="text-align:center">
          <div class="sec sec-sm">You</div>
          <div class="hand" style="justify-content:center">${S.uthHole.map((c,i)=>cardHTML(c,'md',hl(c),i*0.15+0.05)).join('')}</div>
          <div style="font-size:1.3rem;color:${hist.result==='win'?'var(--gold-hi)':'var(--shadow)'};margin-top:3px">${CAT_NAMES[pb.cat]}</div>
        </div>
    </div>
    <div class="divider"></div>
    <div class="uth-bets-grid">
      ${[['Ante',hist.anteDelta],['Blind',hist.blindDelta],...(hist.play>0?[['Play ('+hist.playMult+'×)',hist.playDelta]]:[])].map(([lbl,d])=>`<span class="pname">${lbl}</span><span class="ppay" style="color:${col(d)}">${sign(d)}</span>`).join('')}
    </div>
    ${runningTotalRow()}
    ${nextBtn(btnAction, btnText)}
  </div>`;
}
