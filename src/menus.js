// ─── MENUS ──────────────────────────────────────────────────────────────────
// The XP menu bar: File / Help / Developer dropdowns and their submenus, the
// archive (backlog) day picker, preferences (+ unlock pickers), and the Send
// Feedback dialog. Floating-window plumbing (_openWindow etc.) lives in
// windows.js; the editable Help/About copy lives in gametext.js.

// ─── MENUS ────────────────────────────────────────────────────

function closeDropdowns() {
  document.querySelectorAll('.dropdown, .dd-submenu').forEach(d => d.remove());
}

// The trigger element whose first-level submenu (.dd-sub1) is currently open. Lets _openSub1 tell a
// re-click of the SAME trigger (toggle closed) apart from a click on a DIFFERENT submenu trigger
// (switch to it in one click) instead of just closing whatever's open. A stale value is harmless:
// _openSub1 only reads it while a .dd-sub1 is actually in the DOM.
let _sub1Trigger = null;

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
    // Doesn't fit to the right: drop below the trigger instead
    sub.style.top = tr.bottom + 'px';
    sub.style.left = Math.max(4, Math.min(tr.left, window.innerWidth - sr.width - 4)) + 'px';
  }
  const finalTop = parseFloat(sub.style.top);
  if (finalTop + sr.height > window.innerHeight - 4)
    sub.style.top = Math.max(4, window.innerHeight - sr.height - 4) + 'px';
}

