export function initTitlebar() {
  var titlebar = document.querySelector(".titlebar");
  var minimizeBtn = document.getElementById("minimizeBtn");
  var maximizeBtn = document.getElementById("maximizeBtn");
  var closeBtn = document.getElementById("closeBtn");
  if (!window.windowControls || !titlebar) return;

  function updateMaximizeIcon(isMaximized) {
    maximizeBtn.textContent = isMaximized ? "❐" : "▢";
    maximizeBtn.title = isMaximized ? "Restore" : "Maximize";
  }

  minimizeBtn.addEventListener("click", function () { window.windowControls.minimize(); });
  maximizeBtn.addEventListener("click", function () { window.windowControls.toggleMaximize(); });
  closeBtn.addEventListener("click", function () { window.windowControls.close(); });

  titlebar.addEventListener("dblclick", function (e) {
    if (e.target.closest(".titlebar-controls")) return;
    window.windowControls.toggleMaximize();
  });

  window.windowControls.isMaximized().then(updateMaximizeIcon);
  window.windowControls.onMaximizedChange(updateMaximizeIcon);
}
