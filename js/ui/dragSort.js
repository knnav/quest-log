// Drag-to-reorder for any grid of cards. Opt in by giving each child a
// data-drag-id; the container needs no markup of its own.
//
// Reordering is done live in the DOM as you drag, and onReorder(ids) fires once
// on drop — and only if the order actually changed, so a click-and-release
// doesn't write to disk.
//
// Safe to call after every render. Cards are re-rendered wholesale but the
// grid they sit in usually persists, so the listeners go on the container once
// and later calls only re-flag the new children (and swap in the latest
// callback). Binding again each time would stack a full set of handlers per
// render and fire onReorder — a disk write — once per stacked set.

function orderedIds(container) {
  return Array.prototype.slice.call(container.querySelectorAll("[data-drag-id]"))
    .map(function (el) { return el.getAttribute("data-drag-id"); });
}

function markDraggable(container) {
  container.querySelectorAll("[data-drag-id]").forEach(function (el) {
    el.setAttribute("draggable", "true");
  });
}

export function enableDragSort(container, onReorder) {
  markDraggable(container);

  if (container.dragSort) {
    container.dragSort.onReorder = onReorder;
    return;
  }

  var state = { dragging: null, startOrder: null, onReorder: onReorder };
  container.dragSort = state;

  container.addEventListener("dragstart", function (e) {
    var card = e.target.closest("[data-drag-id]");
    if (!card) return;

    state.dragging = card;
    state.startOrder = orderedIds(container).join(",");
    card.classList.add("dragging");

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.getAttribute("data-drag-id"));
    }
  });

  container.addEventListener("dragover", function (e) {
    var dragging = state.dragging;
    if (!dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    var target = e.target.closest("[data-drag-id]");
    if (!target || target === dragging) return;

    var rect = target.getBoundingClientRect();
    var draggingRect = dragging.getBoundingClientRect();
    // Grids wrap, so the axis to compare on depends on the layout: cards whose
    // tops line up are side by side and split on X, stacked cards split on Y.
    var sameRow = Math.abs(rect.top - draggingRect.top) < 5;
    var after = sameRow
      ? e.clientX > rect.left + rect.width / 2
      : e.clientY > rect.top + rect.height / 2;

    container.insertBefore(dragging, after ? target.nextSibling : target);
  });

  container.addEventListener("drop", function (e) {
    e.preventDefault();
  });

  container.addEventListener("dragend", function () {
    if (!state.dragging) return;
    state.dragging.classList.remove("dragging");
    state.dragging = null;

    var ids = orderedIds(container);
    if (ids.join(",") !== state.startOrder) state.onReorder(ids);
  });
}