// Opens a first-level floating submenu (or inline on mobile). Re-clicking the SAME trigger toggles it
// closed; clicking a DIFFERENT submenu trigger switches to it in one click (keyed by trigger, like
// _openSub2's dataset.key), rather than just closing whatever was open.
function _openSub1(html, trigger) {
  if (_isMobile()) { _showInlineSub(trigger, html, 1); return; }
  if (document.querySelector('.dd-sub1') && _sub1Trigger === trigger) {
    document.querySelectorAll('.dd-submenu').forEach(d=>d.remove());
    _sub1Trigger = null;
    return;
  }
  document.querySelectorAll('.dd-submenu').forEach(d=>d.remove());
  const sub = document.createElement('div');
  sub.className = 'dropdown dd-submenu dd-sub1';
  sub.innerHTML = html;
  _sub1Trigger = trigger;
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

// ─── Declarative menu builder ────────────────────────────────────────────
// Each submenu function below builds a DESCRIPTOR (data: what rows exist and what they do) and hands
// it to `_renderDDItems` (turns the descriptor into HTML, the one place that knows the `.dd-item`
// markup) plus `_openSub1`/`_openSub2` to open it. This keeps the row markup and click wiring in one
// place instead of every submenu hand-building its own HTML.
//
// Descriptor = an array of row objects. Every row is one of:
//   { label, action }                    plain item: click runs `action` (a JS expression string,
//                                         same as today's onclick bodies) then closes all dropdowns.
//   { label, action, keepOpen:true }      like above but runs bare (no closeDropdowns() appended): 
//                                         for rows whose action already manages the dropdown itself
//                                         (navigates away, or is itself a dev toggle that re-renders).
//   { label, action, stopProp:true }      like above but appends `event.stopPropagation()` instead: 
//                                         for rows that intentionally leave the dropdown open in place
//                                         (e.g. a label that re-renders itself on click).
//   { label, opens }                     a ► row: click opens a nested submenu. `opens` is the literal
//                                         call string that opens it: e.g.
//                                         `showModTypeSubmenu('bj', this, 'devApplyMod')`: i.e. the
//                                         SAME "call the next submenu function with `this`" pattern
//                                         every submenu already used; the builder only adds the
//                                         trailing `►` glyph + `event.stopPropagation()`. Kept as a
//                                         call string rather than a function reference because these
//                                         run from an inline `onclick="…"` attribute string, not an
//                                         event listener: a real closure can't cross that boundary.
//   { label, checked, toggle, id? }       a checkbox row (prefs/dev toggles): `toggle` is the JS
//                                         expression the row's onclick AND the checkbox's onclick both
//                                         run (matches today's dual-onclick pattern so clicking the
//                                         label or the box behaves identically).
//   { label, active, action }             a highlighted list row (archive/future day): `active` adds
//                                         `dd-active`; clicking it behaves the same as a plain item.
//   { label, disabled:true, hint? }       inert row (locked option / disabled action), optional trailing hint.
//   { label, picked, pick }               a radio-style single-select row (cardback/deck/felt/theme
//                                         pickers): `pick` is the click action; the checkbox itself is
//                                         `pointer-events:none` display-only (unlike a `toggle` row's
//                                         checkbox, which is independently clickable) since picking is
//                                         "select this one," not "flip this one."
//   { sep:true }                          a `.dd-sep` divider.
//   { html }                              escape hatch for markup that isn't an item row at all (the
//                                         Game Setup button grid): emitted verbatim.
// Any row (except `sep`/`html`) may also carry `attrs` (extra raw HTML attributes, e.g.
// `data-picker="deck"` so setPick can re-find a trigger after a re-render) and `style` (inline CSS,
// e.g. the red "Reset All" row): both passed through verbatim onto the `.dd-item` div.
function _ddRow(row) {
  if (row.sep) return '<div class="dd-sep"></div>';
  if (row.html !== undefined) return row.html;
  const attrs = row.attrs ? ` ${row.attrs}` : '';
  const style = row.style ? ` style="${row.style}${row.toggle !== undefined ? ';gap:12px' : ''}"` : (row.toggle !== undefined ? ' style="gap:12px"' : '');
  if (row.disabled) {
    const hint = row.hint ? `<span style="font-size:.8rem;opacity:.55">${row.hint}</span>` : '';
    const wrap = row.hint ? `<span>${row.label}</span>${hint}` : row.label;
    const gapStyle = row.hint ? ' style="gap:12px"' : '';
    return `<div class="dd-item dd-disabled"${attrs}${gapStyle}>${wrap}</div>`;
  }
  if (row.toggle !== undefined) {
    return `<div class="dd-item"${attrs} onclick="${row.toggle};event.stopPropagation()"${style}>
      <span>${row.label}</span>
      <input type="checkbox" ${row.id ? `id="${row.id}" ` : ''}${row.checked ? 'checked' : ''} onclick="${row.toggle};event.stopPropagation()" style="${_DD_CB}">
    </div>`;
  }
  if (row.pick !== undefined) {
    const cbStyle = 'width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;pointer-events:none';
    return `<div class="dd-item"${attrs} onclick="${row.pick};event.stopPropagation()" style="gap:12px">
      <span>${row.label}</span>
      <input type="checkbox" ${row.picked ? 'checked' : ''} style="${cbStyle}">
    </div>`;
  }
  if (row.opens) {
    return `<div class="dd-item"${attrs} onclick="${row.opens};event.stopPropagation()"${style}>${row.label} <span class="dd-key">►</span></div>`;
  }
  const cls = `dd-item${row.active ? ' dd-active' : ''}${row.action === undefined ? ' dd-disabled' : ''}`;
  const click = row.action === undefined ? '' :
    row.stopProp ? `${row.action};event.stopPropagation()` :
    row.keepOpen  ? row.action :
    `${row.action};closeDropdowns()`;
  return `<div class="${cls}"${attrs} onclick="${click}"${style}>${row.label}</div>`;
}
// Renders a descriptor (array of rows, see _ddRow) into the `.dd-item` HTML block a submenu function
// hands to _openSub1/_openSub2. One render path so every submenu's markup/behavior stays identical no
// matter which function built the descriptor.
function _renderDDItems(rows) { return rows.map(_ddRow).join(''); }

// ─── Dev menu submenus (hybrid layout) ───────────────────────────────────
// Jump targets, game setup, and chip grants each live behind a ► trigger to keep
// the top-level Developer menu short. Mirror the showModSubmenu/showFutureSubmenu pattern.
const _DD_CB = 'width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0';

function showJumpSubmenu(trigger){
  const nm = g => (typeof GAME_META !== 'undefined' && GAME_META[g] && GAME_META[g].name) || g;
  const rows = [
    { label: `→ ${nm(GAME1)}`, action: `goTo(GAME1)` },
    { label: `→ ${nm(GAME2)}`, action: `goTo(GAME2)` },
    { label: `→ Roulette`, action: `goTo('roulette')` },
    { label: `${icon('target')} Spin Wheel (5 bets)`, action: `devSpin()`, keepOpen: true },
    { label: `→ The Ladder`, action: `resetLadderRun('dev-jump');goTo('ladder')` },
    { label: `${icon('ladder')} The Ladder (free entry)`, action: `devLadder()`, keepOpen: true },
    { label: `→ Results`, action: `goTo('results')` },
  ];
  _openSub1(_renderDDItems(rows), trigger);
}

function showGameSetupSubmenu(trigger){
  const slots = [
    { slot:1, current:GAME1, opts:GAME1_OPTIONS.filter(o=>o.value!==GAME2), label:'Game 1' },
    { slot:2, current:GAME2, opts:GAME2_OPTIONS.filter(o=>o.value!==GAME1), label:'Game 2' },
  ];
  // The game-picker rows are a button grid, not `.dd-item`s: kept as a raw `html` row (the
  // descriptor's escape hatch) since forcing them into the item/checkbox/opens shapes would just
  // reintroduce the special-casing this builder exists to remove.
  const cfg = slots.map(({slot,current,opts,label}) =>
    `<div class="dd-game-lbl">${label}</div><div class="dd-game-row">${opts.map(({value,label:l}) =>
      `<button class="dd-game-btn${current===value?' active':''}" onclick="devSetGame(${slot},'${value}')">${l}</button>`
    ).join('')}</div>`
  ).join('');
  const rows = [
    { html: cfg },
    { sep: true },
    // Dev mode is always sandboxed onto the practice deck (see DEV_OVERRIDE init in core.js), so there
    // is no live-seed toggle to expose here any more — a dev session can never deal the real day's hands.
    { label: 'All Unlocks', toggle: 'devToggleUnlocks()', checked: getPref('golden_back_unlocked'), id: 'dev-unlocks-cb' },
  ];
  _openSub1(_renderDDItems(rows), trigger);
}

function showChipsSubmenu(trigger){
  const rows = [
    { label: '+ 500 chips', action: `credit(500,'dev');render();updateChipDisplay()` },
    { label: '+ 10,000 chips', action: `credit(10000,'dev');render();updateChipDisplay()` },
  ];
  _openSub1(_renderDDItems(rows), trigger);
}

function showModSubmenu(trigger, action) {
  action = action || 'devApplyMod';
  const cats = [
    {key:'bj',       label:`${icon('cards')} Blackjack`},
    {key:'uth',      label:"♠ Hold'em"},
    {key:'cross',    label:`${icon('shuffle')} Cross-Game`},
    {key:'roulette', label:`${icon('target')} Roulette`},
    {key:'choice',   label:`${icon('dice-five')} Player's Choice`},
  ];
  const rows = cats.map(c => ({
    label: c.label,
    opens: `showModTypeSubmenu('${c.key}', this, '${action}')`,
  }));
  _openSub1(_renderDDItems(rows), trigger);
}

function showModTypeSubmenu(type, trigger, action) {
  action = action || 'devApplyMod';
  const mods = Object.entries(PRESET_MODIFIERS).filter(([, m]) => m.type === type);
  const rows = mods.map(([k, m]) => ({ label: m.title, action: `${action}('${k}')`, keepOpen: true }));
  _openSub2(type, _renderDDItems(rows), trigger);
}

function showModifierPopup(key) {
  closeDropdowns();
  const m = PRESET_MODIFIERS[key];
  if (!m) return;
  const content = `<div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${m.desc}</div>` +
    (m.devNote ? `<div class="divider" style="margin:14px 0 10px"></div><div style="font-size:1rem;color:var(--shadow);line-height:1.5"><b>Dev Note:</b> ${m.devNote}</div>` : '');
  _openInfoModal(`${icon('sparkle')} ${m.title}`, content, 'modifier');
}

// The gold modifier banner is a button: clicking it opens the help popup for TODAY'S live modifier.
// Read through getMod so it works for inline date-override mods AND the player's committed Player's
// Choice pick: neither of which has a PRESET_MODIFIERS key, so showModifierPopup(key) can't serve
// them. No devNote here (that's dev-only; this is the player-facing window). Shares the 'modifier'
// window key with the Help-menu popup, so only one is ever open.
function showActiveModInfo() {
  closeDropdowns();
  const title = getMod('title');
  if (!title) return;
  const desc = getMod('desc');
  _openInfoModal(`${icon('sparkle')} ${title}`,
    `<div style="font-size:1.15rem;color:var(--ink);line-height:1.55">${desc || ''}</div>`, 'modifier');
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
    const rows = [
      { label: '↺ Reset Run', action: 'devReset()' },
      { label: `${icon('chart-bar')} Player Stats`, action: `goTo('devstats')` },
      { label: `${icon('target')} Retention`, action: `goTo('retention')` },
      { label: `${icon('ruler')} Devices`, action: `goTo('devices')` },
      { label: `${icon('chart-bar')} Seed Checker`, action: `goTo('seedcheck')` },
      { sep: true },
      { label: 'Jump to', opens: 'showJumpSubmenu(this)' },
      { label: 'Game Setup', opens: 'showGameSetupSubmenu(this)' },
      { label: 'Give Chips', opens: 'showChipsSubmenu(this)' },
      { sep: true },
      // ids kept on these two ► triggers in case a future dev flow wants to open one programmatically by id.
      { label: 'Preview Future Day', opens: 'showFutureSubmenu(this)', attrs: 'id="dd-future-trigger"' },
      { label: 'Force Modifier', opens: 'showModSubmenu(this)', attrs: 'id="dd-mod-trigger"' },
      { sep: true },
      { label: `${icon('lightbulb')} Test Tutorial`, toggle: 'devToggleTestTutorial()', checked: _testTutorial(), id: 'dev-test-tutorial-cb' },
      { label: `${icon('ruler')} Layout Debug`, toggle: 'devToggleLayoutDebug()', checked: document.body.classList.contains('layout-debug'), id: 'dev-layout-debug-cb' },
    ];
    el.innerHTML = _renderDDItems(rows);
  } else if (which === 'file') {
    const canShare = S.screen === 'results';
    const rows = [
      ..._backlogSeed ? [{ label: `${icon('target')} Return to Today (#${getDayNum()})`, action: 'exitBacklog()', keepOpen: true }, { sep: true }] : [],
      { label: `${icon('eye')} Gambdle #${S.day}${_backlogSeed?(_backlogSeed>getDailySeed()?' · Preview':' · Archive'):''}`, opens: 'showBacklogSubmenu(this)' },
      { sep: true },
      canShare ? { label: `${icon('clipboard-text')} Copy &amp; Share`, action: 'doShare()' } : { label: `${icon('clipboard-text')} Copy &amp; Share`, disabled: true },
      { sep: true },
      { label: `${icon('speaker-simple-x')} Mute Audio`, toggle: "togglePref('mute')", checked: getPref('mute'), id: 'file-mute-cb' },
      { sep: true },
      { label: `${icon('envelope')} Send Feedback`, action: 'showFeedbackDialog()' },
      { sep: true },
      { label: `${icon('ruler')} Preferences`, opens: 'showPrefsSubmenu(this)' },
      { sep: true },
      { label: `${icon('user')} Player Profile`, action: 'showProfile()', keepOpen: true },
      { label: `${icon('sparkle')} About Gambdle`, action: 'showAbout()', keepOpen: true },
    ];
    el.innerHTML = _renderDDItems(rows);
  } else {
    const rows = [
      { label: `${icon('magnifying-glass')} How to Play`, action: "showInfo('overview')" },
      { sep: true },
      { label: `${icon('cards')} Blackjack`, action: "showInfo('bj')" },
      { label: `${icon('cowboy-hat')} Ultimate Hold'em`, action: "showInfo('uth')" },
      { label: `${icon('target')} Roulette`, action: "showInfo('roulette')" },
      { sep: true },
      { label: `${icon('cards')} Poker Hands`, action: "showInfo('hands')" },
      { sep: true },
      { label: `${icon('sparkle')} Daily Modifiers`, opens: "showModSubmenu(this,'showModifierPopup')" },
      { sep: true },
      { label: `${icon('lightbulb')} Tips: ${getPref('tutorial_off') ? 'Off' : 'On'}`, action: 'toggleTutorial()', stopProp: true },
    ];
    el.innerHTML = _renderDDItems(rows);
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
  const rows = [];
  for (let n = todayNum - 1; n >= 1; n--) {
    const seed = _seedForDayNum(n);
    const score = history[seed];
    const scoreStr = score !== undefined ? `<span class="dd-key">${fmt(score)}</span>` : '';
    rows.push({ label: `Day #${n} ${scoreStr}`, active: _backlogSeed === seed, action: `enterBacklog(${seed})`, stopProp: true });
  }
  if (!rows.length) rows.push({ label: 'No past days yet', disabled: true });
  _openSub1(`<div class="dd-archive-list">${_renderDDItems(rows)}</div>`, trigger);
}

function showFutureSubmenu(trigger) {
  const todayNum = getDayNum();
  const rows = [];
  for (let n = todayNum + 1; n <= todayNum + 7; n++) {
    const seed = _seedForDayNum(n);
    const cycled = CYCLE_ORDER[(n - 1) % CYCLE_ORDER.length];
    const modRef = DAILY_MODIFIERS[seed] || cycled;
    const mod = typeof modRef === 'string' ? PRESET_MODIFIERS[modRef] : modRef;
    const modLabel = mod ? `<span class="dd-key">${mod.title}</span>` : '';
    const seedNote = DAILY_SEED_OVERRIDES[seed] ? ' 🔀' : '';
    rows.push({ label: `Day #${n}${seedNote} ${modLabel}`, active: _backlogSeed === seed, action: `enterBacklog(${seed})`, stopProp: true });
  }
  _openSub1(`<div class="dd-archive-list">${_renderDDItems(rows)}</div>`, trigger);
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

// _prefItem is its own function (rather than inlined into showPrefsSubmenu's row list) because it's
// the one row shape simple enough to want a direct call (key/id/label, no picker/hint variants). It's
// a thin wrapper over the same `_ddRow` a descriptor uses, so its markup and behavior match any other
// toggle row.
function _prefItem(key,id,label){
  return _ddRow({ label, toggle: `togglePref('${key}')`, checked: !!getPref(key), id });
}
function showPrefsSubmenu(trigger){
  const pickers = [
    { key:'deck',     label:'Deck' },
    { key:'cardback', label:'Card Back' },
    { key:'felt',     label:'Felt' },
    { key:'theme',    label:'Theme' },
  ];
  const rows = [
    { html: _prefItem('four_color','pref-4color','Four Color Deck') },
    ...pickers.map(p => ({ label: p.label, opens: `_showPickerSub('${p.key}',this)`, attrs: `data-picker="${p.key}"` })),
    { sep: true },
    { label: '↺ Reset All', action: 'resetAllPrefs()', stopProp: true, style: 'color:var(--red)' },
  ];
  _openSub1(_renderDDItems(rows), trigger);
}
function resetAllPrefs(){
  const p=getPrefs();
  ['four_color','mute','cardback','deck','felt','theme'].forEach(k=>delete p[k]);
  _ls.setItem(PREFS_KEY,JSON.stringify(p));
  applyPrefs();
  closeDropdowns();
}
const PICKER_ITEMS = {
  deck:     { pref:'deck',     options:[{val:'default',label:'Default'},{val:'emoji',label:'Emoji',lock:'deck_emoji_unlocked',hint:`${icon('lock')} 3500+`}]},
  cardback: { pref:'cardback', options:[{val:'default',label:'Default'},{val:'orange',label:'Orange',lock:'orange_back_unlocked',hint:`${icon('lock')} 1500+`},{val:'whale',label:'Whale 🐋',lock:'whale_back_unlocked',hint:`${icon('lock')} 5000+`},{val:'gold',label:'Golden',lock:'golden_back_unlocked',hint:`${icon('lock')} 10000+`}]},
  felt:     { pref:'felt',     options:[{val:'default',label:'Green'},{val:'maroon',label:'Maroon',lock:'maroon_felt_unlocked',hint:`${icon('lock')} 2500+`}]},
  theme:    { pref:'theme',    options:[{val:'default',label:'Luna Blue'},{val:'olive',label:'Olive Green'},{val:'silver',label:'Silver'},{val:'green',label:'Luna Green',lock:'green_theme_unlocked',hint:`${icon('lock')} 2000+`}]},
};
function _showPickerSub(pickerKey,trigger){
  const {pref,options}=PICKER_ITEMS[pickerKey];
  const cur=getPref(pref)||'default';
  const rows = options.map(o => (o.lock && !getPref(o.lock))
    ? { label: o.label, disabled: true, hint: o.hint }
    : { label: o.label, pick: `setPick('${pickerKey}','${o.val}')`, picked: cur === o.val }
  );
  _openSub2(pickerKey, _renderDDItems(rows), trigger);
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
    const el=document.getElementById('sb-mute-icon');
    if(el){el.textContent=getPref('mute')?'🔇':'🔊';el.title=getPref('mute')?'Unmute':'Mute';}
  }
}

// ── Feedback dialog ───────────────────────────────────────
function showFeedbackDialog() {
  // Re-uses the modal builder (windows.js): a non-blocking float on desktop, a blocking modal on
  // mobile. `bare: true` because this dialog owns its own content div (padding:14px, not the
  // standard .info-content 18px). The title-bar × still calls the shared closeWindow(this); Cancel
  // uses the dedicated closeFeedbackDialog() (same effect, kept for that button's own name). The
  // char counter updates inline (no addEventListener) so re-opening an existing window never stacks
  // duplicate listeners. The ids stay stable since only one feedback window can exist.
  openModal({
    key: 'feedback', title: 'Send Feedback', icon: '✉', bare: true, boxStyle: 'max-width:420px',
    content: `
      <div style="padding:14px">
        <div style="font-size:1rem;margin-bottom:8px;color:var(--shadow)">Send feedback to the developer</div>
        <textarea id="feedback-txt" class="feedback-textarea" maxlength="500" placeholder="Type here…"
          oninput="document.getElementById('feedback-char').textContent = this.value.length + ' / 500'"></textarea>
        <div id="feedback-char" style="font-size:0.8rem;color:var(--shadow);text-align:right;margin-top:2px">0 / 500</div>
        <div class="act-btns" style="margin-top:10px">
          <button class="act-btn" onclick="closeFeedbackDialog()">Cancel</button>
          <button class="act-btn primary" id="feedback-send-btn" onclick="submitFeedback()">Send</button>
        </div>
      </div>`,
  });
  setTimeout(() => document.getElementById('feedback-txt')?.focus(), 50);
}

function closeFeedbackDialog() {
  document.getElementById('win-feedback')?.remove();
}

// Builds the Discord-bound feedback payload: the player's note plus a compact context block so a
// report can be triaged without a back-and-forth: version (which release), where they are in the
// run (screen + phase), the active daily modifier (the usual suspect for a bug), game progress, and
// device/viewport/browser (for layout reports). Every field is best-effort: a missing piece of game
// state must never stop the feedback from sending, so the whole block is wrapped defensively.
function _feedbackBody(msg) {
  let meta = '';
  try {
    const g = GAMES[S.screen];
    const phase = g && g.phaseKey ? S[g.phaseKey] : null;
    // getMod('title') resolves the active preset (incl. a committed Player's Choice); a still-open
    // Player's Choice has no single title yet, so flag it as unpicked.
    const modLabel = pendingPlayersChoice() ? "Player's Choice (unpicked)" : (getMod('title') || 'none');
    const w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1;
    const form = w <= 480 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop';
    const lines = [
      `**Where** screen \`${S.screen}\`${phase ? ` · phase \`${phase}\`` : ''} · Day #${S.day}`,
      `**Game** ${fmt(S.chips)} chips · streak ${computeStreak().current} · mod: ${modLabel}`,
      `**Device** ${form} ${w}×${h} @${dpr}x · \`${getDeviceId()}\``,
      `\`${(navigator.userAgent || '').slice(0, 180)}\``,
    ];
    meta = '\n' + lines.join('\n');
  } catch (_e) { // context is a nice-to-have; never block a send
  }
  return `📬 **Gambdle Feedback** · ${GAME_VERSION}${meta}\n>>> ${msg}`;
}

async function submitFeedback() {
  const ta = document.getElementById('feedback-txt');
  const msg = ta?.value.trim();
  if (!msg) return;
  const btn = document.getElementById('feedback-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await sbFetch('/functions/v1/rapid-service', {
      method: 'POST',
      body: { content: _feedbackBody(msg) }
    });
    if (!res || !res.ok) throw new Error();
    closeFeedbackDialog();
    toast('Feedback sent! Thanks 🎲');
  } catch {
    toast('Failed to send. Try again?');
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
  }
}
