// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   ROULETTE TIMING: animation/settle durations
//   ROULETTE CONSTANTS: pockets, colors, bet groups, payouts, R_GROUP_INFO
//   ROULETTE BOARD: betting board markup · rAddBet · bet limits (r_max_bets)
//   ROULETTE WHEEL CANVAS: startWheelAnim drawing
//   ROULETTE SCREENS: screenRoulette (bet + spin phases)
//   ROULETTE ACTIONS: rSpin (server fetch + local fallback) ·
//     spinFromRandom (PURE word→pocket mapping, server-replayed) ·
//     modifier draws (rHotNumber) · _evalBets payouts ·
//     rFinish / rDoRespin
// ───────────────────────────────────────────────────────────────────────────

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
  'even':  {nums:new Set([2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36]),bannedIdx:44},
  'odd':   {nums:new Set([1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35]),bannedIdx:47},
  'red':   {nums:new Set([...REDS]),bannedIdx:45},
  'black': {nums:new Set(Array.from({length:36},(_,n)=>n+1).filter(n=>!REDS.has(n))),bannedIdx:46},
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

// The three column bets all read "2:1" on the board (and stay that way); name them by the
// board row they sit on so the spin/result screens say which one — 37=top, 38=middle, 39=bottom.
const _R_COL_ROW = { 37: 'Top Row', 38: 'Middle Row', 39: 'Bottom Row' };

// Self-describing label for a bet slot. Columns become their row name; numbers, dozens and
// the even-money bets are already clear. `long` only affects numbers ("#17" vs "Number 17").
function rBetLabel(pick, long){
  const d=R_BETS[pick];
  if(!d) return '?';
  if(d.type==='num') return long?'Number '+d.lbl:'#'+d.lbl;
  if(d.type==='col') return _R_COL_ROW[pick]||d.lbl;
  return d.lbl;
}

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
// Honors the chip_div display scale so placed-bet chips read in the same units as the badge.
const chipLbl = amt => { const d=chipDispDiv(); const v=d===1?amt:Math.round(amt/d*100)/100; return v >= 1000 ? Math.floor(v / 1000) + 'K' : String(v); };

// ─── ROULETTE BOARD ──────────────────────────────────────────────────────

