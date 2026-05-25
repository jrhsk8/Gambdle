// ─── UI HELPERS ───────────────────────────────────────────
const fmt=n=>n.toLocaleString();
const sign=n=>n>=0?'+'+fmt(n):fmt(n);
const col=n=>n>0?'#1fa845':n<0?'#e03535':'#cabd9a';

// Maps suit symbols to CSS classes for coloring (red suits get a different color than black).
const SUIT_CLS={'♠':'suit-s','♥':'suit-h','♦':'suit-d','♣':'suit-c'};
function cardHTML(c,sz='md',ex='',dl=0,anim=true){
  if(c==='back')return`<div class="card ${sz} back" style="${ex}"></div>`;
  const cl=(RED_S.has(c.s)?'red':'blk')+' '+(SUIT_CLS[c.s]||'suit-s');
  const ds=anim&&dl?`animation-delay:${dl}s`:'';
  return`<div class="card ${sz} ${cl}${anim?' adeal':''}" style="${ds}${ex?';'+ex:''}">
    <div class="ctl"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${c.s}</span></div>
    <div class="cbody"><span class="csuit">${c.s}</span></div>
    <div class="cbr"><span class="ct-r" data-r="${c.r}">${c.r}</span><span class="ct-s">${c.s}</span></div>
  </div>`;
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
    if(h && !h.skipped){const d=h.delta;return`<div class="hdot ${d>0?'won':d<0?'lost':'push'}">${label}<span class="dot-detail"> ${sign(d)}</span></div>`;}
    const isCur=i===hand;
    const cls=isCur?'cur':i<hand?'push':'pend';
    let txt = label;
    if(isCur && phase==='result') txt += `<span class="dot-detail"> · Next</span>`;
    else if(isCur && phase==='bet') txt += `<span class="dot-detail"> · Place bet</span>`;
    else if(isCur) txt += `<span class="dot-detail"> · Playing</span>`;
    return`<div class="hdot ${cls}">${txt}</div>`;
  }).join('')}</div>`;
}

function hdr(sub){
  let titleText = 'Gambdle';
  if (sub) {
    const parts = sub.split(' · ');
    const main = parts[0];
    const detail = parts.length > 1 ? `<span class="tb-detail"> · ${parts[1]}</span>` : '';
    titleText = `Gambdle — ${main}${detail}`;
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
function modBannerHTML(){
  const modTitle = getMod('title');
  const modDesc = getMod('desc');
  if (!modTitle) return '';
  return `<div class="mod-banner">
    <div class="mod-banner-l">
      <div class="mod-banner-label">TODAY'S MODIFIER</div>
      <div class="mod-banner-title">✨ ${modTitle}</div>
    </div>
    <div class="mod-banner-r">${modDesc||''}</div>
  </div>`;
}

// ─── AUDIO SYSTEM ─────────────────────────────────────────────
function playMp3(src,ms=0){if(getPref('mute'))return;if(ms){setTimeout(()=>playMp3(src),ms);return;}new Audio(src).play().catch(()=>{});}
function sndCard(ms=0){playMp3(`assets/sounds/card${Math.ceil(Math.random()*3)}.mp3`,ms);}
// d = chip denomination (or 'allin'); selects the appropriate sound effect.
function sndChip(d){playMp3(d==='allin'?'assets/sounds/allin.mp3':d<=25?'assets/sounds/smallbet.mp3':'assets/sounds/mediumbet.mp3');}
function sndShuffle(cb){
  if(getPref('mute')){if(cb)setTimeout(cb,0);return;}
  const a=new Audio('assets/sounds/shuffle.mp3');
  if(cb){
    let done=false;
    const once=()=>{if(!done){done=true;cb();}};
    a.onended=once;a.onerror=once;
    a.play().catch(()=>setTimeout(once,800));
  }else{
    a.play().catch(()=>{});
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
    us.innerHTML = `Ante <b style="color:var(--gold)">${fmt(bet/2)}</b> + Blind <b style="color:var(--gold)">${fmt(bet/2)}</b> = <b style="color:var(--gold-hi)">${fmt(bet)}</b> chips total`;
  }
}

function addChip(d){const k=curBetRef();S[k]=Math.min(S[k]+d,maxBet());sndChip();patchBetUI();}
function clearBet(){S[curBetRef()]=0;patchBetUI();}
function allIn(){S[curBetRef()]=maxBet();sndChip();patchBetUI();}

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
  return [
    `🎰 Gambdle #${S.day}`,
    ``,
    `${g1.icon} ${g1.short} (${sign(g1Net)})`,
    `${g2.icon} ${g2.short} (${sign(g2Net)})`,
    `🎡 Roulette (${sign(rNet)})`,
    ``,
    `${trophy} Finished with ${fmt(S.chips)} chips`,
    `gambdle.net`
  ].join('\n');
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
  catch { toast('Copy failed — try long-pressing the share text'); }
  document.body.removeChild(ta);
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
const _SUIT_CLS_MAP={'♠':'sym-s','♥':'sym-h','♦':'sym-d','♣':'sym-c'};
function suitSpans(s){return s.replace(/[♠♥♦♣]/g,m=>`<span class="${_SUIT_CLS_MAP[m]}">${m}</span>`);}

