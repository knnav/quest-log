// Dragging a frameless window by one of its own elements.
//
// Both floating faces are moved this way — the hearth and the In Flight panel
// — so the mechanism lives here once: the renderer reports pointer deltas over
// window.windowControls and main.js applies them to whichever window sent
// them.
//
// It is deliberately not a CSS `-webkit-app-region: drag`, and that is not a
// style choice. On Windows a drag region is handled as a title bar at the
// non-client level, so the DOM never sees a mousedown, dblclick or contextmenu
// inside it — the double-click that brings the board back, and the right-click
// menu, simply never fire. The full story, and the two Windows display-scaling
// traps main.js walks around when it applies these deltas, are written up
// above `dragging` in main.js. Read that before replacing any of this.
//
// options.blocked — optional predicate; while it returns true no drag starts.
// The hearth uses it so that the click which acknowledges a finished session
// can't be swallowed by accidentally moving the window instead.

export function enableWindowDrag(el, options) {
  if (!el) return;
  options = options || {};

  var drag = null;
  var pendingMove = null;

  function controls() {
    var c = window.windowControls;
    return c && c.dragStart ? c : null;
  }

  // Left button only, and never from a button — those have their own job.
  function startDrag(e) {
    if (e.button !== 0 || (e.target.closest && e.target.closest("button"))) return;
    if (options.blocked && options.blocked()) return;
    if (!controls()) return;

    drag = { x: e.screenX, y: e.screenY, pointerId: e.pointerId };
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    controls().dragStart();
  }

  // Coalesced to one IPC per frame: pointer events can arrive far faster than
  // the window can be repainted, and every extra move is a wasted native call.
  function moveDrag(e) {
    if (!drag) return;
    pendingMove = { dx: e.screenX - drag.x, dy: e.screenY - drag.y };
    if (pendingMove.scheduled) return;
    pendingMove.scheduled = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(flushMove);
  }

  function flushMove() {
    var move = pendingMove;
    pendingMove = null;
    if (!move || !drag || !controls()) return;
    controls().dragMove(move.dx, move.dy);
  }

  function stopDrag() {
    if (!drag) return;
    flushMove();
    if (el.releasePointerCapture) {
      try { el.releasePointerCapture(drag.pointerId); } catch (err) { /* already released */ }
    }
    drag = null;
    if (controls()) controls().dragEnd();
  }

  el.addEventListener("pointerdown", startDrag);
  el.addEventListener("pointermove", moveDrag);
  el.addEventListener("pointerup", stopDrag);
  el.addEventListener("pointercancel", stopDrag);
}
