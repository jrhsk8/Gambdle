// ─── 5 CARD POKER (grep the function name; line numbers drift) ─────────────
// The partially-built five-card draw game (keyed 'poker', state on S.pk*). Distinct from UTH; it
// now lives in its own file and registers its own Game-registry slots, exactly like every other
// game. Shares only the seeded DEAL.pokerDecks and the rankPoker evaluator (exported from uth.js,
// where UTH's bestOf7 also uses it). Not yet on the leaderboard board and not replayed server-side
// (the Engine stubs 'pk' events to a 0 net); see .claude/ARCHITECTURE.md.
//   pkSkip · pkDeal · toggleHold · pkDraw · screenPoker · GAMES.poker.{reset,screen,resume,nextHand}

/** Skip the current poker hand (all_in_or_skip modifier). Records delta 0 and advances. */
function pkSkip(){ txLog({g:'pk',a:'skip',h:S.pkHand}); _skipHand('poker',{bet:0,result:'skip',pts:0,delta:0}); }

/** Initial deal for 5-Card Draw Poker. */
function pkDeal(){
  if(!S.pkBet||S.pkPhase!=='bet')return;
  S.pkPhase='dealing'; // lock immediately
  debit(S.pkBet,'pk-deal');
  txLog({g:'pk',a:'deal',h:S.pkHand,bet:S.pkBet});
  S.pkCards=DEAL.pokerDecks[S.pkHand].slice(0,5);
  S.pkHeld=new Set();
  patchEl('db', db=>db.disabled=true);
  sndShuffle(()=>{
    S.pkPhase='hold';
    render(); updateChipDisplay();
    sndCard(40);sndCard(100);sndCard(160);sndCard(220);sndCard(280);
  });
}
function toggleHold(i){
  S.pkHeld.has(i)?S.pkHeld.delete(i):S.pkHeld.add(i);
  const h=S.pkHeld.has(i);
  // Surgically toggle this card's lift/tag in place; a missing wrap (post-refresh) falls back to a
  // no-anim render via the shared patch seam.
  patchOrRender('pk-hw-'+i, hw=>{
    const card=hw.querySelector('.card');
    const tag=hw.querySelector('.hold-tag');
    if(card){card.style.transform=h?'translateY(-10px)':'translateY(0)';card.style.boxShadow=h?'0 8px 20px rgba(196,147,58,.5),0 0 0 2px var(--gold)':'2px 3px 10px rgba(0,0,0,.5),0 0 0 2px rgba(196,48,48,.65)';}
    if(tag){tag.style.color=h?'':'var(--red)';tag.textContent=h?'HOLD':'REPLACE';}
    const status=document.querySelector('.pk-hold-status');
    if(status)status.textContent=`Tap cards to hold · ${S.pkHeld.size} held · ${5-S.pkHeld.size} replaced`;
    saveState();
  }, {noAnim:true});
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
      setTimeout(()=>{S.pkHand++;S.pkPhase='result';navRender();},900); // crossfade draw → result panel
      return;
    }
    S.pkRevealStep++;
    _noAnim=true;render();
    sndCard(50);
    setTimeout(revealNext,650);
  }
  setTimeout(revealNext,300);
}
GAMES.poker.reset = () => { S.pkBet=0; S.pkPhase='bet'; }; GAMES.poker.screen = screenPoker; GAMES.poker.nextHand = () => _nextHand(GAMES.poker.reset); // register this game's fns into the Game registry (defined in this file; core.js loads first)
// Refresh landed mid-draw: bump the hand counter and show the result panel.
GAMES.poker.resume = function(){
  if(S.pkPhase!=='draw') return;
  setTimeout(() => { S.pkHand++; S.pkPhase = 'result'; navRender(); }, 300);
};

// ─── SCREEN RENDERING ──────────────────────────────────────────────────────
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
  const {text:btnText, action:btnAction} = resultAdvanceBtn(S.pkHand>=3, NEXT_SCREEN['poker']);

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
