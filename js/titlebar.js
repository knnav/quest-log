export function initTitlebar() {
  var titlebar = document.querySelector(".titlebar");
  var minimizeBtn = document.getElementById("minimizeBtn");
  var closeBtn = document.getElementById("closeBtn");
  if (!window.windowControls || !titlebar) return;

  // The window is a fixed size, so there is no maximize and no drag-to-resize
  // — minimise and close are the whole set.
  minimizeBtn.addEventListener("click", function () { window.windowControls.minimize(); });
  closeBtn.addEventListener("click", function () { window.windowControls.close(); });
}
