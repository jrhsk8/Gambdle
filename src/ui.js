// ─── UI HELPERS ───────────────────────────────────────────
const fmt=n=>n.toLocaleString();
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

function chipSel(maxC,curBet,denoms,extraBtn=''){
  const ds=(denoms||[10,25,50,100,250,500,1000]);
  const btns=ds.map(d=>`<button class="chbtn ch-${d}" data-v="${d}" onclick="addChip(${d})" ${curBet+d>maxC?'disabled':''}><span>${d}</span></button>`).join('');
  return`<div class="chip-row">${btns}</div>
  <div class="bet-row">
    <div class="bet-amt">
      <span style="font-size:.68rem;color:var(--shadow);text-transform:uppercase;letter-spacing:.15em">Bet</span>
      <span id="bv" style="font-family:var(--btn-f);font-size:2.2rem;font-weight:700;color:var(--ink)">${fmt(curBet)}</span>
    </div>
    ${extraBtn}
    <button class="ch-clear" onclick="clearBet()">✕ Clear</button>
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
    <span class="mb-right"><span id="chip-badge" class="chip-badge">💵 ${fmt(S.chips)}</span></span>
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
      <div class="mod-banner-title">✨ ${modTitle}</div>
    </div>
    <div class="mod-banner-r">${modDesc||''}</div>
  </div>`;
}

// ─── AUDIO SYSTEM ─────────────────────────────────────────────
// Plays an HTMLAudioElement defensively. Audio is never essential, but every sound call fires from
// inside a setTimeout chain that drives game flow (deal, dealer reveal, the blackjack celebration,
// next-hand advance), so a sound that THROWS strands the game with no way to advance. A privacy /
// tracking-protection tool or an older browser can make play() return undefined instead of a Promise
// — then `.catch` throws "Cannot read properties of undefined" — and play() can also throw outright.
// We guard both: returns the play() Promise when there is one (so gated callers like sndShuffle can
// attach their own handler), else null. onReject fires when play() did not yield a usable Promise.
function _safePlay(a,onReject){
  try{
    const p=a&&a.play();
    if(p&&typeof p.catch==='function'){p.catch(()=>{if(onReject)onReject();});return p;}
  }catch(e){}
  if(onReject)onReject();   // play() returned non-Promise (or threw) → treat as "won't play"
  return null;
}
function playMp3(src,ms=0){
  if(getPref('mute'))return;
  if(ms){setTimeout(()=>playMp3(src),ms);return;}
  try{_safePlay(new Audio(src));}catch(e){}   // also guard a throwing Audio() constructor
}
function sndCard(ms=0){playMp3(`assets/sounds/card${Math.ceil(Math.random()*3)}.mp3`,ms);}
// d = chip denomination (or 'allin'); selects the appropriate sound effect.
function sndChip(d){playMp3(d==='allin'?'assets/sounds/allin.mp3':d<=25?'assets/sounds/smallbet.mp3':'assets/sounds/mediumbet.mp3');}
function sndShuffle(cb){
  if(getPref('mute')){if(cb)setTimeout(cb,0);return;}
  let a;
  try{a=new Audio('assets/sounds/shuffle.mp3');}catch(e){if(cb)setTimeout(cb,0);return;}
  if(cb){
    let done=false;
    const once=()=>{if(!done){done=true;cb();}};
    a.onended=once;a.onerror=once;
    // The deal is gated on this callback — bj/uth/poker leave the 'dealing' lock only when it
    // fires — so it MUST run even if the audio stalls. play() can resolve yet never emit
    // 'ended'/'error' (tab backgrounded mid-clip, a suspended/throttled element, or iOS's
    // per-session HTMLAudioElement limit after many new Audio() calls in a hand). Without a ceiling
    // the game hangs forever on the dealing screen with a disabled Deal button. 2000ms clears the
    // ~1s clip so normal playback is never cut short; the clip keeps playing (we don't pause it) —
    // only the cards deal early in the rare stall.
    setTimeout(once,2000);
    // If play() can't yield a Promise (blocked/overridden media API), _safePlay calls onReject so the
    // 800ms fallback still deals the cards instead of throwing and stranding the game on 'dealing'.
    _safePlay(a,()=>setTimeout(once,800));
  }else{
    _safePlay(a);
  }
}
function sndBigWin(){playMp3('assets/sounds/bigwin.mp3');}

let _ac=null;
// Returns the shared AudioContext, creating or resuming it on first use.
function getAC(){if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();return _ac;}

// Synthesized ball-rattle using Web Audio oscillators — no audio file required.
// Clicks get slower and further apart as the ball decelerates over `dur` seconds.
function sndSpin(dur){
  if(getPref('mute'))return;
  try{
    const c=getAC(),t0=c.currentTime+0.05;
    let t=t0;
    while(t<t0+dur){
      const prog=(t-t0)/dur;
      const eased=1-Math.pow(1-prog,3);
      const interval=0.038+eased*0.52;
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g);g.connect(c.destination);
      o.type='sine';
      o.frequency.setValueAtTime(380+Math.random()*180,t);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.055,t+0.004);g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
      o.start(t);o.stop(t+0.05);
      t+=interval;
    }
    const o2=c.createOscillator(),g2=c.createGain();
    o2.connect(g2);g2.connect(c.destination);
    o2.type='sine';
    o2.frequency.setValueAtTime(180,t0+dur);o2.frequency.exponentialRampToValueAtTime(60,t0+dur+0.25);
    g2.gain.setValueAtTime(0.32,t0+dur);g2.gain.exponentialRampToValueAtTime(0.001,t0+dur+0.3);
    o2.start(t0+dur);o2.stop(t0+dur+0.35);
  }catch(e){}
}

// ─── CHIP & BETTING ───────────────────────────────────────────
// Maps screen name to the S field that holds the current bet amount.
const BET_REF={bj:'bjBet',uth:'uthAnte',poker:'pkBet',roulette:'rBet'};
// Returns the state key for the active screen's bet (e.g. 'bjBet', 'uthAnte').
function curBetRef(){return BET_REF[S.screen]??'pkBet';}
// UTH caps at 2/3 of chips so the player always has enough left for a 1× raise.
function maxBet(){return S.screen==='uth'?Math.floor(S.chips*2/3):S.chips;}

