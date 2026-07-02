// ─── AUDIO ──────────────────────────────────────────────────────────────────
// All sound playback: defensive HTMLAudioElement helpers (a throwing/blocked
// play() must never strand the game mid-deal), the named snd* effects, and the
// Web Audio roulette-ball synth. Everything honors the 'mute' pref.

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
// Plays a chip-bet sound: 'allin' gets its own dramatic effect; smaller bets use a distinct sound from medium+ bets.
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
// Lazy-init the shared AudioContext (one per page life). iOS and some browsers require a user
// gesture before creating or resuming AudioContext; resume() here is safe to call repeatedly.
function getAC(){if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();return _ac;}

