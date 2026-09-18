// The custom title bar. The window is frameless, so the OS draws no controls
// and these buttons are the only way to put the board away.
//
// All of them go through preload's bridges — a renderer cannot move its own
// window. Minimise folds the board into the hearth; close asks first and then
// really quits (main.js owns the prompt). There is no maximise because the
// board's width is capped at two columns.
//
// The third button switches the In Flight panel on and off. It is a switch,
// not an action, so it reflects state: main.js broadcasts every change to the
// flag (the tray and the hearth's menu can flip it too) and this redraws.
// What it controls is whether the panel appears in mini mode, so the tooltip
// says so — from the board, flipping it changes nothing you can see yet.
//
// The fourth is peace: the fire alone, over the whole display. A window mode
// like the other two, so it sits with the window controls.

export function initTitlebar() {
  var titlebar = document.querySelector(".titlebar");
  if (!titlebar) return;

  // Wired first, and on its own: the switch talks to window.panel, so it must
  // not be stranded by a missing windowControls.
  initPanelButton();

  if (!window.windowControls) return;
  var peaceBtn = document.getElementById("peaceBtn");
  if (peaceBtn) {
    if (window.windowControls.peace) {
      peaceBtn.addEventListener("click", function () { window.windowControls.peace(); });
    } else {
      // An older preload without the bridge: no mode to enter.
      peaceBtn.hidden = true;
    }
  }
  document.getElementById("minimizeBtn")
    .addEventListener("click", function () { window.windowControls.minimize(); });
  document.getElementById("closeBtn")
    .addEventListener("click", function () { window.windowControls.close(); });
}

function initPanelButton() {
  var btn = document.getElementById("panelBtn");
  if (!btn) return;

  // No bridge means no second window to show, so the switch would be a lie.
  if (!window.panel) {
    btn.hidden = true;
    return;
  }

  var enabled = false;

  function draw() {
    btn.classList.toggle("on", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.title = enabled
      ? "In Flight panel: shown in mini mode"
      : "In Flight panel: off";
  }

  function apply(next) {
    enabled = !!next;
    draw();
  }

  btn.addEventListener("click", function () {
    window.panel.setEnabled(!enabled).then(apply).catch(function () {});
  });

  window.panel.onEnabledChange(apply);
  window.panel.isEnabled().then(apply).catch(function () {});
  draw();
}
