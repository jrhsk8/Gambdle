// ─── UI HELPERS ───────────────────────────────────────────
const fmt=n=>n.toLocaleString();
// Compact number for tight readouts (bet box, blind pay-table payouts): full below 1,000; above it,
// k (thousands) / m (millions) with up to 2 decimals, trailing zeros trimmed. 1500->1.5k, 12500->12.5k,
// 100000->100k, 1000000->1m, 1250000->1.25m. Keeps the sign for negatives.
function fmtK(n){
  const a=Math.abs(n);
  if(a<1000) return fmt(n);
  const sgn=n<0?'-':'';
  let div=a<1e6?1e3:1e6, unit=a<1e6?'k':'m';
  let v=Math.round(a/div*100)/100;
  if(unit==='k'&&v>=1000){ v=Math.round(v/1000*100)/100; unit='m'; } // 999,999 -> 1m, not 1000k
  const s=Number.isInteger(v)?String(v):v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return sgn+s+unit;
}
const sign=n=>n>=0?'+'+fmt(n):fmt(n);
const col=n=>n>0?'#1fa845':n<0?'#e03535':'#000';

// Maps suit symbols to CSS classes for coloring (red suits get a different color than black).
const SUIT_CLS={'♠':'suit-s','♥':'suit-h','♦':'suit-d','♣':'suit-c'};
function cardHTML(c,sz='md',ex='',dl=0,anim=true){
  if(c==='back')return`<div class="card ${sz} back" style="${ex}"></div>`;
  const cl=(RED_S.has(c.s)?'red':'blk')+' '+(SUIT_CLS[c.s]||'suit-s');
  const ds=anim&&dl?`animation-delay:${dl}s`:'';
  // U+FE0E forces text presentation so iOS renders the suit as a flat glyph that honors
  // the card's red/black color, instead of a multicolor emoji. Display-only — the stored
  // c.s stays a bare symbol for game logic (RED_S, evalBet, card matching).
  const s=c.s+'︎';
  return`<div class="card ${sz} ${cl}${anim?' deal-anim':''}" style="${ds}${ex?';'+ex:''}">
    <div class="ctl"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${s}</span></div>
    <div class="cbody"><span class="csuit">${s}</span></div>
    <div class="cbr"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${s}</span></div>
  </div>`;
}

// Renders an array of cards with staggered deal-in animation.
// animFrom=ANIM_NONE (default) suppresses all animation; 0 animates all cards.
// delay formula for animated cards: (i - animFrom) * interval + base
// ex: per-card extra style — string (shared) or function(card, idx) => string.
function renderCards(cards, sz, animFrom=ANIM_NONE, interval=0, base=0, ex='') {
  return cards.map((c, i) => {
    const n = i >= animFrom;
    const exStr = typeof ex === 'function' ? ex(c, i) : ex;
    return cardHTML(c, sz, exStr, n ? (i - animFrom) * interval + base : 0, n);
  }).join('');
}

// betAmtHTML (optional) overrides the contents of the bet-amount box; when omitted it shows the
// default "Bet <value>" readout (#bv). UTH passes its Ante+Blind+total summary here instead.
function chipSel(maxC,curBet,denoms,extraBtn='',betAmtHTML){
  const ds=(denoms||[10,25,50,100,250,500,1000]);
  const btns=ds.map(d=>`<button class="chbtn ch-${d}" data-v="${d}" onclick="addChip(${d})" ${curBet+d>maxC?'disabled':''}><span>${d}</span></button>`).join('');
  // Same markup as the play/result betInlay readout (label span + value span), with NO inline font
  // styling, so the CSS .bet-amt span:first/last-child rules render the bet-phase box IDENTICALLY to the
  // play screen. #bv stays on the value span for live patching (patchBetUI / roulette rAddBet).
  const amt=betAmtHTML!=null?betAmtHTML
    :`<span>Bet</span><span id="bv">${fmt(curBet)}</span>`;
  // Clear sits to the LEFT of the bet box; All In stays on the right. extraBtn (roulette's Place Bet)
  // rides between the box and All In.
  return`<div class="chip-row">${btns}</div>
  <div class="bet-row">
    <button class="ch-clear" onclick="clearBet()">✕ Clear</button>
    <div class="bet-amt">${amt}</div>
    ${extraBtn}
    <button id="ai" class="ch-allin" onclick="allIn()" ${maxC===0?'disabled':''}>All In</button>
  </div>`;
}

// Renders the hand-progress pill row. count=2 triggers roulette mode (2 dots: Last Spin + Results).
function gameDots(history, hand, phase, count = 3){
  const isR = count <= 2;
  return`<div class="dots-row">${Array.from({length:count},(_,i)=>{
    const h=history[i];
    const label = isR ? (i === 0 ? 'Last Spin' : 'Final Results') : `Hand ${i+1}`;
    const curIdx=phase==='result'?hand-1:hand;
    const isCur=i===curIdx;
    if(h && !h.skipped && !isCur){const d=h.delta;return`<div class="hand-dot ${d>0?'won':d<0?'lost':'push'}">${label}<span class="dot-detail"> ${sign(d)}</span></div>`;}

    const cls=isCur?'cur':i<hand?'push':'pend';
    let txt = label;
    if(isCur && phase==='result') txt += `<span class="dot-detail"> · Results</span>`;
    else if(isCur && phase==='bet') txt += `<span class="dot-detail"> · Place bet</span>`;
    else if(isCur) txt += `<span class="dot-detail"> · Playing</span>`;
    return`<div class="hand-dot ${cls}">${txt}</div>`;
  }).join('')}</div>`;
}

