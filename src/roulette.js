
// ─── ROULETTE TIMING ─────────────────────────────────────────────────────
const R_SPIN_MS         = 4600; // wheel animation duration (matches audio track length)
const R_SETTLE_MS       = 1000; // pause after ball stops before resolving bets (with audio)
const R_SETTLE_MUTED_MS = 900;  // same settle pause when audio is muted

// ─── ROULETTE CONSTANTS ──────────────────────────────────────────────────

// Standard European roulette red numbers (18 of them; everything else non-zero is black).
const REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const rCls=n=>n===0?'rn-grn':REDS.has(n)?'rn-red':'rn-blk'; // CSS class for a pocket
const rName=n=>n===0?'Green':REDS.has(n)?'Red':'Black';       // display name for a pocket

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

// Lookup table for getRBetNums (indices 37-48).
const R_BET_NUMS_MAP = {
  37: [3,6,9,12,15,18,21,24,27,30,33,36],
  38: [2,5,8,11,14,17,20,23,26,29,32,35],
  39: [1,4,7,10,13,16,19,22,25,28,31,34],
  40: [1,2,3,4,5,6,7,8,9,10,11,12],
  41: [13,14,15,16,17,18,19,20,21,22,23,24],
  42: [25,26,27,28,29,30,31,32,33,34,35,36],
  43: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
  44: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36],
  45: [...REDS],
  46: Array.from({length:36},(_,n)=>n+1).filter(n=>!REDS.has(n)),
  47: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35],
  48: [19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],
};

// Returns the display label for a bet slot (e.g. "#17", "Red", "1-12").
const _rBetLabel = pick => { const d=R_BETS[pick]; return d?(d.type==='num'?'#'+d.lbl:d.lbl):'?'; };

// Returns the winning numbers (1-36) for a given R_BETS index.
// Index 0 (green zero) returns [] because outside bets all lose on zero.
function getRBetNums(i){
  if(i===0)return[];
  if(i<=36)return[i];
  return R_BET_NUMS_MAP[i]||[];
}

// Returns true if R_BETS[idx] wins for the given spin result.
// All non-number bets lose on zero (standard European rules).
function evalBet(idx,result){
  const b=R_BETS[idx];
  if(b.type==='num') return result===b.val;
  if(result===0) return false;
  if(b.type==='col2') return b.val==='red'?REDS.has(result):!REDS.has(result);
  if(b.type==='oe') return b.val==='even'?result%2===0:result%2===1;
  if(b.type==='hl') return b.val==='low'?result<=18:result>=19;
  if(b.type==='doz') return result>=b.val*12+1&&result<=b.val*12+12;
  // Columns: val 0/1/2 = bottom/middle/top row; (val+1)%3 maps to the n%3 remainder for each row (1/2/0).
  if(b.type==='col') return result%3===(b.val+1)%3;
  return false;
}

// Formats a chip amount as a short label for the board overlay (e.g. 1200 → "1K").
const chipLbl = amt => amt >= 1000 ? Math.floor(amt / 1000) + 'K' : String(amt);

// ─── ROULETTE BOARD ──────────────────────────────────────────────────────

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

// ─── ROULETTE WHEEL CANVAS ────────────────────────────────────────────────

// Holds the preloaded Audio object for the current spin; null when muted.
let _rouletteAudio = null;

// Standard European single-zero wheel pocket sequence (clockwise from 0).
const WO=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

