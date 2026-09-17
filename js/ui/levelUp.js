// The level-up card: a full-window flash with the new level on it, gone on
// its own. Wired over the #levelUp markup in index.html; degrades to a no-op
// where that markup is absent, so a caller never has to check.
//
// The show is CSS (styles.css, "the level-up card"); this only flips the
// class and takes it down again. Showing it while it is already up restarts
// it with the newer level — two levels in one click reads as one card, the
// higher one, which is the one that matters.

var rootEl = null;
var levelEl = null;
var hideTimer = null;

// A hair longer than the card's animation, so it is fully faded before it
// goes display: none.
export var LEVEL_UP_CARD_MS = 1900;

export function initLevelUp() {
  rootEl = document.getElementById("levelUp");
  levelEl = document.getElementById("levelUpLevel");
}

export function showLevelUp(level) {
  if (!rootEl) return;

  if (levelEl) levelEl.textContent = "Lv " + level;

  // Take the class off and force a style flush before putting it back, so a
  // card that is already running restarts its animations from the top.
  rootEl.classList.remove("is-on");
  rootEl.hidden = false;
  void rootEl.offsetWidth;
  rootEl.classList.add("is-on");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hideLevelUp, LEVEL_UP_CARD_MS);
  if (hideTimer && typeof hideTimer.unref === "function") hideTimer.unref();
}

export function hideLevelUp() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (!rootEl) return;
  rootEl.classList.remove("is-on");
  rootEl.hidden = true;
}
