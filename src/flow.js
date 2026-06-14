// ─── GAME FLOW ──────────────────────────────────────────────────────────────
// The engine every screen plugs into: render() (full #app re-render + screen
// dispatch), the status bar, navigation (goTo/advanceTo, bust → borrow routing),
// the shared next-hand / result-panel helpers, and start/borrow tracking.

// ─── APP SHELL ───────────────────────────────────────────────────────────

let _noAnim=false;

// ─── STATUS BAR ──────────────────────────────────────────────────────────
// Hint copy (STATUS_HINT) lives in src/gametext.js with the rest of the editable text.

function statusBar(){
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h>=12 ? 'PM' : 'AM';
  const hh = (h%12) || 12;
  const tm = `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  const _isFuture = _backlogSeed && _backlogSeed > getDailySeed();
  const _modeLabel = _backlogSeed ? (_isFuture ? 'Preview' : 'Archive') : 'Gambdle';
  let hint = STATUS_HINT[S.screen] || 'Ready.';
  if (_backlogSeed && S.screen === 'results') hint = `<span class="sb-prefix">${_modeLabel} · </span>Day #${S.day} complete`;
  return `<div class="status-bar">
    <span>${DEV_OVERRIDE ? `${GAME_VERSION} · ` : ''}${hint}</span>
    <span><span id="sb-mute-icon" onclick="togglePref('mute');event.stopPropagation()" style="cursor:pointer;font-size:0.85em" title="${getPref('mute')?'Unmute':'Mute'}">${getPref('mute')?'🔇':'🔊'}</span>${_modeLabel} #${S.day}  ·  ${tm}</span>
  </div>`;
}

// ─── RENDER ──────────────────────────────────────────────────────────────