function drawWheel(cnv,wAngle,bAngle,bR){
  const ctx=cnv.getContext('2d');
  const W=cnv.width,H=cnv.height,cx=W/2,cy=H/2;
  const R=Math.min(W,H)/2-6;
  const N=37,seg=2*Math.PI/N;
  ctx.clearRect(0,0,W,H);

  const rimG=ctx.createRadialGradient(cx,cy,R-4,cx,cy,R+8);
  rimG.addColorStop(0,'#7a5a18');rimG.addColorStop(0.45,'#c4933a');rimG.addColorStop(1,'#3d2c0a');
  ctx.beginPath();ctx.arc(cx,cy,R+7,0,2*Math.PI);ctx.fillStyle=rimG;ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy,R+1,0,2*Math.PI);ctx.strokeStyle='rgba(223,185,94,.45)';ctx.lineWidth=1.5;ctx.stroke();

  for(let i=0;i<N;i++){
    const n=WO[i],a0=wAngle+i*seg,a1=a0+seg;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a0,a1);ctx.closePath();
    ctx.fillStyle=n===0?'#1d6e4d':REDS.has(n)?'#b91c1c':'#1a1814';
    ctx.fill();
    ctx.strokeStyle='rgba(196,147,58,.6)';ctx.lineWidth=0.8;ctx.stroke();
    const mA=wAngle+(i+0.5)*seg,nr=R*0.83;
    ctx.save();
    ctx.translate(cx+nr*Math.cos(mA),cy+nr*Math.sin(mA));
    ctx.rotate(mA+Math.PI/2);
    ctx.fillStyle='#fbf5dc';ctx.font=`700 ${Math.max(7,Math.floor(R*0.120))}px "VT323", "Courier New", monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(n),0,0);
    ctx.restore();
  }

  for(let i=0;i<8;i++){
    const a=wAngle+i*Math.PI/4;
    ctx.beginPath();
    ctx.moveTo(cx+R*0.22*Math.cos(a),cy+R*0.22*Math.sin(a));
    ctx.lineTo(cx+R*0.9*Math.cos(a),cy+R*0.9*Math.sin(a));
    ctx.strokeStyle='rgba(196,147,58,.32)';ctx.lineWidth=2;ctx.stroke();
  }

  ctx.beginPath();ctx.arc(cx,cy,R*0.22,0,2*Math.PI);ctx.fillStyle='#1a1814';ctx.fill();
  ctx.strokeStyle='#c4933a';ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,R*0.1,0,2*Math.PI);ctx.fillStyle='#0e0d0b';ctx.fill();
  ctx.strokeStyle='#dfb95e';ctx.lineWidth=2;ctx.stroke();

  const bx=cx+bR*Math.cos(bAngle),by=cy+bR*Math.sin(bAngle);
  ctx.beginPath();ctx.arc(bx+1.5,by+2.5,8,0,2*Math.PI);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fill();
  const bg=ctx.createRadialGradient(bx-3,by-3,1,bx,by,8);
  bg.addColorStop(0,'#fefaf0');bg.addColorStop(0.6,'#dfd5b0');bg.addColorStop(1,'#b8a878');
  ctx.beginPath();ctx.arc(bx,by,8,0,2*Math.PI);ctx.fillStyle=bg;ctx.fill();
  ctx.strokeStyle='#7a5a18';ctx.lineWidth=1;ctx.stroke();
}

// Plays the roulette ball audio and animates the wheel for exactly the same duration.
function startWheelAnim(){
  const cnv=document.getElementById('rwheel');
  if(!cnv)return;
  const size=Math.min(320,Math.floor((cnv.parentElement?.clientWidth||360)-24));
  cnv.width=size;cnv.height=size;

  const N=37,seg=2*Math.PI/N;
  const tidx=WO.indexOf(S.rSpin);

  // rawFinal aligns the target pocket to the top pointer (-π/2); wFinal adds full rotations.
  const rawFinal=-Math.PI/2-(tidx+0.5)*seg;
  const numSpins=7;
  // The middle term adds the minimum whole rotations to make wFinal positive, so the ease always animates forward.
  const wFinal=rawFinal+Math.ceil(-rawFinal/(2*Math.PI))*2*Math.PI+numSpins*2*Math.PI;

  const bFinalA=-Math.PI/2;
  const bRevs=11;
  const bStartA=bFinalA+bRevs*2*Math.PI;
  const R=size/2-6;
  const bRi=R*0.91,bRf=R*0.68;

  function ease(t){return 1-Math.pow(1-t,4);} // quartic ease-out

  function runAnim(DUR, onDone){
    const t0=performance.now();
    function frame(now){
      const t=Math.min((now-t0)/DUR,1),e=ease(t);
      drawWheel(cnv,wFinal*e,bStartA-(bStartA-bFinalA)*e,bRi+(bRf-bRi)*e);
      if(t<1)requestAnimationFrame(frame);
      else onDone();
    }
    requestAnimationFrame(frame);
  }

  const audio=_rouletteAudio;
  if(audio){
    const go=()=>{
      const DUR=Math.round(audio.duration*1000);
      audio.play().catch(()=>{});
      audio.onended=()=>setTimeout(rFinish,R_SETTLE_MS);
      runAnim(DUR, ()=>{}); // animation ends with the audio; rFinish handles the transition
    };
    if(audio.readyState>=1) go(); // metadata (duration) already available
    else{
      audio.addEventListener('loadedmetadata',go,{once:true});
      audio.addEventListener('error',()=>runAnim(R_SPIN_MS,()=>setTimeout(rFinish,R_SETTLE_MUTED_MS)),{once:true});
    }
  } else {
    runAnim(R_SPIN_MS,()=>setTimeout(rFinish,R_SETTLE_MUTED_MS));
  }
}

// ─── ROULETTE SCREENS ────────────────────────────────────────────────────

function screenRoulette(){
  if(S.rPhase==='bet') return screenRouletteBet();
  if(S.rPhase==='spinning') return screenRouletteSpinning();
  if(S.rPhase==='respin') return screenRouletteRespin();
  return screenRouletteResult();
}

function screenRouletteRespin(){
  const n=S.rSpin;
  const betPreviews=_evalBets(S.rBets,n);
  const totalDelta=betPreviews.reduce((s,b)=>s+b.delta,0);
  const wm=winMult();
  const displayDelta=wm>1&&totalDelta>0?totalDelta*wm:totalDelta;
  const betRows=betPreviews.map(b=>`<div class="irow" style="margin-bottom:4px">
    <span class="ik">${_rBetLabel(b.pick)} · Pays ${b.pay}:1</span>
    <span style="font-family:var(--btn-f);font-size:1.2rem;color:${col(b.delta)}">${sign(b.delta)}</span>
  </div>`).join('');
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
    <div style="display:flex;gap:10px">
      <button class="act-btn" style="flex:1" onclick="rKeepSpin()">Keep Result</button>
      <button class="btn-gold" style="flex:2" onclick="rDoRespin()">Re-spin 🎡</button>
    </div>
  </div>`;
}

