/**
 * GAMBDLE TUTORIAL TIPS. Edit the text in this file freely.
 *
 * These are small popups (the XP balloon) that show the first time a player runs
 * into each situation, and then never again. They stay light on purpose: they only
 * point out the things people tend to trip over (mostly the ways this Ultimate
 * Texas Hold'em is not the same as regular Hold'em), rather than teaching every
 * game from scratch. Players can switch them off from the Help menu under "Tips".
 *
 * EDITING: change any title or body string below. A body can include simple HTML
 * such as <b>, <br>, or <span>. To drop a tip, delete its entry here and remove
 * its id from TUTORIAL_ORDER. To add one, add an entry, add its id to
 * TUTORIAL_ORDER, and wire a trigger for that id in _runTutorial() (src/ui.js).
 *
 * WHEN EACH TIP FIRES (triggers live in _runTutorial(), keyed by these ids):
 *   modifier     the intro screen (points at the daily rule banner)
 *   bj_hands     first Blackjack bet screen
 *   uth_bet      first Hold'em bet screen
 *   uth_raise    first Hold'em decision (preflop)
 *   uth_turn     Hold'em river decision (all 5 cards out: raise 1x or fold, no check)
 *   uth_qualify  first Hold'em showdown
 */

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
};

// Order the tips are listed and prioritised in.
const TUTORIAL_ORDER = ['modifier', 'bj_hands', 'uth_bet', 'uth_raise', 'uth_turn', 'uth_qualify'];

// Added once, to whichever tip a player sees first, so they know where the off switch is.
const TUTORIAL_OFF_NOTE =
  "<br><br><span style=\"opacity:.7;font-size:.92em\">You'll see each of these just once. You can turn them off in the Help menu.</span>";