function hdr(sub){
  let titleText = 'Gambdle';
  if (sub) {
    const parts = sub.split(' · ');
    const main = parts[0];
    const detail = parts.length > 1 ? `<span class="tb-detail"> · ${parts[1]}</span>` : '';
    // "Gambdle · " is hidden on mobile (the status bar already shows it) so the long
    // game name fits the narrow title bar without overflowing horizontally.
    titleText = `<span class="tb-prefix">Gambdle · </span>${main}${detail}`;
  }
  return`<div class="title-bar">
    <span class="tb-title"><span class="tb-icon">♠</span>${titleText}</span>
    <span class="tb-btns">
      <span class="tb-btn" title="Min" onclick="snapWindowToOrigin()">_</span>
      <span class="tb-btn" title="Max" onclick="snapWindowToOrigin()">□</span>
      <span class="tb-btn close" title="Close" onclick="snapWindowToOrigin()">×</span>
    </span>
  </div>
  <div class="menu-bar">
    <span class="mb-item" onclick="toggleMenu('file',this);event.stopPropagation()"><u>F</u>ile</span>
    <span class="mb-item" onclick="toggleMenu('help',this);event.stopPropagation()"><u>H</u>elp</span>
    ${DEV_OVERRIDE ? `<span class="mb-item" style="color:var(--gold)" onclick="toggleMenu('dev',this);event.stopPropagation()"><u>D</u>eveloper</span>` : ''}
    <span class="mb-right"><span id="chip-badge" class="chip-badge">${icon('chip')} ${fmt(S.chips)}</span></span>
  </div>
  <div id="hdr-sub" style="display:none">${sub||''}</div>`;
}

// Returns the gold modifier banner HTML, or '' if no modifier is active today.
// Injected into .panel by render() after the screen HTML is built, not part of any screenX() call.
function modBannerHTML(slim=false){
  // The picker screen IS the modifier reveal — don't also stack the banner above it.
  if (S.screen === 'choice') return '';
  const modTitle = getMod('title');
  const modDesc = getMod('desc');
  if (!modTitle) return '';
  return `<div class="mod-banner${slim?' mod-banner-slim':''}">
    <div class="mod-banner-l">
      <div class="mod-banner-label">TODAY'S MODIFIER</div>
      <div class="mod-banner-title">${icon('sparkle', { fill: true, cls: 'mod-star' })} ${modTitle}</div>
    </div>
    <div class="mod-banner-r">${modDesc||''}</div>
  </div>`;
}

// ─── CHIP & BETTING ───────────────────────────────────────────
// Maps screen name to the S field that holds the current bet amount.
const BET_REF={bj:'bjBet',uth:'uthAnte',poker:'pkBet',roulette:'rBet',ladder:'ladBet'};
// Returns the state key for the active screen's bet (e.g. 'bjBet', 'uthAnte').
function curBetRef(){return BET_REF[S.screen]??'pkBet';}
// UTH caps at 2/3 of chips so the player always has enough left for a 1× raise.
// The Ladder caps at 25% of the stack (free-entry days lock the stake to the mod value).
function maxBet(){
  if(S.screen==='ladder')return getMod('ladder_free')||ladMaxStake();
  return S.screen==='uth'?Math.floor(S.chips*2/3):S.chips;
}