function screenRouletteSpinning(){
  const bets=S.rBets;
  const total=bets.reduce((a,b)=>a+b.bet,0);
  const betRows=bets.map(b=>{
    const d=R_BETS[b.pick];
    return`<div class="irow" style="margin-bottom:2px">
      <span class="ik">${_rBetLabel(b.pick)} &nbsp;·&nbsp; ${d.pay}:1</span>
      <span class="iv">${fmt(b.bet)} <span style="color:var(--shadow);font-size:0.85em">→</span> <span style="color:var(--gold-hi)">${fmt(b.bet*d.pay)}</span></span>
    </div>`;
  }).join('');
  const singleLabel=bets.length===1
    ?`<div style="text-align:center;font-size:1.8rem;color:var(--cream);margin-top:4px">Bet on <b style="color:var(--ink)">${R_BETS[bets[0].pick].type==='num'?'Number '+R_BETS[bets[0].pick].lbl:R_BETS[bets[0].pick].lbl}</b> &nbsp;·&nbsp; <b style="color:var(--gold)">${fmt(total)} chips</b></div>`
    :`<div class="divider" style="margin:8px 0"></div>
    <div class="sec" style="margin-bottom:4px">${bets.length} Bets &nbsp;·&nbsp; ${fmt(total)} chips wagered</div>
    ${betRows}`;
  return `${hdr('Roulette · Spinning!')}
  <div class="panel">
    ${gameDots([], 0, 'play', 2)}
    <div class="divider"></div>
    <div class="wheel-outer">
      <div class="wheel-pointer"></div>
      <canvas id="rwheel" width="300" height="300"></canvas>
    </div>
    ${singleLabel}
  </div>`;
}

