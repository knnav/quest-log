function orderedIds(container) {
  return Array.prototype.slice.call(container.querySelectorAll("[data-drag-id]"))
    .map(function (el) { return el.getAttribute("data-drag-id"); });
}

export function enableDragSort(container, onReorder) {
  var dragging = null;
  var startOrder = null;

  container.querySelectorAll("[data-drag-id]").forEach(function (el) {
    el.setAttribute("draggable", "true");
  });

  container.addEventListener("dragstart", function (e) {
    var card = e.target.closest("[data-drag-id]");
    if (!card) return;

    dragging = card;
    startOrder = orderedIds(container).join(",");
    card.classList.add("dragging");

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.getAttribute("data-drag-id"));
    }
  });

  container.addEventListener("dragover", function (e) {
    if (!dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    var target = e.target.closest("[data-drag-id]");
    if (!target || target === dragging) return;

    var rect = target.getBoundingClientRect();
    var draggingRect = dragging.getBoundingClientRect();
    // Cards sitting on the same row are side by side, so the horizontal
    // midpoint decides; stacked cards use the vertical one.
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
    if (!dragging) return;
    dragging.classList.remove("dragging");
    dragging = null;

    var ids = orderedIds(container);
    if (ids.join(",") !== startOrder) onReorder(ids);
  });
}
