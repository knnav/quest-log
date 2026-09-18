// The next-up star on a card. Shared by quest and task cards so the two can't
// drift: one glyph, one attribute the click handlers read, one label.
//
// A star, never the fire — the fire means "burned as fuel", and a card that
// is merely important has not earned that yet. `data-important` carries the
// current state so the handler can flip it without a lookup.

import { escapeHtml } from "../core/html.js";
import { isImportant } from "../core/domain.js";

export function starHtml(item) {
  var on = isImportant(item);
  return '<button type="button" class="star-btn' + (on ? " on" : "") + '"' +
    ' data-id="' + escapeHtml(item.id) + '"' +
    ' data-important="' + (on ? "1" : "0") + '"' +
    ' aria-pressed="' + (on ? "true" : "false") + '"' +
    ' title="' + (on ? "Unmark next up" : "Mark next up") + '">' +
    (on ? "&#9733;" : "&#9734;") +
    '</button>';
}