function screenRouletteBet(){
  const maxBets=getMod('r_max_bets')||5;
  const aios=getMod('all_in_or_skip');
  const fg=getMod('r_force_group');
  if(fg&&R_GROUP_INFO[fg]&&S.rPick===R_GROUP_INFO[fg].bannedIdx){S.rPick=null;S.rBet=0;}
  const pb=S.rPick!==null?R_BETS[S.rPick]:null;
  const boardPad=getMod('r_color_double')||getMod('r_payout_mult')?'padding-bottom:28px':'';
  const board=`<div class="r-board-wrap" ${boardPad?`style="${boardPad}"`:''}>${rBoard()}</div>`;
  const betInfo=`<div id="r-bet-info"><div class="irow">${pb?`<span class="ik">Bet on: <b style="color:var(--ink)">${pb.type==='num'?'Number '+pb.lbl:pb.lbl}</b></span><span class="iv">${pb.pay}:1 payout</span>`:`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`}</div></div>`;

  if(aios&&S.rBets.length===0){
    return `${hdr('Roulette · 1 Spin')}
    <div class="panel">
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

  const pickAlreadyBet=S.rPick!==null&&S.rBets.some(b=>b.pick===S.rPick);
  const canAdd=(S.rBets.length<maxBets||pickAlreadyBet)&&pb&&S.rBet>0;
  const canSpin=S.rBets.length>0;
  const hdrTitle=maxBets===1?'Roulette · 1 Spin':`Roulette · Up to ${maxBets} Bets`;
  const secLabel=maxBets===1?'<span class="sec-game-prefix">Roulette · </span>Place Your Bet':'<span class="sec-game-prefix">Roulette · </span>Place Your Bets';
  return `${hdr(hdrTitle)}
  <div class="panel">
    ${board}
    <button id="db" class="btn-gold" style="margin:10px 0" onclick="rSpin()" ${!canSpin?'disabled':''}>Final Spin 🎡</button>
    <div class="divider"></div>
    <div class="sec" style="text-align:center">${secLabel}</div>
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
      <div style="font-size:1.75rem;font-weight:700;color:var(--shadow);margin-bottom:12px">Spin Skipped</div>
      <div class="game-manifest" style="text-align:left;margin-bottom:6px">
        <div class="irow"><span class="ik">Final chip total</span><span class="iv">${fmt(S.chips)}</span></div>
      </div>
      <button class="btn-gold" onclick="advanceTo('results')">See Final Results →</button>
    </div>`;
  }
  const bets=res.bets||[{pick:S.rPick,won:res.won,delta:res.delta,pay:R_BETS[S.rPick]?.pay}];
  const betRows=bets.map((b,i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
      <span style="font-size:1rem">${_rBetLabel(b.pick)} · Pays ${b.pay}:1</span>
      <span style="font-family:var(--btn-f);font-size:1.35rem;color:${col(b.delta)}">${sign(b.delta)}</span>
    </div>`).join('');
  return `${hdr('Roulette · Result')}
  <div class="panel" style="text-align:center">
    <div style="display:flex;justify-content:center;margin-bottom:4px">
      <div class="r-res-num ${rCls(n)}">${n}</div>
    </div>
    <div style="font-size:.88rem;color:var(--shadow);margin-bottom:6px">${rName(n)}</div>
    <div class="result-hl" style="color:${col(res.delta)}">${res.delta>0?'You Win!':res.delta===0?'Push':'You Lose!'}</div>
    <div class="result-sub" style="color:${col(res.delta)}">${sign(res.delta)} chips</div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${betRows}
      <div class="gm-sep" style="opacity:0.35"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span class="ik">Final chip total</span><span class="iv">${fmt(S.chips)}</span>
      </div>
    </div>
    <button class="btn-gold" onclick="advanceTo('results')">See Final Results →</button>
  </div>`;
}

// ─── ROULETTE ACTIONS ────────────────────────────────────────────────────

