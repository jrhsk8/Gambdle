// ─── UI HELPERS ───────────────────────────────────────────
const fmt=n=>n.toLocaleString();
const sign=n=>n>=0?'+'+fmt(n):fmt(n);
const col=n=>n>0?'#1fa845':n<0?'#e03535':'#cabd9a';

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
      <span class="tb-btn" title="Min">_</span>
      <span class="tb-btn" title="Max">□</span>
      <span class="tb-btn close" title="Close">×</span>
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
function sndCard(ms=0){playMp3(`sounds/card${Math.ceil(Math.random()*3)}.mp3`,ms);}
function sndChip(d){playMp3(d==='allin'?'sounds/allin.mp3':d<=25?'sounds/smallbet.mp3':'sounds/mediumbet.mp3');}
function sndShuffle(cb){
  if(getPref('mute')){if(cb)setTimeout(cb,0);return;}
  const a=new Audio('sounds/shuffle.mp3');
  if(cb){
    let done=false;
    const once=()=>{if(!done){done=true;cb();}};
    a.onended=once;a.onerror=once;
    a.play().catch(()=>setTimeout(once,800));
  }else{
    a.play().catch(()=>{});
  }
}
function sndBigWin(){playMp3('sounds/bigwin.mp3');}

let _ac=null;
function getAC(){if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();return _ac;}

/** Synthesized sound for the Roulette ball rattle. */
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
const BET_REF={bj:'bjBet',roulette:'rBet'};
function curBetRef(){return BET_REF[S.screen]??(GAME2==='uth'?'uthAnte':'pkBet');}
function maxBet(){return(S.screen==='poker'&&GAME2==='uth')?Math.floor(S.chips*2/3):S.chips;}

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