// Updates chip buttons, bet display, and action button states without a full re-render.
function patchBetUI() {
  const k = curBetRef();
  const bet = S[k];
  const max = maxBet();
  const minChipsMod = getMod('min_chips') || 0;
  const isBetValid = bet >= minChipsMod;
  const bv=document.getElementById('bv');
  // Re-render only if no chip-bet UI is on screen at all. UTH replaces #bv with its Ante+Blind
  // summary (updated below via #uth-summary), so a missing #bv alone is fine — patch surgically.
  if(!bv && !document.querySelector('.chbtn')){ render(); return; }
  if(bv) bv.textContent = fmt(bet);
  document.querySelectorAll('.chbtn').forEach(b => {
    b.disabled = bet + (+b.dataset.v) > max;
  });
  const db=document.getElementById('db');
  if(db){
    const maxBets=getMod('r_max_bets')||6;
    // Roulette uses the S.rBets array, not the scalar rBet; Spin button enables when any bet is placed.
    db.disabled=(k==='rBet'?S.rBets.length===0:(bet===0||!isBetValid));
    const pba=document.getElementById('pb-add');
    if(pba){const pickAlreadyBet=S.rPick!==null&&S.rBets.some(b=>b.pick===S.rPick);pba.disabled=!((S.rBets.length<maxBets||pickAlreadyBet)&&S.rPick!==null&&bet>0);}
  }
  const ai=document.getElementById('ai');
  if(ai)ai.disabled=max===0 || max < minChipsMod;
  // Roulette: the selection box shows the picked tile's payout for the current stake — keep it in step as
  // the player changes the chip amount or picks a tile (pickBet calls patchBetUI). Mirrors the UTH update.
  if(k==='rBet'){
    const sb=document.getElementById('r-sel-box');
    if(sb) sb.innerHTML=rSelBox(S.rPick, bet);
  }
  const us=document.getElementById('uth-summary');
  if(us) {
    // Match the render's split: ante rounds up, blind rounds down (see _uthAntePortion/_uthBlindPortion).
    const ante=Math.ceil(bet/2), blind=Math.floor(bet/2);
    us.innerHTML = `Ante <b style="color:var(--gold)">${fmt(ante)}</b> + Blind <b style="color:var(--gold)">${fmt(blind)}</b> = <b style="color:var(--ink)">${fmt(bet)}</b> chips total`;
    // Keep the blind pay table (and its header) in step with the staked blind.
    const pt=document.getElementById('uth-ptable');
    if(pt) pt.innerHTML = uthPayTableHTML(blind);
    const pth=document.getElementById('uth-pt-head');
    if(pth) pth.innerHTML = uthPayTableHead(blind);
  }
}

// Returns true only when the current screen is in its initial bet phase.
// 'dealing' is a transient lock set by *Deal() before sndShuffle fires; it is
// never saved to localStorage, so a refresh during that window reloads cleanly.
function _inBetPhase(){
  if(S.screen==='bj')       return S.bjPhase  ==='bet';
  if(S.screen==='uth')      return S.uthPhase ==='bet';
  if(S.screen==='poker')    return S.pkPhase  ==='bet';
  if(S.screen==='roulette') return S.rPhase   ==='bet';
  if(S.screen==='ladder')   return S.ladPhase ==='bet';
  return false;
}
function addChip(d){if(!_inBetPhase())return;const k=curBetRef();S[k]=Math.min(S[k]+d,maxBet());sndChip();patchBetUI();}
function clearBet(){if(!_inBetPhase())return;S[curBetRef()]=0;patchBetUI();}
function allIn(){if(!_inBetPhase())return;S[curBetRef()]=maxBet();sndChip();patchBetUI();}

// ─── SHARED SNIPPET HELPERS ───────────────────────────────────
const nextBtn = (action, text) => `<button class="btn-gold" style="margin-top:12px" onclick="${action}">${text}</button>`;

// ─── BET INLAY BOX + GAME CONTROLS ────────────────────────────
// The bet inlay box is the .bet-amt readout reused OUTSIDE the bet phase — on the play, reveal, and
// result screens — so the player's stake (and, after a hand, their new total) always shows in the same
// box in the same place. It's height-locked to --btn-h by the unified-button rule, so it lines up with
// the buttons placed beneath it. betInlay = the plain "LABEL value" readout (Blackjack stake, post-hand
// total); betInlaySum = a single centered summary line (UTH's Ante · Blind · Raise breakdown), with an
// optional id so it can be patched in place mid-hand.
const betInlay = (label, value) => `<div class="bet-amt bet-inlay"><span>${label}</span><span>${value}</span></div>`;
const betInlaySum = (html, id='') => `<div class="bet-amt bet-inlay bet-inlay-center"${id?` id="${id}"`:''}>${html}</div>`;
// The bottom control cluster: the bet inlay box stacked above the main game button(s), width-capped and
// centered to match the Deal / Final Spin button so the controls sit in the same spot on every screen.
const gameControls = (inlayHTML, buttonsHTML) => `<div class="game-controls">${inlayHTML}${buttonsHTML}</div>`;
const aiosRow = (allInOnClick, skipOnClick) => `<div style="display:flex;gap:10px;margin-top:8px">
    <button class="btn-gold" style="flex:2" onclick="${allInOnClick}">All In (${fmt(S.chips)}) →</button>
    <button class="ch-clear" style="flex:1;padding:17px" onclick="${skipOnClick}">Skip Hand</button>
  </div>`;

// ─── SHARING & UTILS ──────────────────────────────────────────
// The share-text template (buildShareText) lives in src/gametext.js with the
// rest of the editable text.
// Re-renders the on-screen share box (the leaderboard fetch calls this once the
// percentile is known so the displayed text matches what doShare() will copy).
function _refreshShareBox(){
  const box = document.querySelector('.share-box');
  if (box) box.textContent = buildShareText();
}
function doShare(){
  const text = buildShareText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(()=>toast('Copied! 🎲')).catch(()=>_fallbackCopy(text));
  } else {
    _fallbackCopy(text);
  }
}
function _fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); toast('Copied! 🎲'); }
  catch { toast('Copy failed. Try long-pressing the share text.'); }
  document.body.removeChild(ta);
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
// Help-window content (INFO_SECTIONS) and the suit-span renderer it uses now live in
// src/gametext.js, alongside the tutorial tips and About copy, so all editable text is in one file.