// Updates chip buttons, bet display, and action button states without a full re-render.
function patchBetUI() {
  const k = curBetRef();
  const bet = S[k];
  const max = maxBet();
  const minChipsMod = getMod('min_chips') || 0;
  const isBetValid = bet >= minChipsMod;
  const bv=document.getElementById('bv');
  if(!bv){ render(); return; }
  bv.textContent = fmt(bet);
  document.querySelectorAll('.chbtn').forEach(b => {
    b.disabled = bet + (+b.dataset.v) > max;
  });
  const db=document.getElementById('db');
  if(db){
    const maxBets=getMod('r_max_bets')||5;
    // Roulette uses the S.rBets array, not the scalar rBet; Spin button enables when any bet is placed.
    db.disabled=(k==='rBet'?S.rBets.length===0:(bet===0||!isBetValid));
    const pba=document.getElementById('pb-add');
    if(pba){const pickAlreadyBet=S.rPick!==null&&S.rBets.some(b=>b.pick===S.rPick);pba.disabled=!((S.rBets.length<maxBets||pickAlreadyBet)&&S.rPick!==null&&bet>0);}
  }
  const ai=document.getElementById('ai');
  if(ai)ai.disabled=max===0 || max < minChipsMod;
  const us=document.getElementById('uth-summary');
  if(us) {
    // Match the render's split: ante rounds up, blind rounds down (see _uthAntePortion/_uthBlindPortion).
    const ante=Math.ceil(bet/2), blind=Math.floor(bet/2);
    us.innerHTML = `Ante <b style="color:var(--gold)">${fmt(ante)}</b> + Blind <b style="color:var(--gold)">${fmt(blind)}</b> = <b style="color:var(--gold-hi)">${fmt(bet)}</b> chips total`;
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
  return false;
}
function addChip(d){if(!_inBetPhase())return;const k=curBetRef();S[k]=Math.min(S[k]+d,maxBet());sndChip();patchBetUI();}
function clearBet(){if(!_inBetPhase())return;S[curBetRef()]=0;patchBetUI();}
function allIn(){if(!_inBetPhase())return;S[curBetRef()]=maxBet();sndChip();patchBetUI();}

// ─── SHARED SNIPPET HELPERS ───────────────────────────────────
const runningTotalRow = () => `<div class="irow" style="margin-top:12px"><span class="ik">Running total</span><span class="iv">${fmt(S.chips)} chips</span></div>`;
const nextBtn = (action, text) => `<button class="btn-gold" style="margin-top:12px" onclick="${action}">${text}</button>`;
const aiosRow = (allInOnClick, skipOnClick) => `<div style="display:flex;gap:10px;margin-top:8px">
    <button class="btn-gold" style="flex:2" onclick="${allInOnClick}">All In (${fmt(S.chips)}) →</button>
    <button class="ch-clear" style="flex:1;padding:17px" onclick="${skipOnClick}">Skip Hand</button>
  </div>`;

// ─── SHARING & UTILS ──────────────────────────────────────────
function buildShareText(){
  const g1Net=gameNet(GAME1);
  const g2Net=gameNet(GAME2);
  const rNet=S.rResult?.delta||0;
  const g1=GAME_META[GAME1],g2=GAME_META[GAME2];
  const trophy=getTier(S.chips).emoji;
  const modTitle = getMod('title');
  // Top-percentile brag, appended to the chip-total line only when the player landed in the
  // top half. The percentile arrives async after the share box first renders, so the
  // leaderboard fetch caches it (_lbTopPct) and re-renders the box — see _refreshShareBox.
  const topSuffix = (_lbTopPct != null && _lbTopPct <= 50) ? ` (Top ${_lbTopPct}%)` : ``;
  return [
    `🎰 Gambdle #${S.day}`,
    modTitle ? `Daily modifier: ${modTitle}` : ``,
    `${g1.icon} ${g1.short} (${sign(g1Net)})`,
    `${g2.icon} ${g2.short} (${sign(g2Net)})`,
    `🎡 Roulette (${sign(rNet)})`,
    ``,
    `${trophy} Finished with ${fmt(S.chips)} chips${topSuffix}`,
    // Keep the protocol on the URL — Discord (and most chat apps) only auto-link/embed when it's present.
    `https://gambdle.net`
  ].join('\n');
}
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
// src/tutorial.js, alongside the tutorial tips and About copy, so all editable text is in one file.


// ─── WINDOW MANAGER (Help / About / modifier popup / Send Feedback) ───────────────────────────────
// On DESKTOP these are non-blocking floating windows: multiple open at once, one instance per type
// (re-opening focuses the existing one), and the game stays clickable + draggable underneath. On
// MOBILE (≤480px) each is a single blocking modal (dark backdrop, outside-tap closes) — the old
// behaviour, kept because floating windows don't fit a 360px screen. Both share the WinXP blue-bar
// chrome; `key` namespaces the window id ('win-<key>'). See styles.css `.info-modal.float-win`.
let _winZ = 600;        // z-index high-water mark; floats sit above the game chrome (z 1–500)
let _winCascade = 0;    // each desktop open steps the box down-and-right so windows don't stack exactly

// Brings a floating window's box to the front and gives it the active (blue) title bar, greying
// every other open float via .win-inactive (the existing inactive-title-bar style).
function focusWindow(box) {
  if (!box) return;
  const overlay = box.closest('.info-modal');
  if (overlay) overlay.style.zIndex = ++_winZ;
  document.querySelectorAll('.info-modal.float-win > .info-box').forEach(b =>
    b.classList.toggle('win-inactive', b !== box));
}

// Greys every floating window — fired when the player clicks the game (no window focused).
function blurAllWindows() {
  document.querySelectorAll('.info-modal.float-win > .info-box').forEach(b => b.classList.add('win-inactive'));
}

// × handler: closes the window the button lives in.
function closeWindow(btn) { btn.closest('.info-modal')?.remove(); }

// □ handler: glides this window back to center (zeroes its drag offset). No-op if undragged.
function recenterWindow(btn) {
  const box = btn.closest('.info-box');
  if (!box) return;
  const o = box._winOffset || { x: 0, y: 0 };
  if (o.x === 0 && o.y === 0) return;
  box._winOffset = { x: 0, y: 0 };
  box.style.transition = 'transform 0.22s ease';
  box.style.transform = 'translate(0,0)';
  setTimeout(() => { box.style.transition = ''; }, 220);
}

// Mobile only: an outside tap on the dark overlay closes the modal — EXCEPT the tap that brings an
// unfocused tab back into focus (the _refocusAt / document.hasFocus guard). _downOnSelf gates on a
// click that BOTH starts and ends on the overlay, so releasing a title-bar drag onto the overlay is
// never treated as an outside tap. Desktop floats don't use this — they (de)activate via the
// document-level focus handler (focusWindow / blurAllWindows, in game.js _dragMousedown).
function _infoOverlayClick(el, e) {
  if (e.target !== el || !el._downOnSelf) return;
  if (document.hasFocus() && Date.now() - _refocusAt >= 300) el.remove();
}

// Core opener. `key` identifies the window type; `boxHTML` is the full .info-box element markup.
// Desktop: floating, one per type (focuses an existing one instead of duplicating). Mobile: a single
// blocking modal that replaces any prior dialog. Returns the overlay element.
function _openWindow(key, boxHTML) {
  const id = 'win-' + key;
  if (_isMobile()) {
    document.querySelectorAll('.info-modal').forEach(m => m.remove());   // single blocking modal
    const el = document.createElement('div');
    el.id = id; el.className = 'info-modal';
    el.addEventListener('mousedown', e => { el._downOnSelf = (e.target === el); });
    el.onclick = e => _infoOverlayClick(el, e);
    el.innerHTML = boxHTML;
    document.body.appendChild(el);
    return el;
  }
  const existing = document.getElementById(id);
  if (existing) { focusWindow(existing.querySelector('.info-box')); return existing; }
  const el = document.createElement('div');
  el.id = id; el.className = 'info-modal float-win';
  el.innerHTML = boxHTML;
  document.body.appendChild(el);
  const box = el.querySelector('.info-box');
  const step = (_winCascade++ % 6) * 26;   // cascade so stacked opens don't sit exactly on top
  box._winOffset = { x: step, y: step };
  if (step) box.style.transform = `translate(${step}px,${step}px)`;
  focusWindow(box);
  return el;
}

// The □ recenter button only makes sense for a draggable desktop float; mobile modals are fixed, so
// they show just ×, matching the pre-floating-windows look.
const _recenterBtnHTML = () => _isMobile() ? '' : `<span class="tb-btn" title="Center" onclick="recenterWindow(this)">□</span>`;

// Shared blue-bar window for Help sections, the modifier popup, and About. `key` namespaces the id.
function _openInfoModal(title, content, key) {
  _openWindow(key, `<div class="info-box info-box-titled">
    <div class="title-bar">
      <span class="tb-title"><span class="tb-icon">♠</span>${title}</span>
      <span class="tb-btns">
        ${_recenterBtnHTML()}
        <span class="tb-btn close" title="Close" onclick="closeWindow(this)">×</span>
      </span>
    </div>
    <div class="info-content">${content}</div>
  </div>`);
}

function showInfo(section) {
  const {title, body} = INFO_SECTIONS[section] || INFO_SECTIONS.overview;
  _openInfoModal(title, `<div style="display:flex;flex-direction:column;gap:14px;font-size:1.15rem;color:var(--ink);line-height:1.55">${body}</div>`, 'help-' + section);
}

// File → About Gambdle. A mini ♠ GAMBDLE logo + editable subtitle/body; the copy lives in
// src/tutorial.js (ABOUT_GAMBLE) so it can be edited without touching the UI code.
function showAbout() {
  closeDropdowns();
  const a = (typeof ABOUT_GAMBLE !== 'undefined' && ABOUT_GAMBLE) || { subtitle: '', body: '' };
  const content = `
    <div style="text-align:center;padding:4px 4px 2px">
      <div class="logo logo-mini"><span class="logo-spade">♠</span>GAMBDLE</div>
      <div class="logo-sub">${a.subtitle || ''}</div>
    </div>
    <div class="divider" style="margin:14px 0"></div>
    <div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${a.body || ''}</div>`;
  _openInfoModal('About Gambdle', content, 'about');
}

// ─── MENUS ────────────────────────────────────────────────────
let _forceMobile = null;   // test hook: null = use the real viewport width
const _isMobile = () => _forceMobile !== null ? _forceMobile : window.innerWidth <= 480;

function closeDropdowns() {
  document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
}

// Mobile: inlines submenus directly below the trigger item instead of floating them.
function _showInlineSub(trigger, html, level) {
  const wasOpen = trigger.classList.contains(`dd-item--open-${level}`);
  // Close level-2 subs always; also close level-1 when opening a new level-1
  document.querySelectorAll('.dd-inline-sub.dd-level-2').forEach(el => el.remove());
  document.querySelectorAll('.dd-item--open-2').forEach(el => {
    el.classList.remove('dd-item--open-2');
    const a = el.querySelector('.dd-key'); if (a) a.textContent = '►';
  });
  if (level === 1) {
    document.querySelectorAll('.dd-inline-sub.dd-level-1').forEach(el => el.remove());
    document.querySelectorAll('.dd-item--open-1').forEach(el => {
      el.classList.remove('dd-item--open-1');
      const a = el.querySelector('.dd-key'); if (a) a.textContent = '►';
    });
  }
  if (wasOpen) return;
  trigger.classList.add(`dd-item--open-${level}`);
  const a = trigger.querySelector('.dd-key'); if (a) a.textContent = '▼';
  const sub = document.createElement('div');
  sub.className = `dd-inline-sub dd-level-${level}`;
  sub.innerHTML = html;
  trigger.insertAdjacentElement('afterend', sub);
}

function _positionSubmenu(sub, trigger) {
  const tr = trigger.getBoundingClientRect();
  sub.style.top = tr.top + 'px';
  sub.style.left = tr.right + 'px';
  document.body.appendChild(sub);
  const sr = sub.getBoundingClientRect();
  if (sr.right > window.innerWidth - 4) {
    // Doesn't fit to the right — drop below the trigger instead
    sub.style.top = tr.bottom + 'px';
    sub.style.left = Math.max(4, Math.min(tr.left, window.innerWidth - sr.width - 4)) + 'px';
  }
  const finalTop = parseFloat(sub.style.top);
  if (finalTop + sr.height > window.innerHeight - 4)
    sub.style.top = Math.max(4, window.innerHeight - sr.height - 4) + 'px';
}

// Opens a first-level floating submenu (or inline on mobile). Toggling re-click closes it.
function _openSub1(html, trigger) {
  if (_isMobile()) { _showInlineSub(trigger, html, 1); return; }
  if (document.querySelector('.dd-sub1')) { document.querySelectorAll('.dd-submenu').forEach(d=>d.remove()); return; }
  document.querySelectorAll('.dd-submenu').forEach(d=>d.remove());
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub1';
  sub.innerHTML = html;
  _positionSubmenu(sub, trigger);
}

// Opens a second-level floating submenu keyed by `key`; clicking the same key again closes it.
function _openSub2(key, html, trigger) {
  if (_isMobile()) { _showInlineSub(trigger, html, 2); return; }
  const existing = document.querySelector('.dd-sub2');
  if (existing?.dataset.key === key) { existing.remove(); return; }
  existing?.remove();
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub2';
  sub.dataset.key = key;
  sub.innerHTML = html;
  _positionSubmenu(sub, trigger);
}

// ─── Dev menu submenus (hybrid layout) ───────────────────────────────────
// Jump targets, game setup, and chip grants each live behind a ► trigger to keep
// the top-level Developer menu short. Mirror the showModSubmenu/showFutureSubmenu pattern.
const _DD_CB = 'width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0';

function showJumpSubmenu(trigger){
  const nm = g => (typeof GAME_META !== 'undefined' && GAME_META[g] && GAME_META[g].name) || g;
  const html =
    `<div class="dd-item" onclick="goTo(GAME1);closeDropdowns()">→ ${nm(GAME1)}</div>` +
    `<div class="dd-item" onclick="goTo(GAME2);closeDropdowns()">→ ${nm(GAME2)}</div>` +
    `<div class="dd-item" onclick="goTo('roulette');closeDropdowns()">→ Roulette</div>` +
    `<div class="dd-item" onclick="devSpin()">🎡 Spin Wheel (5 bets)</div>` +
    `<div class="dd-item" onclick="goTo('results');closeDropdowns()">→ Results</div>`;
  _openSub1(html, trigger);
}

function showGameSetupSubmenu(trigger){
  const _gName = (opts, val) => opts.find(o=>o.value===val)?.label || val;
  const slots = [
    { slot:1, current:GAME1, opts:GAME1_OPTIONS.filter(o=>o.value!==GAME2), label:'Game 1' },
    { slot:2, current:GAME2, opts:GAME2_OPTIONS.filter(o=>o.value!==GAME1), label:'Game 2' },
  ];
  const cfg = slots.map(({slot,current,opts,label}) =>
    `<div class="dd-game-lbl">${label}</div><div class="dd-game-row">${opts.map(({value,label:l}) =>
      `<button class="dd-game-btn${current===value?' active':''}" onclick="devSetGame(${slot},'${value}')">${l}</button>`
    ).join('')}</div>`
  ).join('');
  const html = cfg +
    `<div class="dd-sep"></div>` +
    `<div class="dd-item" onclick="toggleTestSeed();event.stopPropagation()" style="gap:12px"><span>Test Seed (reset to apply)</span><input type="checkbox" id="dev-test-seed-cb" ${_testActive()?'checked':''} onclick="event.stopPropagation()" style="${_DD_CB}"></div>` +
    `<div class="dd-item" onclick="devToggleUnlocks();event.stopPropagation()" style="gap:12px"><span>All Unlocks</span><input type="checkbox" id="dev-unlocks-cb" ${getPref('golden_back_unlocked')?'checked':''} onclick="event.stopPropagation()" style="${_DD_CB}"></div>`;
  _openSub1(html, trigger);
}

function showChipsSubmenu(trigger){
  const html =
    `<div class="dd-item" onclick="credit(500,'dev');render();updateChipDisplay();closeDropdowns()">+ 500 chips</div>` +
    `<div class="dd-item" onclick="credit(10000,'dev');render();updateChipDisplay();closeDropdowns()">+ 10,000 chips</div>`;
  _openSub1(html, trigger);
}

function showModSubmenu(trigger, action) {
  action = action || 'devApplyMod';
  const cats = [
    {key:'bj',       label:'🃏 Blackjack'},
    {key:'uth',      label:"♠ Hold'em"},
    {key:'cross',    label:'🔀 Cross-Game'},
    {key:'roulette', label:'🎡 Roulette'},
    {key:'choice',   label:"🎲 Player's Choice"},
  ];
  const html = cats.map(c =>
    `<div class="dd-item" onclick="showModTypeSubmenu('${c.key}',this,'${action}');event.stopPropagation()">${c.label} <span class="dd-key">►</span></div>`
  ).join('');
  _openSub1(html, trigger);
}

function showModTypeSubmenu(type, trigger, action) {
  action = action || 'devApplyMod';
  const mods = Object.entries(PRESET_MODIFIERS).filter(([, m]) => m.type === type);
  const html = mods.map(([k, m]) =>
    `<div class="dd-item" onclick="${action}('${k}')">${m.title}</div>`
  ).join('');
  _openSub2(type, html, trigger);
}

function showModifierPopup(key) {
  closeDropdowns();
  const m = PRESET_MODIFIERS[key];
  if (!m) return;
  const content = `<div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${m.desc}</div>` +
    (m.devNote ? `<div class="divider" style="margin:14px 0 10px"></div><div style="font-size:1rem;color:var(--shadow);line-height:1.5"><b>Dev Note:</b> ${m.devNote}</div>` : '');
  _openInfoModal(`✨ ${m.title}`, content, 'modifier');
}

function toggleMenu(which, trigger) {
  const existing = document.querySelector('.dropdown');
  if (existing) {
    const wasThis = existing.dataset.menu === which;
    closeDropdowns();
    if (wasThis) return;
  }
  const rect = trigger.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'dropdown'; el.dataset.menu = which;

  if (which === 'dev') {
    el.innerHTML = `
      <div class="dd-item" onclick="devReset();closeDropdowns()">↺ Reset Run</div>
      <div class="dd-item" onclick="goTo('devstats');closeDropdowns()">📊 Player Stats</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showJumpSubmenu(this);event.stopPropagation()">Jump to <span class="dd-key">►</span></div>
      <div class="dd-item" onclick="showGameSetupSubmenu(this);event.stopPropagation()">Game Setup <span class="dd-key">►</span></div>
      <div class="dd-item" onclick="showChipsSubmenu(this);event.stopPropagation()">Give Chips <span class="dd-key">►</span></div>
      <div class="dd-sep"></div>
      <div class="dd-item" id="dd-future-trigger" onclick="showFutureSubmenu(this);event.stopPropagation()">Preview Future Day <span class="dd-key">►</span></div>
      <div class="dd-item" id="dd-mod-trigger" onclick="showModSubmenu(this);event.stopPropagation()">Force Modifier <span class="dd-key">►</span></div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="devToggleTestTutorial();event.stopPropagation()" style="gap:12px">
        <span>💡 Test Tutorial</span>
        <input type="checkbox" id="dev-test-tutorial-cb" ${_testTutorial()?'checked':''} onclick="event.stopPropagation()" style="${_DD_CB}">
      </div>
      <div class="dd-item" onclick="devToggleLayoutDebug();event.stopPropagation()" style="gap:12px">
        <span>📐 Layout Debug</span>
        <input type="checkbox" id="dev-layout-debug-cb" ${document.body.classList.contains('layout-debug')?'checked':''} onclick="event.stopPropagation()" style="${_DD_CB}">
      </div>`;
  } else if (which === 'file') {
    const canShare = S.screen === 'results';
    const cbStyle='width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0';
    el.innerHTML = `
      ${_backlogSeed ? `<div class="dd-item" onclick="exitBacklog()">↩ Return to Today (#${getDayNum()})</div><div class="dd-sep"></div>` : ''}
      <div class="dd-item" onclick="showBacklogSubmenu(this);event.stopPropagation()">Gambdle #${S.day}${_backlogSeed?(_backlogSeed>getDailySeed()?' · Preview':' · Archive'):''} <span class="dd-key">►</span></div>
      <div class="dd-sep"></div>
      <div class="dd-item ${canShare?'':'dd-disabled'}" onclick="${canShare?'doShare();closeDropdowns()':''}">📋 Copy &amp; Share</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="togglePref('mute');event.stopPropagation()" style="gap:12px">
        <span>🔇 Mute Audio</span>
        <input type="checkbox" id="file-mute-cb" ${getPref('mute')?'checked':''} onclick="togglePref('mute');event.stopPropagation()" style="${cbStyle}">
      </div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showFeedbackDialog();closeDropdowns()">✉ Send Feedback</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showPrefsSubmenu(this);event.stopPropagation()">Preferences <span class="dd-key">►</span></div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showAbout()">♠ About Gambdle</div>`;
  } else {
    el.innerHTML = `
      <div class="dd-item" onclick="showInfo('overview');closeDropdowns()">How to Play</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showInfo('bj');closeDropdowns()">🃏 Blackjack</div>
      <div class="dd-item" onclick="showInfo('uth');closeDropdowns()">♠ Ultimate Hold'em</div>
      <div class="dd-item" onclick="showInfo('roulette');closeDropdowns()">🎡 Roulette</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showInfo('hands');closeDropdowns()">🂡 Poker Hands</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showModSubmenu(this,'showModifierPopup');event.stopPropagation()">✨ Daily Modifiers <span class="dd-key">►</span></div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="toggleTutorial();event.stopPropagation()">💡 Tips: ${getPref('tutorial_off') ? 'Off' : 'On'}</div>`;
  }

  const left = Math.min(rect.left, window.innerWidth - 200);
  el.style.left = left + 'px';
  el.style.top = rect.bottom + 'px';
  document.body.appendChild(el);
  // Deferred so the click that opened the menu doesn't immediately trigger this and close it.
  setTimeout(() => document.addEventListener('click', closeDropdowns, {once:true}), 0);
}

// ─── ARCHIVE (BACKLOG) ────────────────────────────────────────

function enterBacklog(seed) {
  _ls.setItem('gambdle_backlog_seed', seed);
  _doReload();
}

function exitBacklog() {
  _ls.removeItem('gambdle_backlog_seed');
  _doReload();
}

// Returns the YYYYMMDD seed for a given 1-based day number.
function _seedForDayNum(n) {
  const d = new Date(START_DATE_UTC + (n - 1) * 86400000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function showBacklogSubmenu(trigger) {
  const todayNum = getDayNum();
  const history = JSON.parse(_ls.getItem('gambdle_history') || '{}');
  let rows = '';
  for (let n = todayNum - 1; n >= 1; n--) {
    const seed = _seedForDayNum(n);
    const score = history[seed];
    const active = _backlogSeed === seed;
    const scoreStr = score !== undefined ? `<span class="dd-key">${fmt(score)}</span>` : '';
    rows += `<div class="dd-item${active ? ' dd-active' : ''}" onclick="enterBacklog(${seed});event.stopPropagation()">Day #${n} ${scoreStr}</div>`;
  }
  if (!rows) rows = '<div class="dd-item dd-disabled">No past days yet</div>';
  _openSub1(`<div class="dd-archive-list">${rows}</div>`, trigger);
}

function showFutureSubmenu(trigger) {
  const todayNum = getDayNum();
  let rows = '';
  for (let n = todayNum + 1; n <= todayNum + 7; n++) {
    const seed = _seedForDayNum(n);
    const active = _backlogSeed === seed;
    const cycled = CYCLE_ORDER[(n - 1) % CYCLE_ORDER.length];
    const modRef = DAILY_MODIFIERS[seed] || cycled;
    const mod = typeof modRef === 'string' ? PRESET_MODIFIERS[modRef] : modRef;
    const modLabel = mod ? `<span class="dd-key">${mod.title}</span>` : '';
    const seedNote = DAILY_SEED_OVERRIDES[seed] ? ' 🔀' : '';
    rows += `<div class="dd-item${active ? ' dd-active' : ''}" onclick="enterBacklog(${seed});event.stopPropagation()">Day #${n}${seedNote} ${modLabel}</div>`;
  }
  _openSub1(`<div class="dd-archive-list">${rows}</div>`, trigger);
}

// ─── PREFERENCES ─────────────────────────────────────────────
const PREFS_KEY='gambdle_prefs';
function getPrefs(){try{return JSON.parse(_ls.getItem(PREFS_KEY)||'{}');}catch{return{};}}
function getPref(k){return getPrefs()[k];}
function setPref(k,v){const p=getPrefs();p[k]=v;_ls.setItem(PREFS_KEY,JSON.stringify(p));}
function applyPrefs(){
  const p=getPrefs();
  document.body.classList.toggle('four-color', !!p.four_color);
  const cb=p.cardback||'default';
  document.body.classList.toggle('cardback-gold',   cb==='gold'   && !!p.golden_back_unlocked);
  document.body.classList.toggle('cardback-orange', cb==='orange' && !!p.orange_back_unlocked);
  document.body.classList.toggle('cardback-whale',  cb==='whale'  && !!p.whale_back_unlocked);
  document.body.classList.toggle('felt-maroon', (p.felt||'default')==='maroon' && !!p.maroon_felt_unlocked);
  document.body.classList.toggle('deck-emoji',  (p.deck||'default')==='emoji'  && !!p.deck_emoji_unlocked);
  const theme=p.theme||'default';
  document.body.classList.toggle('theme-olive',  theme==='olive');
  document.body.classList.toggle('theme-silver', theme==='silver');
  document.body.classList.toggle('theme-green',  theme==='green' && !!p.green_theme_unlocked);
}

function _prefItem(key,id,label){
  const checked=!!getPref(key);
  return `<div class="dd-item" onclick="togglePref('${key}');event.stopPropagation()" style="gap:12px">
    <span>${label}</span>
    <input type="checkbox" id="${id}" ${checked?'checked':''} onclick="togglePref('${key}');event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
  </div>`;
}
function showPrefsSubmenu(trigger){
  const html=_prefItem('four_color','pref-4color','Four Color Deck')+
             `<div class="dd-item" data-picker="deck"     onclick="_showPickerSub('deck',this);event.stopPropagation()">Deck <span class="dd-key">►</span></div>`+
             `<div class="dd-item" data-picker="cardback" onclick="_showPickerSub('cardback',this);event.stopPropagation()">Card Back <span class="dd-key">►</span></div>`+
             `<div class="dd-item" data-picker="felt"     onclick="_showPickerSub('felt',this);event.stopPropagation()">Felt <span class="dd-key">►</span></div>`+
             `<div class="dd-item" data-picker="theme"    onclick="_showPickerSub('theme',this);event.stopPropagation()">Theme <span class="dd-key">►</span></div>`+
             `<div class="dd-sep"></div>`+
             `<div class="dd-item" onclick="resetAllPrefs();event.stopPropagation()" style="color:var(--red)">↺ Reset All</div>`;
  _openSub1(html, trigger);
}
function resetAllPrefs(){
  const p=getPrefs();
  ['four_color','mute','cardback','deck','felt','theme'].forEach(k=>delete p[k]);
  _ls.setItem(PREFS_KEY,JSON.stringify(p));
  applyPrefs();
  closeDropdowns();
}
const PICKER_ITEMS = {
  deck:     { pref:'deck',     options:[{val:'default',label:'Default'},{val:'emoji',label:'Emoji',lock:'deck_emoji_unlocked',hint:'🔒 3500+'}]},
  cardback: { pref:'cardback', options:[{val:'default',label:'Default'},{val:'orange',label:'Orange',lock:'orange_back_unlocked',hint:'🔒 1500+'},{val:'whale',label:'Whale 🐋',lock:'whale_back_unlocked',hint:'🔒 5000+'},{val:'gold',label:'Golden',lock:'golden_back_unlocked',hint:'🔒 10000+'}]},
  felt:     { pref:'felt',     options:[{val:'default',label:'Green'},{val:'maroon',label:'Maroon',lock:'maroon_felt_unlocked',hint:'🔒 2500+'}]},
  theme:    { pref:'theme',    options:[{val:'default',label:'Luna Blue'},{val:'olive',label:'Olive Green'},{val:'silver',label:'Silver'},{val:'green',label:'Luna Green',lock:'green_theme_unlocked',hint:'🔒 2000+'}]},
};
function _showPickerSub(pickerKey,trigger){
  const {pref,options}=PICKER_ITEMS[pickerKey];
  const cur=getPref(pref)||'default';
  const cbStyle='width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;pointer-events:none';
  const html=options.map(o=>o.lock&&!getPref(o.lock)
    ?`<div class="dd-item dd-disabled" style="gap:12px"><span>${o.label}</span><span style="font-size:.8rem;opacity:.55">${o.hint}</span></div>`
    :`<div class="dd-item" onclick="setPick('${pickerKey}','${o.val}');event.stopPropagation()" style="gap:12px"><span>${o.label}</span><input type="checkbox" ${cur===o.val?'checked':''} style="${cbStyle}"></div>`
  ).join('');
  _openSub2(pickerKey, html, trigger);
}
function setPick(pickerKey,val){
  setPref(PICKER_ITEMS[pickerKey].pref,val);
  applyPrefs();
  if (_isMobile()) {
    const t=document.querySelector(`[data-picker="${pickerKey}"]`);
    if(t){ t.classList.remove('dd-item--open-2'); _showPickerSub(pickerKey,t); }
  } else {
    document.querySelectorAll('.dd-sub2').forEach(d=>d.remove());
    const t=document.querySelector(`.dd-sub1 [data-picker="${pickerKey}"]`);
    if(t)_showPickerSub(pickerKey,t);
  }
}
// Maps preference key to the checkbox element ID so togglePref can sync the checkbox state.
const PREF_CB_IDS={four_color:'pref-4color',mute:'file-mute-cb'};
function togglePref(k){
  document.querySelector('.dd-sub2')?.remove();
  setPref(k,!getPref(k));
  applyPrefs();
  const cb=document.getElementById(PREF_CB_IDS[k]);
  if(cb)cb.checked=!!getPref(k);
  if(k==='mute'){
    const icon=document.getElementById('sb-mute-icon');
    if(icon){icon.textContent=getPref('mute')?'🔇':'🔊';icon.title=getPref('mute')?'Unmute':'Mute';}
  }
}

// ── Feedback dialog ───────────────────────────────────────
function showFeedbackDialog() {
  // Re-uses the window manager: a non-blocking float on desktop, a blocking modal on mobile. The
  // char counter updates inline (no addEventListener) so re-opening an existing window never stacks
  // duplicate listeners. The ids stay stable since only one feedback window can exist.
  _openWindow('feedback', `
    <div class="info-box" style="padding:0;max-width:420px">
      <div class="title-bar" style="border-radius:7px 7px 0 0;flex-shrink:0">
        <span class="tb-title"><span class="tb-icon">✉</span>Send Feedback</span>
        <span class="tb-btns">
          ${_recenterBtnHTML()}
          <span class="tb-btn close" title="Close" onclick="closeFeedbackDialog()">×</span>
        </span>
      </div>
      <div style="padding:14px">
        <div style="font-size:1rem;margin-bottom:8px;color:var(--shadow)">Send feedback to the developer</div>
        <textarea id="feedback-txt" class="feedback-textarea" maxlength="500" placeholder="Type here…"
          oninput="document.getElementById('feedback-char').textContent = this.value.length + ' / 500'"></textarea>
        <div id="feedback-char" style="font-size:0.8rem;color:var(--shadow);text-align:right;margin-top:2px">0 / 500</div>
        <div class="act-btns" style="margin-top:10px">
          <button class="act-btn" onclick="closeFeedbackDialog()">Cancel</button>
          <button class="act-btn primary" id="feedback-send-btn" onclick="submitFeedback()">Send</button>
        </div>
      </div>
    </div>`);
  setTimeout(() => document.getElementById('feedback-txt')?.focus(), 50);
}

function closeFeedbackDialog() {
  document.getElementById('win-feedback')?.remove();
}

async function submitFeedback() {
  const ta = document.getElementById('feedback-txt');
  const msg = ta?.value.trim();
  if (!msg) return;
  const btn = document.getElementById('feedback-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/rapid-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ content: `📬 **Gambdle Feedback** · Day #${S.day} · ${fmt(S.chips)} chips\n>>> ${msg}` })
    });
    if (!res.ok) throw new Error();
    closeFeedbackDialog();
    toast('Feedback sent! Thanks 🎲');
  } catch {
    toast('Failed to send. Try again?');
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
  }
}

// ─── XP NOTIFICATION BALLOON ─────────────────────────────────────────────
// Toggle this to enable the welcome popup for all first-time players.
const POPUP_ENABLED = false;

// Tutorial messages keyed by ID — add more here for future tutorial steps.
const POPUP_MESSAGES = {
  welcome: {
    title: 'Welcome to Gambdle!',
    body: "Everyone plays the same hands today. Start with 1,000 chips and play Blackjack → Hold'em → Roulette. Your final chip count is your score. Good luck!",
  },
};

function showPopup(id) {
  if (!POPUP_ENABLED && !DEV_OVERRIDE) return;
  const msg = POPUP_MESSAGES[id];
  if (msg) _renderBalloon(msg.title, msg.body);
}

// Renders the XP balloon with an arbitrary title/body; returns true if shown.
// Shared by showPopup (legacy welcome) and the tutorial tips below.
function _renderBalloon(title, body, sticky = false) {
  const el = document.getElementById('xp-balloon');
  if (!el) return false;
  el.innerHTML = `
    <div class="xpb-inner">
      <div class="xpb-header">
        <div class="xpb-icon">i</div>
        <div class="xpb-title">${title}</div>
        <button class="xpb-close" onclick="dismissPopup()" title="Close">✕</button>
      </div>
      <div class="xpb-body">${body}</div>
    </div>
    <div class="xpb-tail"></div>`;
  el.className = 'xpb-visible';
  el.dataset.sticky = sticky ? '1' : '';
  el.dataset.screen = S.screen;        // sticky balloons close when this screen changes (see _runTutorial)
  _updateBalloonPosition();
  // No auto-fade. Tips also dismiss on an outside click; a sticky balloon (What's New) stays until the
  // X or a screen change instead. Deferred so the opening click doesn't immediately close it.
  if (!sticky) setTimeout(() => document.addEventListener('pointerdown', _popupOutsideClick), 0);
  return true;
}

// ─── TUTORIAL TIPS ───────────────────────────────────────────────────────
// Lightweight, once-ever contextual popups for things that surprise players
// (mostly how this Ultimate Texas Hold'em differs from regular Hold'em). Text
// lives in src/tutorial.js; triggers are wired in _runTutorial(), called from
// render(). Skipped under automation (navigator.webdriver) so tips never appear
// in the test/screenshot/webkit harnesses, and on archive/backlog views.

function _tipSeen(id){ try { return !!_ls.getItem('gambdle_tip_' + id + '_seen'); } catch { return false; } }

// Dev "Test Tutorial" mode: when on, tips always fire (ignoring the seen history and the
// Tips-off setting) and are never persisted as seen, so they reappear on every visit.
function _testTutorial(){ try { return _ls.getItem('gambdle_dev_test_tutorial') === '1'; } catch { return false; } }

// Shows tip `id` once, if tutorials are on and no balloon is already up. Returns
// true if shown. Safe to call on every render — it self-dedupes via localStorage.
function _maybeTip(id){
  const force = _testTutorial();              // dev Test Tutorial: ignore seen + off, never persist
  if (!force && getPref('tutorial_off')) return false;
  if (!force && _tipSeen(id)) return false;
  if (typeof TUTORIAL_TIPS === 'undefined' || !TUTORIAL_TIPS[id]) return false;
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible')) return false; // one at a time → retry next render
  const tip = TUTORIAL_TIPS[id];
  // The first tip a player ever sees gets the "you can turn these off" note appended (not in force mode).
  const firstEver = !force && !_ls.getItem('gambdle_tutorial_intro_seen');
  const body = (firstEver && typeof TUTORIAL_OFF_NOTE === 'string') ? tip.body + TUTORIAL_OFF_NOTE : tip.body;
  if (!_renderBalloon(tip.title, body)) return false;
  if (!force) try {
    _ls.setItem('gambdle_tip_' + id + '_seen', '1');
    if (firstEver) _ls.setItem('gambdle_tutorial_intro_seen', '1');
  } catch {}
  return true;
}

// Pure mapping of the current screen/phase to the tip ids eligible right now, in
// priority order. Kept separate from _runTutorial so it can be unit-tested without
// the automation/balloon side effects. Returns [] on any non-trigger state.
function _eligibleTips(){
  const s = S.screen, out = [];
  if (s === 'intro') out.push('modifier');
  if (s === 'bj'  && S.bjPhase  === 'bet')     out.push('bj_hands');
  if (s === 'uth' && S.uthPhase === 'bet')     out.push('uth_bet');
  if (s === 'uth' && S.uthPhase === 'preflop') out.push('uth_raise');
  if (s === 'uth' && S.uthPhase === 'turn' && !S.uthRaised) out.push('uth_turn'); // river: raise 1x or fold, no check
  if (s === 'uth' && (S.uthPhase === 'reveal' || S.uthPhase === 'result')) out.push('uth_qualify');
  return out;
}

// localStorage key the current "what's new" note dedupes on (one per WHATS_NEW.id).
function _whatsNewKey(){ return 'gambdle_whatsnew_' + (typeof WHATS_NEW !== 'undefined' ? WHATS_NEW.id : ''); }

// Has this player finished at least one run before? Used to limit the "what's new" note to returning
// players. A completed run leaves a highscore and/or a gambdle_history entry.
function _isReturningPlayer(){
  try {
    if (_ls.getItem('gambdle_highscore')) return true;
    return Object.keys(JSON.parse(_ls.getItem('gambdle_history') || '{}')).length > 0;
  } catch { return false; }
}

// Shows the WHATS_NEW announcement balloon once to a returning player with Tips on, then marks it
// seen. A brand-new player is silently opted out of the *current* note (the key is marked seen
// without showing anything) so they only ever see FUTURE announcements; their normal new-player tips
// are untouched. Returns true if the balloon was shown. Environment guards (webdriver / backlog) and
// the "intro screen only" gate live in _runTutorial, its only caller — mirroring _maybeTip.
function _maybeWhatsNew(){
  if (typeof WHATS_NEW === 'undefined' || !WHATS_NEW.enabled) return false;
  if (getPref('tutorial_off')) return false;
  const key = _whatsNewKey();
  let seen; try { seen = !!_ls.getItem(key); } catch { return false; }
  if (seen) return false;
  if (!_isReturningPlayer()) { try { _ls.setItem(key, '1'); } catch {} return false; } // new player → future notes only
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible')) return false; // a tip already has the balloon
  if (!_renderBalloon(WHATS_NEW.title, WHATS_NEW.body, true)) return false; // sticky: X or screen change only
  try { _ls.setItem(key, '1'); } catch {}
  return true;
}

// Shows at most one eligible tip per render (a second surfaces on the next render
// rather than stacking). Skipped under automation (navigator.webdriver) so tips
// never appear in the test/screenshot/webkit harnesses, and on archive/backlog views.
// On the intro screen, the "what's new" note runs first: for a returning player the new-player
// modifier tip is already seen, so the note takes the balloon; for a new player it just silently
// opts them out of the current note and the modifier tip shows as usual.
function _runTutorial(){
  if (!_testTutorial() && (navigator.webdriver || _backlogSeed)) return;
  // A sticky balloon (What's New) closes as soon as you leave the screen it was shown on.
  const bal = document.getElementById('xp-balloon');
  if (bal && bal.classList.contains('xpb-visible') && bal.dataset.sticky === '1' && bal.dataset.screen !== S.screen) dismissPopup();
  if (S.screen === 'intro') _maybeWhatsNew();
  for (const id of _eligibleTips()) if (_maybeTip(id)) break;
}

// Help menu → flip tips on/off. The menu rebuilds its label from getPref on next open.
function toggleTutorial(){
  const off = !getPref('tutorial_off');
  setPref('tutorial_off', off);
  closeDropdowns();
  toast(off ? 'Tips off' : 'Tips on 🎲');
}

// Dev menu → force tips to always show (ignores the seen history and the Tips-off setting).
// Persisted in _ls so it survives reloads while you preview. Tips never get marked seen while on.
function devToggleTestTutorial(){
  const on = !_testTutorial();
  try { _ls.setItem('gambdle_dev_test_tutorial', on ? '1' : ''); } catch {}
  const cb = document.getElementById('dev-test-tutorial-cb');
  if (cb) cb.checked = on;
  toast(on ? 'Test Tutorial on, tips always show' : 'Test Tutorial off');
}

// Timestamp (ms) of the most recent window refocus — see _popupOutsideClick.
let _refocusAt = 0;

// Closes the balloon on any click/tap that isn't inside it — EXCEPT the click that brings the
// window back into focus after it was unfocused (that click should leave the tip up). That refocus
// click can arrive either before focus is restored (document not yet focused) or just after the
// focus event fires, so we guard on both: an unfocused document, or a click within 300ms of refocus.
function _popupOutsideClick(e) {
  const el = document.getElementById('xp-balloon');
  if (el && el.contains(e.target)) return;
  if (!document.hasFocus() || Date.now() - _refocusAt < 300) return;
  dismissPopup();
}

function dismissPopup() {
  document.removeEventListener('pointerdown', _popupOutsideClick);
  const el = document.getElementById('xp-balloon');
  if (!el || !el.classList.contains('xpb-visible')) return;
  el.classList.remove('xpb-visible');
  el.classList.add('xpb-hiding');
  setTimeout(() => { el.className = ''; el.innerHTML = ''; }, 260);
}

// Anchors the balloon above the status bar at the window's right edge.
// Called after render() and on drag so the balloon tracks the window.
function _updateBalloonPosition() {
  const el = document.getElementById('xp-balloon');
  if (!el || !el.classList.contains('xpb-visible')) return;
  const win = document.querySelector('.window');
  if (!win) { el.style.bottom = '46px'; el.style.right = '8px'; return; }
  const rect = win.getBoundingClientRect();
  // Anchor just above the window's bottom-right. When the window is TALLER than the viewport (short
  // desktop height — now possible since the window grows to fit overflowing content), its bottom is
  // off-screen and the formula floors out; keep a 16px floor so the entrance animation (translateY
  // 10px) can't nudge the balloon off the bottom edge. Normal viewports already yield >16 here.
  el.style.bottom = Math.max(16, window.innerHeight - rect.bottom + 32) + 'px';
  el.style.right  = Math.max(4,  window.innerWidth  - rect.right  + 8)  + 'px';
}

// WinXP inactive title bar — dims chrome when tab loses focus
window.addEventListener('blur', () => document.body.classList.add('win-inactive'));
window.addEventListener('focus', () => { document.body.classList.remove('win-inactive'); _refocusAt = Date.now(); });
document.addEventListener('visibilitychange', () =>
  document.body.classList.toggle('win-inactive', document.hidden));
