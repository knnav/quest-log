// Mirrors the modal markup in index.html so interaction tests can drive it.
export const DETAIL_MODAL_HTML = `
  <div class="modal-overlay" id="detailModalOverlay" hidden>
    <div class="modal">
      <div class="detail-head">
        <h2 id="detailTitle"></h2>
        <button type="button" id="detailPrioritizeBtn">Mark next up</button>
        <button type="button" id="detailDeprioritizeBtn">Unmark</button>
        <button type="button" id="detailArchiveBtn">Archive</button>
        <button type="button" id="detailRestoreBtn">Restore</button>
      </div>
      <div class="tags" id="detailTags" hidden></div>
      <p class="detail-text" id="detailText" hidden></p>
      <div class="detail-rows" id="detailRows"></div>
      <button type="button" id="detailDeleteBtn">Delete</button>
      <button type="button" id="detailLetGoBtn">Let go</button>
      <button type="button" id="detailSessionBtn">Start 25m</button>
      <button type="button" id="detailCloseBtn">Close</button>
      <button type="button" id="detailEditBtn">Edit</button>
    </div>
  </div>`;

export const GATE_MODAL_HTML = `
  <div class="modal-overlay" id="shipModalOverlay" hidden>
    <div class="modal">
      <blockquote id="shipDod"></blockquote>
      <p id="shipQuestTitle"></p>
      <button type="button" id="shipCancelBtn">Not yet</button>
      <button type="button" id="shipConfirmBtn">Shipped it</button>
    </div>
  </div>
  <div class="modal-overlay" id="wipModalOverlay" hidden>
    <div class="modal">
      <p id="wipBody"></p>
      <ul id="wipList"></ul>
      <button type="button" id="wipCancelBtn">Cancel</button>
      <button type="button" id="wipBenchBtn">Bench those</button>
      <button type="button" id="wipProceedBtn">Start anyway</button>
    </div>
  </div>`;

export function rowTexts(doc) {
  return Array.from(doc.querySelectorAll("#detailRows .dod")).map((el) => el.textContent);
}