// Full re-render — replaces all of #app. Use surgical DOM updates mid-hand to avoid flash.
function render(){
  const scr={intro:screenIntro,choice:screenChoice,bj:screenBJ,uth:screenUTH,poker:screenPoker,roulette:screenRoulette,ladder:screenLadder,borrow:screenBorrow,results:screenResults,devstats:screenDevStats};
  const inner = (scr[S.screen]||screenIntro)();
  document.getElementById('app').innerHTML=`<div class="app">
    <div class="window">
      ${inner}
      ${statusBar()}
    </div>
  </div>`;
  const _panel = document.querySelector('.panel');
  const _mod = modBannerHTML(S.screen === 'results');
  // Inject the modifier banner at the top of the panel after the screen HTML is in place.
  if (_panel && _mod) {
    _panel.insertAdjacentHTML('afterbegin', _mod);
    if (window.innerWidth <= 480) {
      const r = _panel.querySelector('.mod-banner-r');
      if (r) {
        r.style.whiteSpace = 'nowrap';
        let fs = parseFloat(getComputedStyle(r).fontSize);
        while (r.scrollWidth > r.clientWidth && fs > 11) { fs -= 0.5; r.style.fontSize = fs + 'px'; }
      }
    } else {
      // Desktop: if the description would wrap, shrink the title to free horizontal room.
      // Falls back to shrinking the description if title can't go smaller. Keeps the banner
      // at single-line height so every screen has a predictable vertical budget.
      const r = _panel.querySelector('.mod-banner-r');
      const t = _panel.querySelector('.mod-banner-title');
      if (r && t) {
        r.style.whiteSpace = 'nowrap';
        let tfs = parseFloat(getComputedStyle(t).fontSize);
        while (r.scrollWidth > r.clientWidth && tfs > 22) {
          tfs -= 1; t.style.fontSize = tfs + 'px';
        }
        let rfs = parseFloat(getComputedStyle(r).fontSize);
        while (r.scrollWidth > r.clientWidth && rfs > 15) {
          rfs -= 0.5; r.style.fontSize = rfs + 'px';
        }
      }
    }
  }
  _reapplyDragPos();
  _updateBalloonPosition();
  if(_noAnim){
    _noAnim=false;
    document.querySelectorAll('.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
  }
  saveState();
  if (S.screen === 'results') { submitAndFetchLeaderboard(); fetchScoreDistribution(); }
  if (S.screen === 'devstats') fetchDevStats();
  _runTutorial();
  _drawLayoutDebug();
}

function updateChipDisplay() {
  const el = document.getElementById('chip-badge');
  if (el) {
    el.innerHTML = `${icon('chip')} ${fmt(S.chips)}`;
  }
}

// ─── NAVIGATION & ACTIONS ────────────────────────────────────────────────

function goTo(s){S.screen=s;render();}
// Shared skip logic for all_in_or_skip: push a skip entry, increment the hand counter,
// advance to the next screen if done, otherwise reset and re-render.
function _skipHand(arr, entry, counterKey, nextScreen, resetFn) {
  arr.push(entry);
  S[counterKey]++;
  if (S[counterKey] >= 3) { advanceTo(nextScreen); return; }
  resetFn();
  render();
}

// Shared "next hand" flow: sound → reset → re-render (or go to results/borrow if busted).
function _nextHand(resetFn) {
  sndAdvance();
  resetFn();
  if (isChipBusted()) {
    if (_canShowBorrow()) {
      S.borrowReturnScreen = _borrowReturnScreen();
      S.screen = 'borrow';
    } else {
      S.screen = 'results';
    }
  }
  render();
}

// Produces the standard result panel used by BJ, UTH-fold, etc.
// detailHTML is injected between the delta line and the running total.
function _resultPanel(dotsHTML, delta, headlineHTML, detailHTML, btnAction, btnText, panelCls='') {
  return `<div class="panel ${panelCls}" style="text-align:center">
    ${dotsHTML}
    <div class="divider"></div>
    <div class="result-hl" style="color:${col(delta)}">${headlineHTML}</div>
    <div class="result-sub" style="color:${col(delta)}">${sign(delta)} chips</div>
    ${detailHTML}
    ${runningTotalRow()}
    ${nextBtn(btnAction, btnText)}
  </div>`;
}

// The advance button (label + onclick) shown on a card game's result screen — shared by Blackjack,
// Hold'em and Poker, which all phrase it identically. Busted → go to results; the last hand of 3 →
// the next game (worded "Final Round: Roulette" when roulette is the finale, else "Round 2: <name>");
// any earlier hand → the next hand. `nextScreen` is NEXT_SCREEN[game]; `nextHandCall` runs the
// game's own next-hand function (e.g. 'bjNext()').
function resultAdvanceBtn(isLast, nextScreen, nextHandCall) {
  if (isChipBusted()) return { text: `Game Over ${icon('skull',{fill:true})}`, action: "advanceTo('results')" };
  if (!isLast)        return { text: 'Next Hand →',  action: nextHandCall };
  const text = nextScreen === 'roulette' ? 'Final Round: Roulette →' : `Round 2: ${GAME_META[nextScreen].name} →`;
  return { text, action: `advanceTo('${nextScreen}')` };
}

// Plays a transition sound scaled to how well the player is doing.
function sndAdvance(){if(S.chips>=2000)sndBigWin();else if(S.chips>=700)playMp3('assets/sounds/mediumbet.mp3');else playMp3('assets/sounds/smallbet.mp3');}
// Navigates between games; redirects to results early if the player is busted (<10 chips).
// If the borrow option is still available when a bust is detected, shows the borrow screen first.
function advanceTo(s){
  // The Ladder mod day: the run to 'results' detours through the free bonus round once.
  // Gated on the borrow window being closed so a busted player's borrow flow (and its
  // return-to-game routing) happens first; if they decline, the detour fires next time.
  if(s==='results'&&getMod('ladder_free')&&!S.ladResult&&!_canShowBorrow())s='ladder';
  if(isChipBusted()&&_canShowBorrow()){
    if(s!=='results'){
      // Mid-game transition bust (e.g., would have gone to UTH/Roulette but broke).
      S.borrowReturnScreen=s;
    }else{
      // Explicit "Game Over" bust from a result phase — determine where to return if they borrow.
      const ret=_borrowReturnScreen();
      // Reset the current game to bet phase so returning lands on a fresh hand.
      if(ret==='bj') resetBJHand();
      else if(ret==='uth') resetUTHHand();
      else if(ret==='poker'){S.pkBet=0;S.pkPhase='bet';}
      S.borrowReturnScreen=ret;
    }
    sndAdvance();goTo('borrow');return;
  }
  // Busted players are normally forced to results, but the free ladder entry is house
  // money — a busted player still gets (and may need) the bonus round.
  if(s!=='results'&&!(s==='ladder'&&getMod('ladder_free'))&&isChipBusted())s='results';
  if(s==='results'&&!DEV_OVERRIDE){
    const _calc=recalcChips();
    // Fall back to the current saved value if the recalculation is non-finite (corrupted history).
    // Skipped in dev mode so dev-menu chip bonuses aren't recomputed away on the results screen.
    // Clamp at 0: balances never go negative (debit() floors at 0), so a sub-zero recalc is a corrupt save.
    S.chips=Number.isFinite(_calc)?Math.max(0,_calc):S.chips;
  }
  sndAdvance();goTo(s);
}

// Returns the screen to navigate to after a borrow, based on where the player is mid-run.
function _borrowReturnScreen(){
  if(S.screen==='bj')    return S.bjHand<3  ?'bj'    :NEXT_SCREEN['bj'];
  if(S.screen==='uth')   return S.uthHand<3 ?'uth'   :NEXT_SCREEN['uth'];
  if(S.screen==='poker') return S.pkHand<3  ?'poker' :NEXT_SCREEN['poker'];
  return S.screen;
}
function startGame(){
  sndChip('allin');
  // Player's Choice day: divert to the picker before the first game. The pick screen commits
  // S.pcPick, then routes into GAME1 (see pickModifier). On a normal day, go straight to Blackjack.
  if(pendingPlayersChoice()){S.screen='choice';render();_submitStart();return;}
  S.screen=GAME1;S.bjPhase='bet';render();_submitStart();
}

// Fire-and-forget: records that this device started today's game.
// Skipped in dev/test/backlog modes; deduplicated per device per day via localStorage.
// Requires a `starts` table in Supabase — see .claude/VERSIONS.md for setup SQL.
async function _submitStart() {
  const seed = getActiveSeed();
  const key = `gambdle_started_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/starts`, {
      method: 'POST',
      headers: { ...SUPABASE_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ seed, fingerprint: getDeviceId() }),
    });
    if (res.ok) _ls.setItem(key, '1');
  } catch(e) {}
}

// Fire-and-forget: records that this device took the borrow loan today (only when the chips are
// actually accepted via borrowChips — declining doesn't fire this). Skipped in dev/test/backlog
// modes; deduplicated per device per day via localStorage (borrow is once-per-day anyway).
// Requires a `borrows` table in Supabase — see .claude/VERSIONS.md for setup SQL.
async function _submitBorrow() {
  const seed = getActiveSeed();
  const key = `gambdle_borrowed_${seed}`;
  if (_ls.getItem(key) || DEV_OVERRIDE || _testActive() || _backlogSeed) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/borrows`, {
      method: 'POST',
      headers: { ...SUPABASE_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ seed, fingerprint: getDeviceId() }),
    });
    if (res.ok) _ls.setItem(key, '1');
  } catch(e) {}
}
