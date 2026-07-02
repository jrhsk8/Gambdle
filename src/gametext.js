// 
// GAMBDLE GAME TEXT. Edit the text in this file freely.
// 
// All the editable player-facing copy lives in this one file:
//   TUTORIAL_TIPS     one-time XP-balloon tips (first bet, first showdown, …)
//   WHATS_NEW         the one-off announcement balloon for returning players
//   ABOUT_GAMBDLE     File → About Gambdle subtitle/body
//   INFO_SECTIONS     Help-menu windows (How to Play / Blackjack / Hold'em / …)
//   POPUP_MESSAGES    the (currently disabled) first-visit welcome popup
//   STATUS_HINT       the status-bar hint line shown per screen
//   buildShareText    the "Copy & Share" text template on the results screen
// 
// Bodies accept simple HTML such as <b>, <br>, or <span>. Text that is part of a
// game mechanic (modifier titles/descriptions, button labels, result headlines)
// stays with its feature: modifiers in src/modifiers.js, screens in the game files.
// 
// ─── TUTORIAL TIPS ─────────────────────────────────────────────────────────
// Small popups (the XP balloon) that show the first time a player runs into each
// situation, and then never again. They stay light on purpose: they only point
// out the things people tend to trip over (mostly the ways this Ultimate Texas
// Hold'em is not the same as regular Hold'em), rather than teaching every game
// from scratch. Players can switch them off from the Help menu under "Tips".
// 
// EDITING: change any title or body string below. To drop a tip, delete its
// entry here and remove its id from TUTORIAL_ORDER. To add one, add an entry,
// add its id to TUTORIAL_ORDER, and declare its trigger as a row in the
// TIP_ELIGIBILITY registry (src/windows.js) · {screen, phase?, gate?, tip}.
// 
// WHEN EACH TIP FIRES (declared in TIP_ELIGIBILITY, keyed by these ids):
//   modifier     the intro screen (points at the daily rule banner)
//   bj_hands     first Blackjack bet screen
//   uth_bet      first Hold'em bet screen
//   uth_raise    first Hold'em decision (preflop)
//   uth_turn     Hold'em river decision (all 5 cards out: raise 1x or fold, no check)
//   uth_qualify  first Hold'em showdown

const TUTORIAL_TIPS = {
  modifier: {
    title: "Welcome to Gambdle!",
    body: "Gambdle consists of three games each day. Everyone gets the <b>same shuffles</b> and a <b>random roulette spin.</b> Every day has a <b>daily modifier</b> that shakes up gameplay."
  },
  bj_hands: {
    title: "3 Hands of Blackjack",
    body: "Blackjack runs as <b>three separate hands</b>, each with its own bet. Try not to lose all your chips, you'll need them for the next two games!",
  },
  uth_bet: {
    title: "Ultimate Texas Hold'em",
    body: "This is Ultimate Hold'em, a game between just you and the dealer. Your bet consists of an <b>Ante</b> and a <b>Blind</b>, split evenly. The blind pays for big hands and the ante pays for beating the dealer.",
  },
  uth_raise: {
    title: "Raise or Fold",
    body: "In Ultimate Hold'em, <b>to stay in the hand, you must raise the bet</b> (at some point). You can only raise once, and the earlier you are in the hand, the more you can raise.",
  },
  uth_turn: {
    title: "Why Can't I Check?",
    body: "To stay in a hand of Ultimate Hold'em, you must raise at some point. If you haven't raised yet, you must do so now to stay in. Once you've raised, it's time to reveal."
  },
  uth_qualify: {
    title: "Dealer Has to Qualify",
    body: "The dealer needs at least a <b>pair</b> to qualify. If they come up short you get your Ante back, even when your hand beats theirs. The <b>Blind</b> pays a bonus when you win with a <b>straight or better</b>.",
  },
  ladder: {
    title: "The Ladder",
    body: "Call the next card <b>higher or lower</b>. Each correct call climbs a rung, multiplying your bet. Cash out any time, but a wrong call or a <b>tie loses the pot</b>.",
  },
};

// Order the tips are listed and prioritised in.
const TUTORIAL_ORDER = ['modifier', 'bj_hands', 'uth_bet', 'uth_raise', 'uth_turn', 'uth_qualify', 'ladder'];