// ─── SHARING & UTILS ──────────────────────────────────────────
function buildShareText(){
  const bjNet=S.bjHistory.reduce((a,h)=>a+h.delta,0);
  const g2Hist=GAME2==='uth'?S.uthHistory:S.pkHistory;
  const g2Net=g2Hist.reduce((a,h)=>a+h.delta,0);
  const rNet=S.rResult?.delta||0;
  const g2Name=GAME2==='uth'?"Ultimate Texas Hold'em":'5 Card Poker';
  const trophy=getTier(S.chips).emoji;
  return [
    `🎰 Gambdle #${S.day}`,
    ``,
    `🃏 Blackjack     (${sign(bjNet)})`,
    `♠️  ${g2Name.padEnd(14)} (${sign(g2Net)})`,
    `🎡 Roulette      (${sign(rNet)})`,
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
    body: `<div><b>🎰 Gambdle</b> is a daily casino challenge. Start with <b>1,000 chips</b> and play three games back to back — Blackjack, Ultimate Texas Hold'em, and Roulette. Your final chip count is your score.</div>
      <div>Everyone plays the same hands each day. A new game unlocks every day at midnight.</div>
      <div><b>✨ Daily Modifier</b> — A special rule is active every day that tweaks payouts or gameplay for everyone. Check the gold banner at the top of each game screen.</div>`
  },
  bj: {
    title: '🃏 Blackjack',
    body: `<div>Beat the dealer without going over 21. You play <b>3 hands</b>.</div>
      <div><b>Hit</b> — take another card. &nbsp;<b>Stand</b> — end your turn.</div>
      <div><b>Double Down</b> — double your bet, receive exactly one more card, then stand.</div>
      <div><b>Split</b> — if your first two cards match in rank, split them into two separate hands (each with its own bet).</div>
      <div>Dealer must stand on 17 or higher. <b>Blackjack</b> (Ace + 10-value on the deal) pays <b>3:2</b>.</div>`
  },
  uth: {
    title: "♠ Ultimate Texas Hold'em",
    body: `<div>Beat the dealer's best 5-card hand using 2 hole cards and 5 community cards. You play <b>3 hands</b>.</div>
      <div>Place equal <b>Ante</b> and <b>Blind</b> bets to start.</div>
      <div><b>Preflop</b> — Raise 4× or 3× before seeing community cards, or check to wait.</div>
      <div><b>Flop</b> — 3 community cards are revealed. Raise 2×, or check.</div>
      <div><b>Turn / River</b> — 4th and 5th community cards. Raise 1×, or fold and forfeit your bets.</div>
      <div>Dealer needs at least a pair to qualify. If dealer doesn't qualify, your Ante pushes. The <b>Blind</b> pays bonus if you win with a Straight or better.</div>`
  },
  roulette: {
    title: '🎡 Roulette',
    body: `<div>Pick where to bet on the board, set your stake, and spin. <b>One spin</b> ends the run.</div>
      <div><b>Numbers 0–36</b> — exact match pays <b>35:1</b>.</div>
      <div><b>Columns (2:1)</b> — top, middle, or bottom row of the board.</div>
      <div><b>Dozens</b> — 1-12, 13-24, or 25-36 — pay <b>2:1</b>.</div>
      <div><b>Outside bets</b> — Red/Black, Odd/Even, 1-18/19-36 — pay <b>1:1</b>.</div>
      <div>On some modifier days you may place multiple bets before spinning.</div>`
  },
  modifiers: {
    title: '✨ Daily Modifiers',
    body: `<div>A modifier is active every day that changes the rules for everyone. The gold banner at the top of each game screen tells you what's active.</div>
      <div><b>Blackjack modifiers</b> — e.g. Blackjacks pay 2:1 · Dealer stands on 15 · Successful doubles pay 2× profit · One free dealer peek.</div>
      <div><b>Hold'em modifiers</b> — e.g. All blind payouts doubled · Blind pays on two pair and trips · Raises pay 2:1 · Dealer needs two pair to qualify.</div>
      <div><b>Roulette modifiers</b> — e.g. All wins doubled · Number bets pay 50:1 · Red/Black pays 2:1 · Place up to 10 bets.</div>
      <div><b>Cross-game</b> — e.g. All In or Skip: each hand you go all-in or skip it entirely. Wins pay 2×.</div>
      <div>The modifier rotates on a fixed cycle — the same cycle repeats for everyone.</div>`
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

function showInfo(section) {
  const existing = document.getElementById('info-modal');
  if (existing) existing.remove();
  const {title, body} = INFO_SECTIONS[section] || INFO_SECTIONS.overview;
  const el = document.createElement('div');
  el.id = 'info-modal'; el.className = 'info-modal';
  el.onclick = e => { if(e.target===el) el.remove(); };
  el.innerHTML = `<div class="info-box" style="padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--btn-f);color:var(--ink);font-size:1.7rem">${title}</div>
      <button onclick="document.getElementById('info-modal').remove()" style="background:none;border:none;color:var(--shadow);font-size:1.6rem;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div class="divider" style="margin-bottom:14px"></div>
    <div style="display:flex;flex-direction:column;gap:14px;font-size:1.15rem;color:var(--ink);line-height:1.55">${body}</div>
  </div>`;
  document.body.appendChild(el);
}

// ─── MENUS ────────────────────────────────────────────────────
const _isMobile = () => window.innerWidth <= 480;

function closeDropdowns() {
  document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
}

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
  if (_isMobile()) { _showInlineSub(trigger, html, 1); return; }
  if (document.querySelector('.dd-sub1')) { document.querySelectorAll('.dd-submenu').forEach(d=>d.remove()); return; }
  document.querySelectorAll('.dd-submenu').forEach(d => d.remove());
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub1';
  sub.innerHTML = html;
  _positionSubmenu(sub, trigger);
}

function showModTypeSubmenu(type, trigger, action) {
  action = action || 'devApplyMod';
  const mods = Object.entries(PRESET_MODIFIERS).filter(([, m]) => m.type === type);
  const html = mods.map(([k, m]) =>
    `<div class="dd-item" onclick="${action}('${k}')">${m.title}</div>`
  ).join('');
  if (_isMobile()) { _showInlineSub(trigger, html, 2); return; }
  const existing = document.querySelector('.dd-sub2');
  if (existing?.dataset.key === type) { existing.remove(); return; }
  existing?.remove();
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub2';
  sub.dataset.key = type;
  sub.innerHTML = html;
  _positionSubmenu(sub, trigger);
}

function showModifierPopup(key) {
  closeDropdowns();
  const m = PRESET_MODIFIERS[key];
  if (!m) return;
  const existing = document.getElementById('info-modal');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'info-modal'; el.className = 'info-modal';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `<div class="info-box" style="padding:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--btn-f);color:var(--ink);font-size:1.7rem">✨ ${m.title}</div>
      <button onclick="document.getElementById('info-modal').remove()" style="background:none;border:none;color:var(--shadow);font-size:1.6rem;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div class="divider" style="margin-bottom:14px"></div>
    <div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${m.desc}</div>
    ${m.devNote ? `<div class="divider" style="margin:14px 0 10px"></div><div style="font-size:1rem;color:var(--shadow);line-height:1.5"><b>Dev Note:</b> ${m.devNote}</div>` : ''}
  </div>`;
  document.body.appendChild(el);
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
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="goTo('bj');closeDropdowns()">→ Blackjack</div>
      <div class="dd-item" onclick="goTo('poker');closeDropdowns()">→ Hold'em</div>
      <div class="dd-item" onclick="goTo('roulette');closeDropdowns()">→ Roulette</div>
      <div class="dd-item" onclick="devSpin()">🎡 Spin Wheel</div>
      <div class="dd-item" onclick="goTo('results');closeDropdowns()">→ Results</div>
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
function getPrefs(){try{return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');}catch{return{};}}
function getPref(k){return getPrefs()[k];}
function setPref(k,v){const p=getPrefs();p[k]=v;localStorage.setItem(PREFS_KEY,JSON.stringify(p));}
function applyPrefs(){
  document.body.classList.toggle('four-color',!!getPref('four_color'));
  const cb=getPref('cardback')||'default';
  document.body.classList.toggle('cardback-gold',   cb==='gold'   && !!getPref('golden_back_unlocked'));
  document.body.classList.toggle('cardback-orange', cb==='orange' && !!getPref('orange_back_unlocked'));
  document.body.classList.toggle('cardback-whale',  cb==='whale'  && !!getPref('whale_back_unlocked'));
  const felt=getPref('felt')||'default';
  document.body.classList.toggle('felt-maroon', felt==='maroon' && !!getPref('maroon_felt_unlocked'));
  const deck=getPref('deck')||'default';
  document.body.classList.toggle('deck-emoji', deck==='emoji' && !!getPref('deck_emoji_unlocked'));
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
  if (_isMobile()) { _showInlineSub(trigger, html, 1); return; }
  if (document.querySelector('.dd-sub1')) { document.querySelectorAll('.dd-submenu').forEach(d=>d.remove()); return; }
  document.querySelectorAll('.dd-submenu').forEach(d=>d.remove());
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub1';
  sub.innerHTML=html;
  _positionSubmenu(sub,trigger);
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
  if (_isMobile()) { _showInlineSub(trigger, html, 2); return; }
  const existing=document.querySelector('.dd-sub2');
  if (existing?.dataset.key === pickerKey) { existing.remove(); return; }
  existing?.remove();
  const sub=document.createElement('div');
  sub.className='dropdown dd-submenu dd-sub2';
  sub.dataset.key=pickerKey;
  sub.innerHTML=html;
  _positionSubmenu(sub,trigger);
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
function togglePref(k){
  document.querySelector('.dd-sub2')?.remove();
  setPref(k,!getPref(k));
  applyPrefs();
  const idMap={four_color:'pref-4color',mute:'pref-mute'};
  const cb=document.getElementById(idMap[k]);
  if(cb)cb.checked=!!getPref(k);
}
