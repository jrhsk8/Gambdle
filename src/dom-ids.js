// ─── DOM IDS ──────────────────────────────────────────────────────────────────
// The render→surgical-update contract, in one place. These are the element IDs that one function
// EMITS in its HTML and ANOTHER (a mid-hand patch via getElementById / patchEl / patchOrRender /
// patchZones / patchGroup) later mutates in place. Centralised so the two ends can't silently drift — rename an
// ID here and both the render site and every patch site follow. Scope is exactly the game-screen
// mid-hand contract (bj/uth/poker/roulette/ladder) plus the shared bet/header controls (ui.js) and
// the chip badge (flow.js); IDs that are only ever a CSS/structure hook (never patched by ID) stay
// inline. Class/attribute selectors (.r-sel, .chbtn, [data-idx]) are deliberately NOT here — styles.css
// references those literally too, so a JS-only registry couldn't keep them in sync.
//
// DOM is read at render/update time only; the replay engine never touches the DOM, so this file is
// NOT in the engine bundle (the bundled game files reference DOM only inside render/update functions
// the engine never calls). Loads right after record.js. PUBLIC: DOM.
const DOM = Object.freeze({
  // Shared bet / header controls (ui.js render → patchBetUI / flow.js)
  dealBtn:          'db',           // primary action button on every bet screen (Deal · Climb · Final Spin)
  betVal:           'bv',           // live bet amount in the bet inlay
  allInBtn:         'ai',           // all-in button
  chipBadge:        'chip-badge',   // chip total in the status bar
  hdrSub:           'hdr-sub',      // header subtitle slot

  // Blackjack
  bjPlayerHand:     'bj-player-hand',
  bjPlayerVal:      'bj-player-val',
  bjActiveHand:     'bj-active-hand',
  bjActiveVal:      'bj-active-val',
  bjDealerSection:  'bj-dealer-section',
  peekBtnWrap:      'peek-btn-wrap',

  // Ultimate Texas Hold'em
  uthDealerSec:     'uth-dealer-sec',
  uthDealerHand:    'uth-dealer-hand',
  uthCommunityHand: 'uth-community-hand',
  uthPrivSlot:      'uth-priv-slot',
  uthSummary:       'uth-summary',
  uthBetInlay:      'uth-bet-inlay',
  uthPtable:        'uth-ptable',
  uthPtHead:        'uth-pt-head',
  uthActionsUi:     'uth-actions-ui',
  uthDotsContainer: 'uth-dots-container',
  ttBtnWrap:        'tt-btn-wrap',

  // Roulette
  rouletteWheel:    'rwheel',
  rouletteSelBox:   'r-sel-box',
  rouletteBetsZone: 'r-bets-zone',
  placeBetBtn:      'pb-add',

  // The Ladder (six surgically-patched zones — see ladder.js _ladAfterAction)
  ladHead:  'lad-head',
  ladStrip: 'lad-strip',
  ladRead:  'lad-read',
  ladCards: 'lad-cards',
  ladMsg:   'lad-msg',
  ladAct:   'lad-act',

  // 5 Card Poker — a PREFIX, used as `${DOM.pkHoldWrap}${i}` for the i-th hold-card wrapper
  pkHoldWrap: 'pk-hw-',
});
