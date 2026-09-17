// String escaping for the renderer.
//
// The board is built by string concatenation rather than DOM nodes, so every
// user-supplied value — titles, tags, hooks — must pass through this before
// it reaches an innerHTML assignment.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