// Added once, to whichever tip a player sees first, so they know where the off switch is.
const TUTORIAL_OFF_NOTE =
  "<br><br><span style=\"opacity:.7;font-size:.92em\">You'll see each of these just once. You can turn them off in the Help menu.</span>";

// ─── "WHAT'S NEW" ANNOUNCEMENT ─────────────────────────────────────────────
// A one-off balloon shown on the intro screen to RETURNING players (anyone who has finished at least
// one run) whose Tips are on, to flag changes to the game.
//   • Edit `title` / `body` freely · `body` accepts simple HTML (<b>, <br>, …).
//   • Bump `id` whenever you ship an update you want to announce; each id shows at most once per
//     player, so changing it makes the note re-appear for everyone.
//   • Set `enabled: false` to turn it off entirely.
// Brand-new players are silently opted out of the *current* note (they only ever see FUTURE ones);
// their normal new-player tutorial tips above are unaffected. Honors the Help-menu "Tips" off switch.
const WHATS_NEW = {
  enabled: true,
  id: 'v1.79',
  title: "Donate to Gambdle!",
  body: "By player request, a donate button has been added to the menu bar. Thanks for playing!",
};

// ─── ABOUT GAMBDLE ─────────────────────────────────────────────────────────
// Shown by File → "About Gambdle". The ♠ GAMBDLE logo at the top is fixed; edit the `subtitle`
// (the small line under the logo, like the front page) and the `body` below it freely. `body`
// accepts simple HTML: <b>, <br>, <a href="…">, <p>, etc.
const ABOUT_GAMBDLE = {
  subtitle: "By jrhsk8",
  body: `https://github.com/jrhsk8/Gambdle<br>
  Discord: jrhsk8<br>
  <br>
  `,
};

// ─── DONATE ────────────────────────────────────────────────────────────────
// Shown by the "Donate" menu-bar tab (showDonate, windows.js). `url` is the Ko-fi page; `heading`
// is the line under the icon; `body` accepts simple HTML and `btn` is the button label. Edit freely
// (no em dashes · see COPY-STYLE.md). The button + raw-URL fallback are built around these.
const DONATE = {
  url: "https://ko-fi.com/jrhsk8",
  heading: "Help support Gambdle!",
  body: `Gambdle is free and ad-free. The casino has generously donated over 10 million lifetime chips to players so far.
    Your real life Ko-fi donations will be used to cover this devastating loss. Thank you!`,
  btn: "Donate on Ko-fi",
};

// ─── HELP-MENU WINDOWS ─────────────────────────────────────────────────────
// Text shown by the Help menu (How to Play / Blackjack / Hold'em / Roulette / Poker Hands).
// Edit any title/body freely; bodies accept simple HTML. suitSpans renders ♠♥♦♣ as coloured
// glyphs for the Poker Hands table.
const _SUIT_CLS_MAP={'♠':'sym-s','♥':'sym-h','♦':'sym-d','♣':'sym-c'};
function suitSpans(s){return s.replace(/[♠♥♦♣]/g,m=>`<span class="${_SUIT_CLS_MAP[m]}">${m}︎</span>`);}