// ─── INFO SECTIONS ────────────────────────────────────────────
const INFO_SECTIONS = {
  overview: {
    title: 'How to Play',
    body: `<div><b>🎰 Gambdle</b> is a daily casino game. Everyone plays the exact same hands — you start with <b>1,000 chips</b>, play two card games back to back, then finish with one spin of the roulette wheel. Your final chip count is your score.</div>
      <div>A new game drops every day at midnight. Compare your score on the leaderboard.</div>
      <div><b>✨ Daily Modifier</b> — every day has a special rule that changes the game for everyone, like boosted payouts or extra betting options. Look for the gold banner at the top of each game screen.</div>`
  },
  bj: {
    title: '🃏 Blackjack',
    body: `<div>You and the dealer each get two cards. Try to get as close to 21 as you can without going over. The dealer plays after you.</div>
      <div>Card values: number cards are face value, face cards (J/Q/K) are worth 10, and Aces are worth 1 or 11 — whichever helps you more.</div>
      <div><b>Hit</b> — take another card. <b>Stand</b> — keep what you have and let the dealer go.</div>
      <div><b>Double Down</b> — double your bet, get exactly one more card, then stand automatically.</div>
      <div><b>Split</b> — if your first two cards are the same rank, split them into two separate hands, each with its own bet.</div>
      <div>The dealer must keep drawing until they hit 17 or higher. If the dealer goes over 21, you win. If you go over 21, you bust and lose your bet.</div>
      <div><b>Blackjack</b> — an Ace plus any 10-value card on your opening two cards. Pays <b>3:2</b> automatically. You play <b>3 hands</b>.</div>`
  },
  uth: {
    title: "♠ Ultimate Texas Hold'em",
    body: `<div>A poker game — just you versus the dealer. Both get 2 private cards, then 5 shared cards are revealed one group at a time. Best 5-card hand out of 7 wins.</div>
      <div>Start by placing equal <b>Ante</b> and <b>Blind</b> bets (the game splits your stake in two for you).</div>
      <div><b>Preflop</b> — you see your 2 cards. Raise <b>4×</b> (strong hand), raise <b>3×</b> (decent hand), or <b>Check</b> to wait and see more cards.</div>
      <div><b>Flop</b> — 3 shared cards are revealed. Raise <b>2×</b> if you haven't raised yet, or Check again.</div>
      <div><b>Turn &amp; River</b> — the last 2 shared cards appear. You must either raise <b>1×</b> to stay in, or <b>Fold</b> and forfeit your bets.</div>
      <div>If your hand beats the dealer's, you win. The dealer needs at least <b>a pair</b> to "qualify" — if they don't, your Ante bet is returned. The <b>Blind</b> pays a bonus if you win with a Straight or better. You play <b>3 hands</b>.</div>`
  },
  roulette: {
    title: '🎡 Roulette',
    body: `<div>A ball is dropped onto a spinning wheel numbered 0–36. Pick where you think it'll land, set your stake, and spin. <b>One spin</b> ends the run.</div>
      <div><b>Numbers 0–36</b> — exact match pays <b>35:1</b>. High risk, high reward.</div>
      <div><b>Columns (2:1)</b> — bet on one of the three columns on the board.</div>
      <div><b>Dozens</b> — 1–12, 13–24, or 25–36. Pays <b>2:1</b>.</div>
      <div><b>Outside bets</b> — Red/Black, Odd/Even, or Low/High (1–18 / 19–36). Pays <b>1:1</b>. Safest option.</div>
      <div>On some modifier days you can place multiple bets before spinning.</div>`
  },
  hands: {
    title: '🃏 Poker Hands',
    body: (()=>{
      const row=(name,cards,desc)=>
        `<span style="color:var(--ink);font-size:1.3rem">${name}</span><span style="color:var(--ink);font-size:1.2rem;text-align:right">${suitSpans(cards)}</span><span style="font-size:1.05rem;grid-column:1/-1;margin-bottom:4px;color:var(--shadow)">${desc}</span>`;
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:4px 16px;font-family:var(--btn-f)">
        ${row('Royal Flush',   'A♠ K♠ Q♠ J♠ 10♠', 'Ace through Ten, all same suit — unbeatable.')}
        ${row('Straight Flush','9♦ 8♦ 7♦ 6♦ 5♦',  'Five in a row, all same suit.')}
        ${row('Four of a Kind','K♠ K♥ K♦ K♣',      'All four cards of the same rank.')}
        ${row('Full House',    'Q♠ Q♥ Q♦ 9♣ 9♥',   'Three of a kind plus a pair.')}
        ${row('Flush',         'A♣ J♣ 8♣ 5♣ 2♣',   'Any five cards of the same suit.')}
        ${row('Straight',      '10♠ 9♥ 8♦ 7♣ 6♠',  'Five in a row, any suits. Ace can be low (A-2-3-4-5).')}
        ${row('Three of a Kind','7♠ 7♥ 7♦',         'Three cards of the same rank.')}
        ${row('Two Pair',      'J♠ J♦ 4♥ 4♣',       'Two different pairs.')}
        ${row('One Pair',      'A♠ A♥',              'Two cards of the same rank.')}
        ${row('High Card',     'K♠ J♥ 9♦ 6♣ 2♠',   'No matching cards — highest card wins.')}
      </div>`;
    })()
  }
};

// Shared factory for both help-section modals and modifier popups.
function _openInfoModal(title, content) {
  document.getElementById('info-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'info-modal'; el.className = 'info-modal';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `<div class="info-box" style="padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--btn-f);color:var(--ink);font-size:1.7rem">${title}</div>
      <button onclick="document.getElementById('info-modal').remove()" style="background:none;border:none;color:var(--shadow);font-size:1.6rem;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div class="divider" style="margin-bottom:14px"></div>
    ${content}
  </div>`;
  document.body.appendChild(el);
}

function showInfo(section) {
  const {title, body} = INFO_SECTIONS[section] || INFO_SECTIONS.overview;
  _openInfoModal(title, `<div style="display:flex;flex-direction:column;gap:14px;font-size:1.15rem;color:var(--ink);line-height:1.55">${body}</div>`);
}

// ─── MENUS ────────────────────────────────────────────────────
const _isMobile = () => window.innerWidth <= 480;

function closeDropdowns() {
  document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
}

// Mobile: inlines submenus directly below the trigger item instead of floating them.
function _showInlineSub(trigger, html, level) {
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
  // Toggle closed if already open
  if (trigger.classList.contains(`dd-item--open-${level}`)) return;
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

function showModSubmenu(trigger, action) {
  action = action || 'devApplyMod';
  const cats = [
    {key:'bj',       label:'🃏 Blackjack'},
    {key:'uth',      label:"♠ Hold'em"},
    {key:'cross',    label:'🔀 Cross-Game'},
    {key:'roulette', label:'🎡 Roulette'},
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
  _openInfoModal(`✨ ${m.title}`, content);
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
    const _gName = (opts, val) => opts.find(o=>o.value===val)?.label || val;
    const _gameSlots = [
      { slot:1, current:GAME1, opts:GAME1_OPTIONS.filter(o=>o.value!==GAME2), label:'Game 1' },
      { slot:2, current:GAME2, opts:GAME2_OPTIONS.filter(o=>o.value!==GAME1), label:'Game 2' },
    ];
    const _gameConfigHTML = _gameSlots.map(({slot,current,opts,label}) =>
      `<div class="dd-game-lbl">${label}</div>
      <div class="dd-game-row">${opts.map(({value,label:l}) =>
        `<button class="dd-game-btn${current===value?' active':''}" onclick="devSetGame(${slot},'${value}')">${l}</button>`
      ).join('')}</div>`
    ).join('');
    el.innerHTML = `
      <div class="dd-item" onclick="devReset();closeDropdowns()">↺ Reset Run</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="goTo(GAME1);closeDropdowns()">→ ${_gName(GAME1_OPTIONS,GAME1)}</div>
      <div class="dd-item" onclick="goTo(GAME2);closeDropdowns()">→ ${_gName(GAME2_OPTIONS,GAME2)}</div>
      <div class="dd-item" onclick="goTo('roulette');closeDropdowns()">→ Roulette</div>
      <div class="dd-item" onclick="devSpin()">🎡 Spin Wheel</div>
      <div class="dd-item" onclick="goTo('results');closeDropdowns()">→ Results</div>
      <div class="dd-sep"></div>
      ${_gameConfigHTML}
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="S.chips+=500;render();updateChipDisplay();closeDropdowns()">+ 500 chips</div>
      <div class="dd-item" onclick="S.chips+=10000;render();updateChipDisplay();closeDropdowns()">+ 10,000 chips</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="toggleTestSeed();event.stopPropagation()" style="gap:12px">
        <span>Test Seed (reset to apply)</span>
        <input type="checkbox" id="dev-test-seed-cb" ${_testActive()?'checked':''} onclick="event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
      </div>
      <div class="dd-item" onclick="devToggleUnlocks();event.stopPropagation()" style="gap:12px">
        <span>All Unlocks</span>
        <input type="checkbox" id="dev-unlocks-cb" ${getPref('golden_back_unlocked')?'checked':''} onclick="event.stopPropagation()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0">
      </div>
      <div class="dd-sep"></div>
      <div class="dd-item" id="dd-mod-trigger" onclick="showModSubmenu(this);event.stopPropagation()">Force Modifier <span class="dd-key">►</span></div>`;
  } else if (which === 'file') {
    const canShare = S.screen === 'results';
    el.innerHTML = `
      <div class="dd-item dd-disabled">Gambdle #${S.day}</div>
      <div class="dd-sep"></div>
      <div class="dd-item ${canShare?'':'dd-disabled'}" onclick="${canShare?'doShare();closeDropdowns()':''}">📋 Copy &amp; Share</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="showPrefsSubmenu(this);event.stopPropagation()">Preferences <span class="dd-key">►</span></div>`;
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
      <div class="dd-item" onclick="showModSubmenu(this,'showModifierPopup');event.stopPropagation()">✨ Daily Modifiers <span class="dd-key">►</span></div>`;
  }

  const left = Math.min(rect.left, window.innerWidth - 200);
  el.style.left = left + 'px';
  el.style.top = rect.bottom + 'px';
  document.body.appendChild(el);
  setTimeout(() => document.addEventListener('click', closeDropdowns, {once:true}), 0);
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
             _prefItem('mute','pref-mute','Mute Audio')+
             `<div class="dd-item" data-picker="deck"     onclick="_showPickerSub('deck',this);event.stopPropagation()">Deck <span class="dd-key">►</span></div>`+
             `<div class="dd-item" data-picker="cardback" onclick="_showPickerSub('cardback',this);event.stopPropagation()">Card Back <span class="dd-key">►</span></div>`+
             `<div class="dd-item" data-picker="felt"     onclick="_showPickerSub('felt',this);event.stopPropagation()">Felt <span class="dd-key">►</span></div>`;
  _openSub1(html, trigger);
}
const PICKER_ITEMS = {
  deck:     { pref:'deck',     options:[{val:'default',label:'Default'},{val:'emoji',label:'Emoji',lock:'deck_emoji_unlocked',hint:'🔒 3500+'}]},
  cardback: { pref:'cardback', options:[{val:'default',label:'Default'},{val:'orange',label:'Orange',lock:'orange_back_unlocked',hint:'🔒 1500+'},{val:'whale',label:'Whale 🐋',lock:'whale_back_unlocked',hint:'🔒 5000+'},{val:'gold',label:'Golden',lock:'golden_back_unlocked',hint:'🔒 10000+'}]},
  felt:     { pref:'felt',     options:[{val:'default',label:'Green'},{val:'maroon',label:'Maroon',lock:'maroon_felt_unlocked',hint:'🔒 2500+'}]},
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
const PREF_CB_IDS={four_color:'pref-4color',mute:'pref-mute'};
function togglePref(k){
  document.querySelector('.dd-sub2')?.remove();
  setPref(k,!getPref(k));
  applyPrefs();
  const cb=document.getElementById(PREF_CB_IDS[k]);
  if(cb)cb.checked=!!getPref(k);
}