/** Skip the roulette spin (all_in_or_skip modifier). Records delta 0 and goes to result. */
function rSkip(){
  S.rResult={delta:0,skipped:true};S.rPhase='result';render();
}

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

  document.querySelectorAll('[data-idx]').forEach(b => b.classList.remove('r-sel'));
  const btn = document.querySelector(`[data-idx="${i}"]`);
  if(btn) btn.classList.add('r-sel');

  document.querySelectorAll('.r-chip-sel').forEach(c => c.remove());

  const pb = R_BETS[i];
  const irow = info.querySelector('.irow');
  if(irow){
    irow.style.visibility = '';
    irow.querySelector('.ik').innerHTML = `Bet on: <b style="color:var(--ink)">${pb.type==='num'?'Number '+pb.lbl:pb.lbl}</b>`;
    irow.querySelector('.iv').textContent = pb.pay+':1 payout';
  }

  patchBetUI();
  saveState();
}
function rPlacedInner(bets,maxBets){
  if(!bets.length)return'';
  return`<div class="divider" style="margin:10px 0"></div>
    <div class="sec">Placed Bets (${bets.length}/${maxBets})</div>
    ${bets.map((b,i)=>{const d=R_BETS[b.pick];return`<div class="irow" style="margin-bottom:4px">
      <span class="ik"><span style="font-weight:700;color:var(--ink)">${d.type==='num'?'#'+d.lbl:d.lbl}</span> · Pays ${d.pay}:1</span>
      <span style="display:flex;align-items:center;gap:8px"><span class="iv">${fmt(b.bet)}</span>
        <button onclick="rRemoveBet(${i})" style="background:none;border:none;color:var(--shadow);cursor:pointer;font-size:1rem;padding:2px 6px">×</button>
      </span></div>`;}).join('')}`;
}
/** Adds current rPick+rBet to the placed bets list (multi-bet mode). */
function rAddBet(){
  const maxBets=getMod('r_max_bets')||5;
  const isNew=!S.rBets.find(b=>b.pick===S.rPick);
  if(S.rPick===null||!S.rBet||(isNew&&S.rBets.length>=maxBets))return;

  const prevPick=S.rPick, betAmt=S.rBet;
  S.chips-=betAmt;
  const placedBet=S.rBets.find(b=>b.pick===prevPick);
  if(placedBet){placedBet.bet+=betAmt;}else{S.rBets.push({pick:prevPick,bet:betAmt});}
  sndChip(betAmt);
  S.rBet=0; S.rPick=null;
  saveState();

  const boardBtn=document.querySelector(`[data-idx="${prevPick}"]`);
  if(!boardBtn){render();return;}

  boardBtn.classList.remove('r-sel');
  boardBtn.querySelectorAll('.r-chip-sel').forEach(c=>c.remove());
  const total=S.rBets.filter(b=>b.pick===prevPick).reduce((s,b)=>s+b.bet,0);
  const existingChip=boardBtn.querySelector('.r-chip-placed');
  if(existingChip)existingChip.textContent=chipLbl(total);
  else boardBtn.insertAdjacentHTML('beforeend',`<span class="r-chip r-chip-placed">${chipLbl(total)}</span>`);

  const info=document.getElementById('r-bet-info');
  const irow=info?.querySelector('.irow');
  if(irow)irow.innerHTML=`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`;

  const bv=document.getElementById('bv');
  if(bv)bv.textContent=fmt(0);
  document.querySelectorAll('.chbtn').forEach(b=>{b.disabled=(+b.dataset.v)>S.chips;});

  const placed=document.getElementById('r-placed');
  if(placed)placed.innerHTML=rPlacedInner(S.rBets,maxBets);

  const pba=document.getElementById('pb-add');
  if(pba){pba.textContent=`Place Bet (${S.rBets.length}/${maxBets})`;pba.disabled=true;}

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
// Determines the winning number (using Math.random, not the seeded PRNG) then kicks off the animation.
function rSpin(){
  if(S.rBets.length===0)return;
  const zb=getMod('r_zero_boost');
  const fg=getMod('r_force_group');
  if(DEAL.rSpinOverride!=null){S.rSpin=DEAL.rSpinOverride;}
  else if(fg&&R_GROUP_INFO[fg]){const ns=[...R_GROUP_INFO[fg].nums];S.rSpin=ns[Math.floor(Math.random()*ns.length)];}
  // r_zero_boost: expand pool by zb slots, all mapped to 0, so zero hits zb/(36+zb) of the time.
  else if(zb){const r=Math.floor(Math.random()*(36+zb));S.rSpin=r<zb?0:r-zb+1;}
  else{S.rSpin=Math.floor(Math.random()*37);}
  S.rPhase='spinning';
  render();updateChipDisplay();
  // Preload the audio now so its duration is available by the time startWheelAnim runs.
  _rouletteAudio = getPref('mute') ? null : new Audio('assets/sounds/roulette ball.mp3');
  if (_rouletteAudio) { _rouletteAudio.volume = 0.5; _rouletteAudio.load(); }
  setTimeout(startWheelAnim,60);
}
// Evaluates all placed bets and applies any active payout modifiers, returning enriched bet objects.
function _evalBets(bets, spin) {
  const multMod = getMod('r_payout_mult');
  const numPayMod = getMod('r_number_pay');
  const colorDoubleMod = getMod('r_color_double');
  return bets.map(b => {
    const bDef = R_BETS[b.pick];
    const won = evalBet(b.pick, spin);
    let pay = bDef.pay;
    if (won) {
      if (multMod) pay *= multMod;
      else if (numPayMod && bDef.type === 'num') pay = numPayMod;
      else if (colorDoubleMod && bDef.type === 'col2') pay *= 2;
    }
    const delta = won ? b.bet * pay : -b.bet;
    return {...b, won, delta, pay};
  });
}
// Settles all bets: returns stake + profit for winners, then applies win multiplier on top.
function _resolveRoulette(){
  const betResults = _evalBets(S.rBets, S.rSpin);
  let totalDelta = betResults.reduce((s,b) => s + b.delta, 0);
  betResults.forEach(b => { if (b.won) S.chips += b.bet * (1 + b.pay); }); // return stake + profit
  const wm=winMult();
  if(wm>1&&totalDelta>0){S.chips+=totalDelta;totalDelta*=wm;} // apply win multiplier bonus on top
  S.rResult={delta:totalDelta,bets:betResults};
  S.rPhase='result';render();updateChipDisplay();
  if(totalDelta>0)setTimeout(sndBigWin,400);
}
// Called when the wheel animation finishes — goes to respin phase if unused, otherwise resolves.
function rFinish(){
  if(getMod('r_respin')&&!S.rReSpun){S.rPhase='respin';render();return;}
  _resolveRoulette();
}
function rKeepSpin(){_resolveRoulette();} // player chose to keep the respin result
function rDoRespin(){S.rReSpun=true;rSpin();}
