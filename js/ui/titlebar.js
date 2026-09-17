// The custom title bar. The window is frameless, so the OS draws no controls
// and these two buttons are the only way to minimise or close it.
//
// Both go through window.windowControls, exposed by preload.js — a renderer
// cannot move its own window. There is no maximise: the window is a fixed size.

export function initTitlebar() {
  var titlebar = document.querySelector(".titlebar");
  var minimizeBtn = document.getElementById("minimizeBtn");
  var closeBtn = document.getElementById("closeBtn");
  if (!window.windowControls || !titlebar) return;

  minimizeBtn.addEventListener("click", function () { window.windowControls.minimize(); });
  closeBtn.addEventListener("click", function () { window.windowControls.close(); });
}
