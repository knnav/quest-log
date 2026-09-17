// The custom title bar. The window is frameless, so the OS draws no controls
// and these two buttons are the only way to put the board away.
//
// Both go through window.windowControls, exposed by preload.js — a renderer
// cannot move its own window. Minimise folds the board into the hearth; close
// asks first and then really quits (main.js owns the prompt). There is no
// maximise because the board's width is capped at two columns.

export function initTitlebar() {
  var titlebar = document.querySelector(".titlebar");
  var minimizeBtn = document.getElementById("minimizeBtn");
  var closeBtn = document.getElementById("closeBtn");
  if (!window.windowControls || !titlebar) return;

  minimizeBtn.addEventListener("click", function () { window.windowControls.minimize(); });
  closeBtn.addEventListener("click", function () { window.windowControls.close(); });
}
