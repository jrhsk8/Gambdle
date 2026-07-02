// ─── DOM IDS ──────────────────────────────────────────────────────────────────
// One place holding the element IDs that a render function writes into its HTML
// and that another function later reads back with getElementById (or patchEl /
// patchOrRender / patchZones / patchGroup) to update the DOM mid-hand. Rename an
// ID here and both the render site and every place that patches it stay in sync.
// Covers the game-screen mid-hand updates (bj/uth/poker/roulette/ladder) plus
// the shared bet/header controls (ui.js) and the chip badge (flow.js); IDs that
// only exist as a CSS/structure hook, and are never looked up by ID, stay inline
// in their HTML instead of being added here. Class/attribute selectors like
// .r-sel, .chbtn, [data-idx] are deliberately not here either: styles.css
// references those directly, so a JS-only list here couldn't keep them synced.
//
// The DOM is only touched at render/update time; the replay engine never reads
// or writes it, so this file is left out of the engine bundle. Loads right
// after record.js.
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

  // The Ladder (six surgically-patched zones: see ladder.js _ladAfterAction)
  ladHead:  'lad-head',
  ladStrip: 'lad-strip',
  ladRead:  'lad-read',
  ladCards: 'lad-cards',
  ladMsg:   'lad-msg',
  ladAct:   'lad-act',

  // 5 Card Poker: a prefix, used as `${DOM.pkHoldWrap}${i}` for the i-th hold-card wrapper
  pkHoldWrap: 'pk-hw-',
});
