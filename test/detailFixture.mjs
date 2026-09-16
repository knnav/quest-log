// Mirrors the detail modal markup in index.html so card-click tests can open it.
export const DETAIL_MODAL_HTML = `
  <div class="modal-overlay" id="detailModalOverlay" hidden>
    <div class="modal">
      <h2 id="detailTitle"></h2>
      <div class="tags" id="detailTags" hidden></div>
      <p class="detail-text" id="detailText" hidden></p>
      <div class="detail-rows" id="detailRows"></div>
      <button type="button" id="detailCloseBtn">Close</button>
      <button type="button" id="detailEditBtn">Edit</button>
    </div>
  </div>`;

export function rowTexts(doc) {
  return Array.from(doc.querySelectorAll("#detailRows .dod")).map((el) => el.textContent);
}
