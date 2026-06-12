// ─── MENUS ──────────────────────────────────────────────────────────────────
// The XP menu bar: File / Help / Developer dropdowns and their submenus, the
// archive (backlog) day picker, preferences (+ unlock pickers), and the Send
// Feedback dialog. Floating-window plumbing (_openWindow etc.) lives in
// windows.js; the editable Help/About copy lives in gametext.js.

// ─── MENUS ────────────────────────────────────────────────────

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
      <div class="dd-item" onclick="showProfile()">👤 Player Profile</div>
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
      headers: SUPABASE_HEADERS,
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
