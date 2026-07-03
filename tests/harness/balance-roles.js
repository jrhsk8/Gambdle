// ─── Balance role map + parity groups ─────────────────────────────────────────
// Declares which on-screen elements count as "the same element" across Screens, so the
// balance audit can check they don't jump vertically as the player walks between screens.
// Each role: a CSS selector (first visible match inside .panel wins), the edge that is
// expected to stay put (`anchor`), and how far it may drift before it's reported (`tol`, px).
// Tolerances are starting values, tuned during calibration against known-off screens.
//
// Loaded two ways, like screen-fixtures.js: as a browser <script> (lab frame, audit page)
// and via require() in tests/harness/balance-audit.js (node), so the selector list and the
// group list can never disagree between the overlay and the report.
// See .claude/LAYOUT.md (Control position parity) for the invariant this generalizes.

(function (root) {
  'use strict';

  // anchor: which measured edge the parity check compares across screens.
  //   'top'    → distance from panel top to the element's top edge
  //   'bottom' → distance from the element's bottom edge to the panel bottom
  //   'center' → distance from panel top to the element's vertical center
  const BALANCE_ROLES = {
    modBanner: { sel: '.mod-banner',              anchor: 'top',    tol: 2 },
    secLabel:  { sel: '.sec',                     anchor: 'top',    tol: 6 },
    dealerRow: { sel: '.dealer-hand-row',         anchor: 'top',    tol: 8 },
    board:     { sel: '#uth-community-container', anchor: 'top',    tol: 8 },
    headline:  { sel: '.result-hl',               anchor: 'center', tol: 10 },
    betInlay:  { sel: '.bet-amt',                 anchor: 'bottom', tol: 1 },
    commit:    { sel: '#db, .act-btns',           anchor: 'bottom', tol: 1 },
    chipRow:   { sel: '.chip-row',                anchor: 'bottom', tol: 4 },
  };

  // Parity groups: within each list, every role present on 2+ fixtures is compared.
  // Flow groups cover what the eye sees frame-to-frame during one game; cross groups
  // cover "the same slot should hold the same element" across different games.
  const BALANCE_GROUPS = {
    'bj-flow': [
      'bj-bet', 'bj-play', 'bj-pick', 'bj-split-2', 'bj-split-3', 'bj-split-4',
      'bj-split-result', 'bj-result', 'bj-result-last',
      'bj-result-split-2', 'bj-result-split-3', 'bj-result-split-4',
    ],
    'uth-flow': [
      'uth-bet', 'uth-preflop', 'uth-flop', 'uth-turn', 'uth-sixth',
      'uth-reveal', 'uth-showdown', 'uth-fold',
    ],
    'roulette-flow': [
      'roulette-bet', 'roulette-bet-max', 'roulette-spinning', 'roulette-respin', 'roulette-result',
    ],
    'ladder-flow': ['ladder-bet-free', 'ladder-climb', 'ladder-crash', 'ladder-cash'],
    'cross-bet':    ['bj-bet', 'uth-bet', 'roulette-bet', 'ladder-bet-free'],
    'cross-play':   ['bj-play', 'uth-flop', 'ladder-climb'],
    'cross-result': ['bj-result', 'uth-showdown', 'roulette-result', 'ladder-cash'],
  };

  root.BALANCE_ROLES = BALANCE_ROLES;
  root.BALANCE_GROUPS = BALANCE_GROUPS;
})(typeof window !== 'undefined' ? window : this);
