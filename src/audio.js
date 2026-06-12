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