// Under a force-group mod the winner is guaranteed to fall in a number group. A bet is BLOCKED if it can
// never win (no overlap with the group) or always wins (it covers every number in the group — the exact
// group tile, or any superset like 19-36 over 25-36). Only genuinely-uncertain bets stay open. No mod → open.
function rBetBlocked(i){
  const fg=getMod('r_force_group'),grp=fg?R_GROUP_INFO[fg]:null;
  if(!grp||i==null)return false;
  const covered=getRBetNums(i);
  if(!covered.some(n=>grp.nums.has(n)))return true;        // no overlap — can never win
  const cs=new Set(covered);
  for(const n of grp.nums){if(!cs.has(n))return false;}    // missing a group number — uncertain, keep open
  return true;                                             // covers the whole group — guaranteed win
}
function rBoard(){
  const sel=i=>S.rPick===i&&!rBetBlocked(i)?'r-sel':'';
  const placedTotals=S.rBets.reduce((m,b)=>{m.set(b.pick,(m.get(b.pick)||0)+b.bet);return m;},new Map());
  const chip=i=>{
    if(placedTotals.has(i))return`<span class="r-chip r-chip-placed">${chipLbl(placedTotals.get(i))}</span>`;
    return'';
  };
  const hot=rHotNumber();
  const rMod=getMod('r_payout_mult')?'all':getMod('r_number_pay')?'nums':hot?'hotnum':getMod('r_color_double')?'color':null;
  const boost=i=>{
    if(!rMod)return'';
    if(rMod==='all')return'r-boost';
    if(rMod==='nums'&&i<=36)return'r-boost';
    if(rMod==='hotnum'&&i===hot.num)return'r-boost-fire';
    if(rMod==='color'&&(i===45||i===46))return'r-boost';
    return'';
  };
  const boostLabel=i=>{
    if(!rMod)return'';
    if(rMod==='hotnum'&&i===hot.num&&hot.num===0)return icon('flame'); // tall zero cell: room for a below-tile label
    if(rMod==='color'&&(i===45||i===46))return'2:1';
    return'';
  };
  const lbl=i=>{
    // A boosted mid-grid pocket (Sweet Sixteen's 16 — any non-zero hot number) gets an in-tile corner
    // flame; the below-tile r-pay-lbl is reserved for the zero cell and the color tiles, which have
    // clear space beneath them (a below-tile flame on 16 would collide with the dozens row).
    if(rMod==='hotnum'&&i===hot.num&&hot.num!==0) return `<span class="r-fire-badge">${icon('flame')}</span>`;
    const t=boostLabel(i);
    return t?`<span class="r-pay-lbl">${t}</span>`:'';
  };
  const numBtns=Array.from({length:37},(_,n)=>{
    const gc=n===0?'1':String(Math.floor((n-1)/3)+2);
    const gr=n===0?'1/4':String(n%3===0?1:n%3===2?2:3);
    const blk=rBetBlocked(n);
    return`<button class="rn ${rCls(n)} ${sel(n)} ${boost(n)} ${blk?'r-blocked':''}" data-idx="${n}" style="grid-column:${gc};grid-row:${gr}" onclick="pickBet(${n})" ${blk?'disabled':''}>${n}${lbl(n)}${chip(n)}</button>`;
  }).join('');
  const col2to1=[0,1,2].map(r=>{
    const idx=37+r;const blk=rBetBlocked(idx);
    return`<button class="r2to1 ${sel(idx)} ${boost(idx)} ${blk?'r-blocked':''}" data-idx="${idx}" style="grid-column:14;grid-row:${r+1}" onclick="pickBet(${idx})" ${blk?'disabled':''}>2:1${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  const dozBtns=[[40,'2/6'],[41,'6/10'],[42,'10/14']].map(([idx,gc])=>{
    const blk=rBetBlocked(idx);
    return`<button class="rout ${sel(idx)} ${boost(idx)} ${blk?'r-blocked':''}" data-idx="${idx}" style="grid-column:${gc}" onclick="pickBet(${idx})" ${blk?'disabled':''}>${R_BETS[idx].lbl}${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  const outData=[[43,'2/4',''],[44,'4/6',''],[45,'6/8','rout-r'],[46,'8/10','rout-b'],[47,'10/12',''],[48,'12/14','']];
  const outBtns=outData.map(([idx,gc,ex])=>{
    const blk=rBetBlocked(idx);
    return`<button class="rout ${ex} ${sel(idx)} ${boost(idx)} ${blk?'r-blocked':''}" data-idx="${idx}" style="grid-column:${gc}" onclick="pickBet(${idx})" ${blk?'disabled':''}>${R_BETS[idx].lbl}${lbl(idx)}${chip(idx)}</button>`;
  }).join('');
  return`<div class="rboard">${numBtns}${col2to1}</div>
    <div class="rboard-sub">${dozBtns}</div>
    <div class="rboard-sub">${outBtns}</div>`;
}

// ─── ROULETTE WHEEL CANVAS ────────────────────────────────────────────────

// Holds the preloaded Audio object for the current spin; null when muted.
let _rouletteAudio = null;
// (Re)arm the ball-spin audio: build the Audio (or null when muted), set volume, preload.
function _initRouletteAudio(){
  _rouletteAudio = getPref('mute') ? null : new Audio('assets/sounds/roulette ball.mp3');
  if (_rouletteAudio) { _rouletteAudio.volume = 0.5; _rouletteAudio.load(); }
}

// Standard European single-zero wheel pocket sequence (clockwise from 0).
const WO=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

// `balls` is an array of {a, r, rad, tint} — one entry per ball on the wheel (Double Ball has two).
function drawWheel(cnv,wAngle,balls){
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

  for(const ball of balls){
    const bAngle=ball.a, bR=ball.r, rad=ball.rad||8;
    const bx=cx+bR*Math.cos(bAngle),by=cy+bR*Math.sin(bAngle);
    ctx.beginPath();ctx.arc(bx+1.5,by+2.5,rad,0,2*Math.PI);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fill();
    const bg=ctx.createRadialGradient(bx-3,by-3,1,bx,by,rad);
    const t=ball.tint||['#fefaf0','#dfd5b0','#b8a878'];
    bg.addColorStop(0,t[0]);bg.addColorStop(0.6,t[1]);bg.addColorStop(1,t[2]);
    ctx.beginPath();ctx.arc(bx,by,rad,0,2*Math.PI);ctx.fillStyle=bg;ctx.fill();
    ctx.strokeStyle='#7a5a18';ctx.lineWidth=1;ctx.stroke();
  }
}

// Plays the roulette ball audio and animates the wheel for exactly the same duration.
function startWheelAnim(){
  const cnv=document.getElementById(DOM.rouletteWheel);
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

  const R=size/2-6;
  const bRi=R*0.91,bRf=R*0.68;

  // Ball specs. Ball 1 lands at the top pointer (-π/2), where the wheel has been rotated to seat
  // S.rSpin. For Double Ball, ball 2 lands on S.rSpin2's pocket: its final angle is offset from the
  // top by the pocket distance between the two numbers on the wheel, so both balls sit in real
  // pockets. Both balls are drawn identically (same size, radius and tint as the single-ball wheel);
  // only their revolution counts differ so they trace separate paths before settling.
  const ballSpecs=[{finalA:-Math.PI/2, revs:11, rf:bRf, rad:8, tint:null}];
  if(S.rSpin2!=null){
    const tidx2=WO.indexOf(S.rSpin2);
    ballSpecs.push({finalA:-Math.PI/2+(tidx2-tidx)*seg, revs:9, rf:bRf, rad:8, tint:null});
  }

  function ease(t){return 1-Math.pow(1-t,4);} // quartic ease-out

  function runAnim(DUR, onDone){
    const t0=performance.now();
    function frame(now){
      const t=Math.min((now-t0)/DUR,1),e=ease(t);
      const balls=ballSpecs.map(s=>{
        const startA=s.finalA+s.revs*2*Math.PI;
        return {a:startA-(startA-s.finalA)*e, r:bRi+(s.rf-bRi)*e, rad:s.rad, tint:s.tint};
      });
      drawWheel(cnv,wFinal*e,balls);
      if(t<1)requestAnimationFrame(frame);
      else onDone();
    }
    requestAnimationFrame(frame);
  }

  const audio=_rouletteAudio;
  // One-shot finish: whichever signal lands first — audio 'ended', the animation completing, an
  // audio 'error', or the absolute ceiling below — resolves the spin exactly once. Without this the
  // wheel hangs forever (player stranded on "Spinning!") whenever the audio element never emits
  // 'ended': tab backgrounded mid-spin, a throttled/suspended element, iOS's per-session
  // HTMLAudioElement limit, or play() blocked without rejecting — the same stall sndShuffle guards
  // against with its 2000ms ceiling. The guard also collapses any double-fire (e.g. a late 'error'
  // after 'loadedmetadata' already ran go()) into a single resolve.
  // Single-fire finish + absolute ceiling backstop via the shared scheduler (runReveal) — this is the
  // exact pattern runReveal generalizes from. The RAF wheel draw + audio-duration negotiation stay
  // bespoke here; only the "resolve exactly once, with a stall backstop" wiring is shared. The ceiling
  // covers the worst case where audio metadata never loads so go()/the animation never run and no other
  // signal fires; its slack is past the longest real path so a normal spin is never cut short. The
  // signal (!S.rResult) plus _resolveRoulette's own `if(S.rResult)return` are belt-and-suspenders
  // against the iOS-audio double-fire / late-error stall class.
  const _rev=runReveal({steps:[],finishAt:null,ceilingMs:R_SPIN_MS+R_SETTLE_MS+2500,signal:()=>!S.rResult,onFinish:rFinish});
  const finishOnce=()=>_rev.finish();
  if(audio){
    const go=()=>{
      const DUR=Math.round(audio.duration*1000);
      _safePlay(audio);
      audio.onended=()=>setTimeout(finishOnce,R_SETTLE_MS);
      // Tie a guaranteed finish to the animation's own completion too, so a spin still resolves
      // when 'ended' never fires (the animation runs for the audio's duration anyway).
      runAnim(DUR, ()=>setTimeout(finishOnce,R_SETTLE_MS));
    };
    if(audio.readyState>=1) go(); // metadata (duration) already available
    else{
      audio.addEventListener('loadedmetadata',go,{once:true});
      audio.addEventListener('error',()=>runAnim(R_SPIN_MS,()=>setTimeout(finishOnce,R_SETTLE_MUTED_MS)),{once:true});
    }
  } else {
    runAnim(R_SPIN_MS,()=>setTimeout(finishOnce,R_SETTLE_MUTED_MS));
  }
}

// ─── ROULETTE SCREENS ────────────────────────────────────────────────────

// Winning-number tile(s) + name line for the result/respin screens. Double Ball shows both balls.
function rResultNumsHTML(){
  const nums=S.rSpin2!=null?[S.rSpin,S.rSpin2]:[S.rSpin];
  return `<div style="display:flex;justify-content:center;gap:10px;margin-bottom:4px">
      ${nums.map(n=>`<div class="r-res-num ${rCls(n)}">${n}</div>`).join('')}
    </div>
    <div style="font-size:.88rem;color:var(--shadow);margin-bottom:6px">${nums.map(rName).join(' & ')}</div>`;
}

GAMES.roulette.screen = screenRoulette; // register into the Game registry (defined just below; core.js loads first)
// Game-specific bet-UI patch (dispatched by patchBetUI): the selection box shows the picked tile's
// payout for the current stake · keep it in step as the player changes the chip amount or picks a tile.
GAMES.roulette.patchBet = function(bet){
  const sb=document.getElementById(DOM.rouletteSelBox);
  if(sb) sb.innerHTML=rSelBox(S.rPick, bet);
};
// Refresh landed mid-spin: re-arm the ball audio and restart the wheel. If the spin words hadn't
// resolved yet (refresh during the fetch), re-acquire them first · the spin Edge Function is
// idempotent per device-day, so the re-fetch returns the same words.
GAMES.roulette.resume = function(){
  if(S.rPhase!=='spinning') return;
  _initRouletteAudio();
  if (S.rSpin == null) {
    const bets = S.rBets.map(b => [b.pick, b.bet]);
    _resolveSpinNumber(bets).then(sp => {
      S.rSpin = sp.n; S.rSpin2 = sp.n2;
      saveState();
      setTimeout(startWheelAnim, 60);
    });
  } else setTimeout(startWheelAnim, 60);
};
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
    <span class="ik"><b>${rBetLabel(b.pick)}</b> · Pays ${b.pay}:1</span>
    <span style="font-family:var(--btn-f);font-size:1.2rem;color:${col(b.delta)}">${csign(b.delta)}</span>
  </div>`).join('');
  return `${hdr('Roulette · Second Chance')}
  <div class="panel" style="text-align:center">
    ${gameDots([], 0, 'spinning', 2)}
    <div class="divider"></div>
    <div class="vband">
      ${rResultNumsHTML()}
      <div style="font-size:1.6rem;font-weight:700;color:${col(displayDelta)};margin-bottom:8px">${csign(displayDelta)} chips</div>
    </div>
    <div class="divider"></div>
    <div class="vband">${betRows}</div>
    <div class="divider"></div>
    <div style="font-size:.9rem;color:var(--cream);margin-bottom:10px">Keep this result, or use your one re-spin?</div>
    <div style="display:flex;gap:10px">
      <button class="act-btn" style="flex:1" onclick="rKeepSpin()">Keep Result</button>
      <button class="btn-gold" style="flex:2" onclick="rDoRespin()">Re-spin ${icon('target')}</button>
    </div>
  </div>`;
}

function screenRouletteSpinning(){
  const maxBets=rMaxBets();
  // Show the real "Your Bets" tracker (read-only, no × remove buttons) during the spin so the
  // player sees exactly what's riding. The box uses the bare .r-bets-zone class (not the
  // #r-bets-zone id), so the bet-screen's id-scoped width/centering + mobile font-shrink rules
  // don't reach it; those are re-scoped to this panel via `.panel:has(#rwheel)` in styles.css.
  // It inherits the inlaid shadow from the class rule.
  return `${hdr('Roulette · Spinning!')}
  <div class="panel">
    <div class="wheel-outer">
      <div class="wheel-pointer"></div>
      <canvas id="${DOM.rouletteWheel}" width="300" height="300"></canvas>
    </div>
    <div class="r-bets-zone">${rBetsZone(S.rBets,maxBets,true)}</div>
  </div>`;
}

function screenRouletteBet(){
  const maxBets=rMaxBets();
  const aios=getMod('all_in_or_skip');
  // Clear a now-illegal pick (e.g. a force-group mod blocks the previously-selected tile).
  if(rBetBlocked(S.rPick)){S.rPick=null;S.rBet=0;}
  const pb=S.rPick!==null?R_BETS[S.rPick]:null;
  const boardPad=getMod('r_color_double')||getMod('r_payout_mult')?'padding-bottom:28px':'';
  const board=`<div class="r-board-wrap" ${boardPad?`style="${boardPad}"`:''}>${rBoard()}</div>`;
  const betInfo=`<div id="r-bet-info"><div class="irow">${pb?`<span class="ik">Bet on: <b style="color:var(--ink)">${rBetLabel(S.rPick,true)}</b></span><span class="iv">${pb.pay}:1 payout</span>`:`<span class="ik" style="color:var(--shadow)">Select a tile to bet on</span><span class="iv"></span>`}</div></div>`;

  if(aios&&S.rBets.length===0){
    return `${hdr('Roulette · 1 Spin')}
    <div class="panel">
      <div class="sec">The Table · Select where to go all in</div>
      ${board}
      <div style="display:flex;gap:10px;margin:10px 0">
        <button class="btn-gold" style="flex:2" onclick="rAllIn()" ${!pb?'disabled':''}>All In on ${pb?rBetLabel(S.rPick):'...'} (${cfmt(S.chips)}) →</button>
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
  return `${hdr(hdrTitle)}
  <div class="panel">
    ${board}
    <div class="divider"></div>
    <div class="r-bet-center${maxBets===1?' r-one':''}${maxBets===3?' r-three':''}">
      <div id="${DOM.rouletteSelBox}" class="r-sel-box">${rSelBox(S.rPick,S.rBet)}</div>
      <div id="${DOM.rouletteBetsZone}" class="r-bets-zone">${rBetsZone(S.rBets,maxBets)}</div>
    </div>
    ${chipSel(S.chips,S.rBet,null,`<button id="${DOM.placeBetBtn}" class="btn-gold" onclick="rAddBet()" ${!canAdd?'disabled':''}>Place Bet (${S.rBets.length}/${maxBets})</button>`)}
    <button id="${DOM.dealBtn}" class="btn-gold" style="margin-top:6px" onclick="rSpin()" ${!canSpin?'disabled':''}>Final Spin ${icon('target',{cls:'btn-icon-gap'})}</button>
  </div>`;
}

// Label for the roulette result's advance button: on a Ladder mod day the run
// detours to the free bonus round (see advanceTo), so prompt the climb instead.
function _rNextLabel(){
  return getMod('ladder_free')&&!S.ladResult ? 'Bonus Round: The Ladder →' : 'See Final Results →';
}

function screenRouletteResult(){
  const res=S.rResult,n=S.rSpin;
  if(res.skipped){
    return `${hdr('Roulette · Skipped')}
    <div class="panel" style="text-align:center">
      <div style="font-size:1.75rem;font-weight:700;color:var(--shadow);margin-bottom:12px">Spin Skipped</div>
      <div class="game-manifest" style="text-align:left;margin-bottom:6px">
        <div class="irow"><span class="ik">Final chip total</span><span class="iv">${cfmt(S.chips)}</span></div>
      </div>
      <button class="btn-gold" onclick="advanceTo('results')">${_rNextLabel()}</button>
    </div>`;
  }
  const bets=res.bets||[{pick:S.rPick,won:res.won,delta:res.delta,pay:R_BETS[S.rPick]?.pay}];
  const betRows=bets.map((b,i)=>`${i>0?'<div class="gm-sep" style="opacity:0.35"></div>':''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
      <span style="font-size:1rem"><b>${rBetLabel(b.pick)}</b> · Pays ${b.pay}:1</span>
      <span style="font-family:var(--btn-f);font-size:1.35rem;color:${col(b.delta)}">${csign(b.delta)}</span>
    </div>`).join('');
  return `${hdr('Roulette · Result')}
  <div class="panel" style="text-align:center">
    ${rResultNumsHTML()}
    <div class="result-head">
      <div class="result-hl" style="color:${col(res.delta)}">${res.delta>0?'You Win!':res.delta===0?'Push':'You Lose!'}</div>
      <div class="result-sub" style="color:${col(res.delta)}">${csign(res.delta)} chips</div>
    </div>
    <div class="game-manifest" style="text-align:left;margin-bottom:6px">
      ${betRows}
      <div class="gm-sep" style="opacity:0.35"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 12px">
        <span class="ik">Final chip total</span><span class="iv">${cfmt(S.chips)}</span>
      </div>
    </div>
    <button class="btn-gold" onclick="advanceTo('results')">${_rNextLabel()}</button>
  </div>`;
}

// ─── ROULETTE ACTIONS ────────────────────────────────────────────────────

/** Skip the roulette spin (all_in_or_skip modifier). Records delta 0 and goes to result. */
function rSkip(){
  txLog({g:'r',a:'skip'});
  S.rResult=mkOutcome('r',0,'skipped',{skipped:true});S.rPhase='result';navRender();
}

function pickBet(i){
  if(rBetBlocked(i))return;
  // The bets box doesn't depend on the selected tile (its title is keyed on bet count only), so tile
  // selection only updates the board highlight + chip UI — never re-renders the box. No flicker.
  if(S.rPick===i){
    S.rPick=null;
    // Deselect: same guarded patch as the select branch below — fall back to a full render if the
    // board isn't on screen, instead of silently no-op'ing a bare querySelectorAll.
    patchOrRender(document.querySelector('[data-idx]'), () => {
      document.querySelectorAll('[data-idx]').forEach(b=>b.classList.remove('r-sel'));
      document.querySelectorAll('.r-chip-sel').forEach(c=>c.remove());
      patchBetUI();
      saveState();
    });
    return;
  }
  S.rPick=i;
  // Move the board highlight + chip UI to the new tile; patchOrRender falls back to a full render if
  // the board isn't on screen (its presence stands in for "the bet screen is rendered").
  patchOrRender(document.querySelector('[data-idx]'), () => {
    document.querySelectorAll('[data-idx]').forEach(b => b.classList.remove('r-sel'));
    const btn = document.querySelector(`[data-idx="${i}"]`);
    if(btn) btn.classList.add('r-sel');
    document.querySelectorAll('.r-chip-sel').forEach(c => c.remove());
    patchBetUI();
    saveState();
  });
}
// Wheel-color text class for a placed bet's tile label: number bets follow the pocket color
// (0 green, reds red, rest black); the red/black even-money bets match. Everything else is neutral.
function rBetCls(pick){
  const d=R_BETS[pick]; if(!d) return '';
  if(d.type==='num'){ const n=+d.lbl; return n===0?'rbz-grn':REDS.has(n)?'rbz-red':'rbz-blk'; }
  if(d.type==='col2') return d.val==='red'?'rbz-red':'rbz-blk';
  return '';
}
// The SELECTION box (top): the tile the player has currently selected and its payout. `pick` is S.rPick
// (or null), `curBet` the staked chip amount. While a tile is selected and a stake is set, it shows the
// live winnings for THAT tile at the current stake (updated via patchBetUI as the stake changes).
function rSelBox(pick,curBet){
  if(pick==null)return`<div class="rsb-prompt">Select a tile to bet on</div>`;
  const d=R_BETS[pick];
  // Three fixed-width columns (CSS), so varying label/payout length never shifts the other sections.
  return`<div class="rsb-box"><span class="rsb-on">Bet on <b class="${rBetCls(pick)}">${rBetLabel(pick)}</b></span><span class="rsb-pays">Pays ${d.pay}:1</span><span class="rsb-win">${curBet>0?'Win +'+cfmt(curBet*d.pay):''}</span></div>`;
}
// The BETS-TRACKER box (below): "Your Bets n/max" + a 2-column grid of maxBets slots. Each placed bet
// shows its potential winnings (bet × pay); unused slots stay faint, so the box is always full.
function rBetsZone(bets,maxBets,readOnly){
  let cells='';
  for(let i=0;i<maxBets;i++){
    const b=bets[i];
    if(b){const d=R_BETS[b.pick];cells+=`<div class="rbz-item"><span class="rbz-lbl ${rBetCls(b.pick)}">${rBetLabel(b.pick)}</span><span class="rbz-win"><span class="rbz-bet">${cfmt(b.bet)}</span> → <b class="rbz-won">+${cfmt(b.bet*d.pay)}</b>${readOnly?'':`<button onclick="rRemoveBet(${i})">×</button>`}</span></div>`;}
    else cells+=`<div class="rbz-item rbz-open"><span>Open slot</span><span>· · ·</span></div>`;
  }
  return`<div class="rbz-title">Your Bets ${bets.length}/${maxBets}</div><div class="rbz-grid">${cells}</div>`;
}
// Board bet-count cap; a mod can raise it, default 6.
function rMaxBets(){ return getMod('r_max_bets')||6; }
/** Adds current rPick+rBet to the placed bets list (multi-bet mode). */
function rAddBet(){
  const maxBets=rMaxBets();
  const isNew=!S.rBets.find(b=>b.pick===S.rPick);
  if(S.rPick===null||!S.rBet||(isNew&&S.rBets.length>=maxBets))return;

  const prevPick=S.rPick, betAmt=S.rBet;
  debit(betAmt,'roulette-bet');
  const placedBet=S.rBets.find(b=>b.pick===prevPick);
  if(placedBet){placedBet.bet+=betAmt;}else{S.rBets.push({pick:prevPick,bet:betAmt});}
  sndChip(betAmt);
  // Keep the bet amount selected for quick repeat bets on other tiles; only the tile pick clears.
  // Cap it to the chips left after this stake so the kept amount can never exceed the balance.
  S.rPick=null; S.rBet=Math.min(betAmt,S.chips);
  saveState();

  const _bt = patchOrRender(document.querySelector(`[data-idx="${prevPick}"]`), null);
  if(!_bt) return; // patchOrRender already fell back to a full render
  const boardBtn = _bt[0];

  boardBtn.classList.remove('r-sel');
  boardBtn.querySelectorAll('.r-chip-sel').forEach(c=>c.remove());
  const total=S.rBets.filter(b=>b.pick===prevPick).reduce((s,b)=>s+b.bet,0);
  const existingChip=boardBtn.querySelector('.r-chip-placed');
  if(existingChip)existingChip.textContent=chipLbl(total);
  else boardBtn.insertAdjacentHTML('beforeend',`<span class="r-chip r-chip-placed">${chipLbl(total)}</span>`);

  patchEl(DOM.betVal, bv=>bv.textContent=cfmt(S.rBet)); // keep showing the retained amount, not 0
  document.querySelectorAll('.chbtn').forEach(b=>{b.disabled=S.rBet+(+b.dataset.v)>S.chips;});

  patchEl(DOM.rouletteBetsZone, z=>z.innerHTML=rBetsZone(S.rBets,maxBets));
  patchEl(DOM.rouletteSelBox, sb=>sb.innerHTML=rSelBox(S.rPick,S.rBet));
  patchEl(DOM.placeBetBtn, pba=>{pba.textContent=`Place Bet (${S.rBets.length}/${maxBets})`;pba.disabled=true;});
  patchEl(DOM.dealBtn, db=>db.disabled=false);

  updateChipDisplay();
}
/** Removes a placed bet and refunds chips. */
function rRemoveBet(i){
  if(i<0||i>=S.rBets.length)return;
  credit(S.rBets[i].bet,'roulette-refund');
  S.rBets.splice(i,1);
  saveState();render();
}
/** All In on the current pick (all_in_or_skip modifier). */
function rAllIn(){
  if(S.rPick===null||S.chips===0)return;
  S.rBets=[{pick:S.rPick,bet:S.chips}];
  debit(S.chips,'roulette-allin');
  rSpin();
}
// The active "hot number" pocket boost as {num, boost}, or null, from an explicit modifier
// accessor. Drives both Hot Zero (pocket 0) and Sweet Sixteen (pocket 16) — same shape, one path.
// `boost` is the likelihood multiplier vs a fair wheel: 10 means the pocket lands 10× as often as
// its normal 1/37 (see _pickSpin). `mod` is a key→value reader (getMod in-page; a preset reader
// server-side), so the replay engine builds the same bundle without globals.
function _hotFor(mod){
  const n=mod('r_hot_number');
  return n!=null ? {num:n, boost:mod('r_hot_boost')||0} : null;
}
// The dynamic color boost (Loaded Colors) for the player's single Red/Black bet, or null, from an
// explicit (mod, bets). The mod caps the board at one bet, so the boosted color is whichever the
// player picked. Returns the chosen color's 18 pockets plus the other 19 (the other color + green 0).
// A non-color single bet (or no bet) returns null, so the wheel spins fair. `pct` is the win
// likelihood of the chosen color, e.g. 66 ⇒ it lands 66% of the time instead of the usual ≈48.6%.
// `bets` are {pick,bet} objects (the locked set); the engine converts its [[pick,amt]] pairs first.
function _colorBoostFor(mod, bets){
  const pct=mod('r_color_boost');
  if(pct==null) return null;
  const b=bets[0];
  if(!b||R_BETS[b.pick]?.type!=='col2') return null;
  const nums=getRBetNums(b.pick);            // 18 pockets of the chosen color (red=45, black=46)
  const chosen=new Set(nums);
  const others=[];
  for(let p=0;p<=36;p++) if(!chosen.has(p)) others.push(p); // 19 pockets: other color + green 0
  return {nums, others, pct};
}
// In-page adapter: reads today's globals through getMod.
function rHotNumber(){ return _hotFor(getMod); }

// Pure spin-distribution bundle from an explicit (mod, bets, override) — the replay-friendly core
// of spinMods(). Same shape spinFromRandom needs, built without globals so the Phase-2 engine can
// replay a stored Spin from the day's modifier config + the transcript's locked bets.
function spinModsFor(mod, bets, override){
  return {
    override:   override!=null ? override : null,
    forceGroup: mod('r_force_group'),
    hot:        _hotFor(mod),
    colorBoost: _colorBoostFor(mod, bets),
    doubleBall: !!mod('r_double_ball'),
  };
}

// Snapshots the day's spin-distribution Modifiers into the plain bundle spinFromRandom needs. The
// global reads (getMod / DEAL / the locked bet) live HERE, not in spinFromRandom, so the server can
// replay a stored Spin by rebuilding the same bundle from the day's config. See LEADERBOARD-INTEGRITY.md.
function spinMods(){
  return spinModsFor(getMod, S.rBets, DEAL.rSpinOverride);
}

// Maps random words (4 uint32s) to the winning pocket(s), honoring the day's modifier distribution.
// PURE: a function of (words, mods) only — the same inputs always give the same numbers, so the
// server recomputes the outcome from its stored `spins` row plus the day's rebuilt `mods` bundle.
// `mods` defaults to a snapshot of today's globals (spinMods) so in-page callers and tests may omit
// it; the server passes its own. (The 2^32 % 37 modulo bias is ~1e-8 relative — irrelevant.)
function spinFromRandom(words, mods = spinMods()){
  if(mods.override!=null)return{n:mods.override,n2:null};
  const w=i=>words[i]>>>0;
  let n;
  const fg=mods.forceGroup;
  const hot=mods.hot;
  const cb=mods.colorBoost;
  if(fg&&R_GROUP_INFO[fg]){const ns=[...R_GROUP_INFO[fg].nums];n=ns[w(0)%ns.length];}
  // Hot number (true Nx): a two-stage draw that keeps the wheel at its normal 37 pockets instead
  // of diluting it. With probability boost/37 the ball is on the hot pocket — so a boost of 10
  // lands it at 10/37, exactly 10× the fair 1/37. Otherwise it's an ordinary fair spin over the
  // OTHER 36 pockets (word1 % 36 mapped to 0-36, skipping the hot one).
  else if(hot){
    if(w(0)%37<hot.boost)n=hot.num;
    else{const i2=w(1)%36;n=i2<hot.num?i2:i2+1;}
  }
  // Loaded Colors: the same two-stage shape as Hot Number, but the "hit" set is the player's chosen
  // color's 18 pockets. With probability pct/100 land uniformly on the chosen color, otherwise land
  // uniformly on one of the other 19 pockets (the other color + green 0). Chosen color → exactly pct%.
  else if(cb){
    n=(w(0)%100<cb.pct)?cb.nums[w(1)%cb.nums.length]:cb.others[w(1)%cb.others.length];
  }
  else n=w(0)%37;
  // Double Ball: a second, distinct pocket — `n+1+k` for k uniform over 0..35 walks the other 36
  // pockets exactly once each, so it's uniform over them and distinct from n by construction.
  const n2=mods.doubleBall?(n+1+w(2)%36)%37:null;
  return{n,n2};
}

// SHA-256 hex of the locked bets ([[pick, amount], …] in placement order). It is a commitment to
// the bets (not a nonce — it's deterministic, derived from the bets themselves): sent with the spin
// request and stored server-side, then submit-score recomputes it from the transcript and rejects a
// mismatch. So fetching the spin words before really betting commits you to the bets you hashed.
async function _betHash(bets){
  if(!crypto.subtle)return null; // non-secure context (shouldn't happen on https/file)
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(bets)));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Returns the 4 random words that decide this spin. Production asks the `spin` Edge Function
// (idempotent per device-day, so a refresh re-fetch gets the same words and a cheater can't
// re-roll). Dev/test/backlog runs never submit, so they draw locally; a production fetch
// failure also falls back locally but marks the run (submission then carries `unverifiedSpin`).
async function _spinWords(bets){
  const local=()=>{
    if(crypto.getRandomValues)return[...crypto.getRandomValues(new Uint32Array(4))];
    return [0,0,0,0].map(()=>Math.floor(Math.random()*4294967296));
  };
  if(DEV_OVERRIDE||_testActive()||_backlogSeed||!sbConfigured())return local();
  try{
    const betHash=await _betHash(bets);
    const data=await sbJson('/functions/v1/spin',{
      method:'POST',
      body:{seed:getActiveSeed(),fingerprint:getDeviceId(),respin:S.rReSpun,betHash},
      timeout:5000,
    });
    if(!data||!Array.isArray(data.words)||data.words.length<4||!data.words.every(Number.isFinite))throw new Error('bad spin words');
    return data.words;
  }catch(e){
    if(DEV_OVERRIDE)console.error('Server spin failed, falling back to local draw:',e);
    S.rUnverified=true;
    return local();
  }
}

// Fetches the spin words (server or fallback) and maps them to the winning number(s).
async function _resolveSpinNumber(bets){ return spinFromRandom(await _spinWords(bets), spinMods()); }

// In-flight lock so a double-tap can't start two word fetches.
let _rSpinPending=false;

// Locks the bets, logs them to the transcript, fetches the spin randomness, then animates.
// The bet snapshot is taken before any await so the nonce, the transcript, and the resolution
// all see the same set; flipping rPhase to 'spinning' immediately locks the bet UI.
async function rSpin(){
  if(S.rBets.length===0)return;
  if(_rSpinPending||S.rPhase==='spinning')return;
  _rSpinPending=true;
  const bets=S.rBets.map(b=>[b.pick,b.bet]);
  txLog({g:'r',a:'spin',bets,respin:S.rReSpun});
  S.rSpin=null;S.rSpin2=null;
  S.rPhase='spinning';
  render();updateChipDisplay();
  drawStaticWheel();   // paint the wheel face now, so it appears WITH its gold ring (not after the resolve round-trip)
  // Preload the audio now so its duration is available by the time startWheelAnim runs.
  _initRouletteAudio();
  try{
    const sp=await _resolveSpinNumber(bets);
    S.rSpin=sp.n;S.rSpin2=sp.n2;
  }finally{_rSpinPending=false;}
  saveState();
  // Real pre-spin hold: the static wheel (drawn at render) covers the wait, so the wheel sits with
  // its ring for a beat before the ball drops in. Animation starts from wAngle=0/e=0, matching the
  // static frame, so there's no jump.
  setTimeout(startWheelAnim,500);
}
// Paints the wheel at rest (no ball) the instant the spin screen renders, so the face shows together
// with its CSS gold ring instead of the ring appearing first during the _resolveSpinNumber round-trip.
function drawStaticWheel(){
  const cnv=document.getElementById(DOM.rouletteWheel);
  if(!cnv)return;
  const size=Math.min(320,Math.floor((cnv.parentElement?.clientWidth||360)-24));
  cnv.width=size;cnv.height=size;
  drawWheel(cnv,0,[]);
}
// Pure payout-modifier bundle from an explicit (mod, spin2) — the replay-friendly core of
// evalBetMods(). `spin2` is the Double Ball second pocket; it only carries through when the mod is
// active, matching the in-page snapshot. The engine passes the mapped second pocket from replay.
function evalBetModsFor(mod, spin2){
  return {
    payoutMult:  mod('r_payout_mult'),
    numberPay:   mod('r_number_pay'),
    colorDouble: mod('r_color_double'),
    spin2:       mod('r_double_ball') ? spin2 : null,
  };
}
// Snapshots the day's payout Modifiers + the Double Ball second pocket into the plain bundle the
// pure evaluators need, so the server can replay a spin from stored bets + words. The global reads
// live here, not in _evalBets/resolveRoulette (same pattern as spinMods). `spin2` is the second
// pocket only when Double Ball is active.
function evalBetMods(){
  return evalBetModsFor(getMod, S.rSpin2);
}
// Evaluates all placed bets against the spun pocket(s), applying any payout Modifiers, returning
// enriched bet objects. PURE in its params: `mods` defaults to a snapshot of today's globals so
// in-page callers and tests may omit it; the server passes its own. (Double Ball: a bet wins if
// EITHER ball lands on it — pays once at normal odds, the edge is coverage, not a bigger payout.)
function _evalBets(bets, spin, mods = evalBetMods()) {
  const spin2 = mods.spin2;
  return bets.map(b => {
    const bDef = R_BETS[b.pick];
    const won = evalBet(b.pick, spin) || (spin2 != null && evalBet(b.pick, spin2));
    let pay = bDef.pay;
    if (won) {
      if (mods.payoutMult) pay *= mods.payoutMult;
      else if (mods.numberPay && bDef.type === 'num') pay = mods.numberPay;
      else if (mods.colorDouble && bDef.type === 'col2') pay *= 2;
    }
    const delta = won ? b.bet * pay : -b.bet;
    return {...b, won, delta, pay};
  });
}
// Pure Roulette Resolver: per-bet results plus the win-multiplier folded into one signed net delta.
// (bets, spin, {…payout mods, spin2, wm}) → {betResults, delta, result}. No S, no DOM, no credit —
// the caller credits stake+delta and records. This is the settlement the engine replays.
function resolveRoulette(bets, spin, mods){
  const betResults = _evalBets(bets, spin, mods);
  let delta = betResults.reduce((s,b) => s + b.delta, 0);
  if (mods.wm>1 && delta>0) delta *= mods.wm;
  return { betResults, delta, result: delta>0?'win':delta<0?'lose':'push' };
}
// Settlement Ledger for the settled roulette round — the ONE credit mapping shared by the live settle
// (_resolveRoulette) and the replay Engine. PURE: returns a single {op,n,reason} entry (applied via
// applyLedger). The whole stake was debited at placement, so returning stake + delta lands the balance
// exactly `delta` from break-even in one credit.
function rouletteAward(stake, delta){ return [{op:'credit', n:stake+delta, reason:'roulette'}]; }
// Settles all bets: returns stake + profit for winners, with the win multiplier folded into delta.
function _resolveRoulette(){
  // Idempotency guard: only ever credit a spin once. A duplicate/late rFinish — flaky mobile
  // audio firing both `onended` and `error`, a bfcache restore, a double-tap, or a refresh race
  // re-running the resume path — could otherwise call this again and credit the win a second
  // time (e.g. an all-in number win showing 2× the real stack, with the late re-credit landing
  // after the leaderboard submission). rResult is only ever set by a completed resolve (or a
  // skip), so if it's already set the round is done — bail before touching chips.
  if(S.rResult) return;
  // The whole staked amount was debited at placement, so returning stake + delta lands the balance
  // exactly `delta` from break-even in one credit, and `delta` is the one number recorded for the
  // score / server replay.
  const {betResults, delta, result} = resolveRoulette(S.rBets, S.rSpin, {...evalBetMods(), wm: winMult()});
  const stake = S.rBets.reduce((s,b) => s + b.bet, 0);
  applyLedger(liveAcct(), rouletteAward(stake, delta));
  S.rResult = mkOutcome('r', delta, result, {bets:betResults});
  S.rPhase='result';navRender();updateChipDisplay(); // crossfade spin → result panel
  if(delta>0)setTimeout(sndBigWin,400);
}
// Called when the wheel animation finishes — goes to respin phase if unused, otherwise resolves.
function rFinish(){
  if(getMod('r_respin')&&!S.rReSpun){S.rPhase='respin';navRender();return;}
  _resolveRoulette();
}
function rKeepSpin(){txLog({g:'r',a:'keep'});_resolveRoulette();} // player chose to keep the respin result
function rDoRespin(){S.rReSpun=true;rSpin();} // the re-spin is logged by rSpin (respin:true)