// ─── INFO SECTIONS ────────────────────────────────────────────
const INFO_SECTIONS = {
  overview: {
    title: 'How to Play',
    body: `<div><b>♠ Gambdle</b> is a daily casino game. Everyone gets the exact same shuffles. You start with <b>1,000 chips</b>, play two card games, then finish with one random, unseeded spin of the roulette wheel. Your final chip count is your score.</div>
      <div>A new game drops every day at midnight <b>Arizona time</b> (MST, no daylight saving). Compare your score on the leaderboard.</div>
      <div><b>${icon('sparkle')} Daily Modifier:</b> Every day has a special rule that changes the game for everyone, like boosted payouts or extra betting options. Look for the gold banner at the top of each game screen.</div>`
  },
  bj: {
    title: `${icon('cards')} Blackjack`,
    body: `<div>You and the dealer each get two cards. Try to get as close to 21 as you can without going over. The dealer plays after you.</div>
      <div>Card values: number cards are face value, face cards (J/Q/K) are worth 10, and Aces are worth 1 or 11, whichever helps you more.</div>
      <div><b>Hit:</b> Take another card. 
      <div><b>Stand:</b> Keep what you have and let the dealer go.</div>
      <div><b>Double Down:</b> Double your bet, get exactly one more card, then stand automatically.</div>
      <div><b>Split:</b> If your first two cards are the same rank, you can split them into two separate hands, each with its own bet.</div>
      <div>The dealer must keep drawing until they hit 17 or higher. If the dealer goes over 21, you win. If you go over 21, you bust and lose your bet.</div>
      <div><b>Blackjack:</b> An Ace plus any 10-value card on your opening two cards. Pays <b>3:2</b> automatically.</div>`
  },
  uth: {
    title: "♠ Ultimate Texas Hold'em",
    body: `<div>A poker game, similar to classic Texas Hold'em, but <b>adapted for solo play</b> against the dealer.
      <div>Start by placing equal <b>Ante</b> and <b>Blind</b> bets (the game splits your bet in two for you).</div>
      <div>The <b>ante</b> pays out if you beat the dealer. The <b>blind</b> pays if you win with a high ranking hand (straight or better).</div>
      <div>You and the dealer each get 2 private cards, then 5 shared cards are revealed one group at a time. Best 5-card hand out of 7 wins.</div>
      <div><b>Preflop:</b> Your two cards are revealed. Raise <b>4×</b> (strong hand), raise <b>3×</b> (decent hand), or <b>Check</b> to wait and see more cards.</div>
      <div><b>Flop:</b> 3 shared cards are revealed. <b>Raise 2×</b> if you haven't raised yet, or <b>Check</b> a second time. You won't be able to check again.</div>
      <div><b>Turn &amp; River:</b> The last 2 shared cards appear. You must either raise <b>1×</b> to stay in, or <b>Fold</b> and forfeit your bets.</div>
      <div>If your hand beats the dealer's, you win. The dealer needs at least a <b>Pair</b> to "qualify". If they don't, your Ante bet is returned. You play <b>3 hands</b>.</div>`
  },
  roulette: {
    title: `${icon('target')} Roulette`,
    body: `<div>A ball is dropped onto a spinning wheel numbered 0–36. Pick where you think it'll land, set your bet, and spin. <b>One spin</b> ends the run.</div>
      <div><b>Numbers 0–36:</b> An exact match pays <b>35:1</b>. Daily modifiers that increase odds of specific numbers can make this very profitable!</div>
      <div><b>Rows (2:1 tiles):</b> Bet on one of the three rows on the board. Does not include 0.</div>
      <div><b>Dozens:</b> 1–12, 13–24, or 25–36. Pays <b>2:1</b>.</div>
      <div><b>Outside bets:</b> Red/Black, Odd/Even, or Low/High (1–18 / 19–36). Pays <b>1:1</b>. Safest option.</div>
      <div>On most days you can place up to 5 bets before spinning. Daily modifiers may alter this.</div>`
  },
  hands: {
    title: `${icon('cards')} Poker Hands`,
    body: (()=>{
      const row=(name,cards,desc)=>
        `<span style="color:var(--ink);font-size:1.3rem">${name}</span><span style="color:var(--ink);font-size:1.2rem;text-align:right">${suitSpans(cards)}</span><span style="font-size:1.05rem;grid-column:1/-1;margin-bottom:4px;color:var(--shadow)">${desc}</span>`;
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:4px 16px;font-family:var(--btn-f)">
        ${row('Royal Flush',   'A♠ K♠ Q♠ J♠ 10♠', 'Ace through Ten, all same suit. Unbeatable.')}
        ${row('Straight Flush','9♦ 8♦ 7♦ 6♦ 5♦',  'Five in a row, all same suit.')}
        ${row('Four of a Kind','K♠ K♥ K♦ K♣',      'All four cards of the same rank.')}
        ${row('Full House',    'Q♠ Q♥ Q♦ 9♣ 9♥',   'Three of a kind plus a pair.')}
        ${row('Flush',         'A♣ J♣ 8♣ 5♣ 2♣',   'Any five cards of the same suit.')}
        ${row('Straight',      '10♠ 9♥ 8♦ 7♣ 6♠',  'Five in a row, any suits. Ace can be low (A-2-3-4-5).')}
        ${row('Three of a Kind','7♠ 7♥ 7♦',         'Three cards of the same rank.')}
        ${row('Two Pair',      'J♠ J♦ 4♥ 4♣',       'Two different pairs.')}
        ${row('One Pair',      'A♠ A♥',              'Two cards of the same rank.')}
        ${row('High Card',     'K♠ J♥ 9♦ 6♣ 2♠',   'No matching cards. Highest card wins.')}
      </div>`;
    })()
  }
};

// ─── WELCOME POPUP ─────────────────────────────────────────────────────────
// First-visit XP balloon (shown by showPopup in src/windows.js). Toggle POPUP_ENABLED
// to enable it for all first-time players; messages are keyed by ID.
const POPUP_ENABLED = false;

const POPUP_MESSAGES = {
  welcome: {
    title: 'Welcome to Gambdle!',
    body: "Everyone plays the same hands today. Start with 1,000 chips and play Blackjack → Hold'em → Roulette. Your final chip count is your score. Good luck!",
  },
};

// ─── STATUS BAR HINTS ──────────────────────────────────────────────────────
// The hint line in the bottom status bar, keyed by screen (rendered by
// statusBar()). Screens without an entry show "Ready.". The .sb-prefix /
// .sb-suffix spans are hidden on narrow screens to keep the bar on one line.
const STATUS_HINT = {
  intro:    'Idle · Start a new game.',
  bj:       'Blackjack · Choose action.',
  uth:      "Hold'em · Choose action.",
  poker:    'Poker · Choose action.',
  roulette: 'Roulette · Place a bet.',
  ladder:   'The Ladder · Higher or lower. Ties lose.',
  borrow:   'Broke · Borrow chips to continue.',
  results:  '<span class="sb-prefix">Game complete · </span>New game at midnight<span class="sb-suffix"> Arizona time</span>',
  devstats: 'Dev mode · Player statistics.',
  retention: 'Dev mode · Retention & drop-off.',
};

// ─── SHARE TEXT ────────────────────────────────────────────────────────────
// The text behind the results screen's "Copy & Share" button (and the preview
// box above it). Edit the line list freely; the (sign(...)) values are each
// game's net chips and `trophy` is the score-tier emoji.
// The Ladder's share line (empty array when the run wasn't played today).
// Format: chips bare, rung in parentheses. A free-entry crash shows no chip
// number on purpose: +0 reads flat and the crash is the story.
function _ladShareLine(){
  const lad = S.ladResult;
  if (!lad) return [];
  if (lad.result === 'crash') {
    return lad.free
      ? [`🪜 The Ladder · Crashed (Rung ${lad.rung + 1})`]
      : [`🪜 The Ladder ${sign(lad.delta)} · Crashed (Rung ${lad.rung + 1})`];
  }
  return [`🪜 The Ladder ${sign(lad.delta)} (Rung ${lad.rung}${lad.result === 'top' ? ' · Top!' : ''})`];
}

function buildShareText(){
  const g1Net=gameNet(GAME1);
  const g2Net=gameNet(GAME2);
  const rNet=S.rResult?.delta||0;
  const g1=GAME_META[GAME1],g2=GAME_META[GAME2];
  const trophy=getTier(S.chips).emoji;
  const modTitle = getMod('title');
  // Top-percentile brag, appended to the chip-total line only when the player landed in the
  // top half. The percentile arrives async after the share box first renders, so the
  // leaderboard fetch caches it (_lbTopPct) and re-renders the box · see _refreshShareBox.
  const topSuffix = (_lbTopPct != null && _lbTopPct <= 50) ? ` (Top ${_lbTopPct}%)` : ``;
  return [
    `🎰 Gambdle #${S.day}`,
    modTitle ? `Daily modifier: ${modTitle}` : ``,
    `${g1.shareIcon} ${g1.short} (${sign(g1Net)})`,
    `${g2.shareIcon} ${g2.short} (${sign(g2Net)})`,
    `🎡 Roulette (${sign(rNet)})`,
    ..._ladShareLine(),
    ``,
    `${trophy} Finished with ${fmt(S.chips)} chips${topSuffix}`,
    // Keep the protocol on the URL: Discord (and most chat apps) only auto-link/embed when it's present.
    `https://gambdle.net`
  ].join('\n');
}
