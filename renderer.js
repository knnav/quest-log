(function () {
  var TIERS = [
    { key: "weekend", title: "TIER 1 — WEEKEND SHIPPABLE", desc: "1–3 days. Small enough to finish before the idea gets boring." },
    { key: "medium", title: "TIER 2 — 1–2 WEEK BUILD", desc: "Still capped scope, just more surface area. Cut features before cutting the deadline." },
    { key: "ongoing", title: "TIER 3 — ONGOING SIDE-QUESTS", desc: "Small recurring drops for the weeks nothing else is finished." }
  ];

  var STATUSES = ["backlog", "in_progress", "shipped"];
  var STATUS_LABEL = { backlog: "Backlog", in_progress: "In Progress", shipped: "Shipped" };

  var allTags = [];
  var activeFilter = "all";
  var latestDocs = [];
  var latestPinned = [];
  var editingQuestId = null;
  var editingPinnedId = null;

  var boardEl, statsEl, filtersEl, progressGridEl;
  var addQuestBtn, questModalOverlay, questForm, questModalTitle, questCancelBtn;
  var pinnedModalOverlay, pinnedForm, pinnedCancelBtn;
  var themeToggleBtn;

  var THEME_KEY = "quest-log-theme";

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function setStoredTheme(theme) {
    try {
      if (theme) localStorage.setItem(THEME_KEY, theme);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) {}
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function effectiveTheme() {
    return getStoredTheme() || (systemPrefersDark() ? "dark" : "light");
  }

  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    if (themeToggleBtn) {
      var isDark = effectiveTheme() === "dark";
      themeToggleBtn.textContent = isDark ? "☀" : "☾";
      themeToggleBtn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    }
  }

  applyTheme(getStoredTheme());

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    boardEl = document.getElementById("board");
    statsEl = document.getElementById("stats");
    filtersEl = document.getElementById("filters");
    progressGridEl = document.getElementById("progressGrid");

    addQuestBtn = document.getElementById("addQuestBtn");
    questModalOverlay = document.getElementById("questModalOverlay");
    questForm = document.getElementById("questForm");
    questModalTitle = document.getElementById("questModalTitle");
    questCancelBtn = document.getElementById("questCancelBtn");

    pinnedModalOverlay = document.getElementById("pinnedModalOverlay");
    pinnedForm = document.getElementById("pinnedForm");
    pinnedCancelBtn = document.getElementById("pinnedCancelBtn");

    themeToggleBtn = document.getElementById("themeToggleBtn");
    applyTheme(getStoredTheme());
    themeToggleBtn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      setStoredTheme(next);
      applyTheme(next);
    });

    addQuestBtn.addEventListener("click", function () { openQuestModal(null); });
    questCancelBtn.addEventListener("click", closeQuestModal);
    questModalOverlay.addEventListener("click", function (e) {
      if (e.target === questModalOverlay) closeQuestModal();
    });
    questForm.addEventListener("submit", onQuestFormSubmit);

    pinnedCancelBtn.addEventListener("click", closePinnedModal);
    pinnedModalOverlay.addEventListener("click", function (e) {
      if (e.target === pinnedModalOverlay) closePinnedModal();
    });
    pinnedForm.addEventListener("submit", onPinnedFormSubmit);

    loadAll();
  }

  function loadAll() {
    Promise.all([window.questLog.listQuests(), window.questLog.listPinned()])
      .then(function (results) {
        ingestPinned(results[1]);
        ingest(results[0]);
      })
      .catch(function () {
        boardEl.innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
      });
  }

  function refetchQuests() {
    return window.questLog.listQuests().then(ingest);
  }

  function refetchPinned() {
    return window.questLog.listPinned().then(ingestPinned);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderStats(quests) {
    var counts = { backlog: 0, in_progress: 0, shipped: 0 };
    quests.forEach(function (q) { counts[q.status] = (counts[q.status] || 0) + 1; });
    statsEl.innerHTML =
      '<div class="stat backlog"><div class="n">' + counts.backlog + '</div><div class="l">Backlog</div></div>' +
      '<div class="stat progress"><div class="n">' + counts.in_progress + '</div><div class="l">In Progress</div></div>' +
      '<div class="stat shipped"><div class="n">' + counts.shipped + '</div><div class="l">Shipped</div></div>';
  }

  function renderFilters() {
    var tags = ["all"].concat(allTags);
    filtersEl.innerHTML = "";
    tags.forEach(function (tag) {
      var btn = document.createElement("button");
      btn.className = "chip" + (activeFilter === tag ? " active" : "");
      btn.textContent = tag === "all" ? "All" : tag;
      btn.addEventListener("click", function () {
        activeFilter = tag;
        renderFilters();
        renderBoard(latestDocs);
      });
      filtersEl.appendChild(btn);
    });
  }

  function setStatus(id, status) {
    window.questLog.updateQuest(id, { status: status }).then(refetchQuests).catch(function () {});
  }

  function setPinnedState(id, state) {
    window.questLog.updatePinned(id, { state: state }).then(refetchPinned).catch(function () {});
  }

  function cardHtml(q) {
    var tags = (q.tags || []).map(function (t) {
      return '<span class="tag">' + escapeHtml(t) + '</span>';
    }).join("");

    var statusBtns = STATUSES.map(function (s) {
      return '<button class="status-btn ' + (q.status === s ? "on " + s : "") + '" data-id="' + q.id +
        '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
    }).join("");

    return (
      '<div class="card">' +
      '<div class="card-head">' +
      '<h3 class="card-title">' + escapeHtml(q.title) + '</h3>' +
      '<div class="card-actions">' +
      '<button class="icon-btn quest-edit-btn" data-id="' + q.id + '">Edit</button>' +
      '<button class="icon-btn danger quest-delete-btn" data-id="' + q.id + '">Delete</button>' +
      '</div>' +
      '</div>' +
      '<p class="card-hook">' + escapeHtml(q.hook) + '</p>' +
      '<div class="tags">' + tags + '</div>' +
      '<div class="dod"><b>Definition of done</b>' + escapeHtml(q.dod) + '</div>' +
      '<div class="status-row">' + statusBtns + '</div>' +
      '</div>'
    );
  }

  function pinnedCardHtml(repo) {
    var rows = "";
    if (repo.status) rows += '<div class="dod"><b>Status</b>' + escapeHtml(repo.status) + '</div>';
    if (repo.next) rows += '<div class="dod"><b>Next</b>' + escapeHtml(repo.next) + '</div>';
    if (repo.todo) rows += '<div class="dod"><b>To-do</b>' + escapeHtml(repo.todo) + '</div>';

    var state = repo.state || "in_progress";
    var statusBtns = STATUSES.map(function (s) {
      return '<button class="status-btn pinned-status-btn ' + (state === s ? "on " + s : "") + '" data-id="' + repo.id +
        '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
    }).join("");

    return (
      '<div class="card pinned-card">' +
      '<div class="card-head">' +
      '<h3 class="card-title">' + escapeHtml(repo.title) + '</h3>' +
      '<div class="card-actions">' +
      '<button class="icon-btn pinned-edit-btn" data-id="' + repo.id + '">Edit</button>' +
      '</div>' +
      '</div>' +
      '<div class="tags"><span class="tag pinned-tag">Pinned repo</span></div>' +
      rows +
      '<div class="status-row">' + statusBtns + '</div>' +
      '</div>'
    );
  }

  function bindCardActions(container) {
    container.querySelectorAll(".pinned-status-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setPinnedState(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
      });
    });

    container.querySelectorAll(".status-btn:not(.pinned-status-btn)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
      });
    });

    container.querySelectorAll(".quest-edit-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
        if (quest) openQuestModal(quest);
      });
    });

    container.querySelectorAll(".quest-delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onDeleteQuest(btn.getAttribute("data-id"));
      });
    });

    container.querySelectorAll(".pinned-edit-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var repo = latestPinned.filter(function (p) { return p.id === id; })[0];
        if (repo) openPinnedModal(repo);
      });
    });
  }

  function renderProgress(quests) {
    var inProgress = quests
      .filter(function (q) { return q.status === "in_progress"; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    progressGridEl.innerHTML =
      latestPinned.map(pinnedCardHtml).join("") + inProgress.map(cardHtml).join("");

    bindCardActions(progressGridEl);
  }

  function ingestPinned(pinnedList) {
    latestPinned = (pinnedList || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    renderProgress(latestDocs);
  }

  function renderBoard(quests) {
    if (!quests.length) {
      boardEl.innerHTML = '<div class="empty-state">Quest log is empty.</div>';
      return;
    }

    renderStats(quests);

    var filtered = activeFilter === "all"
      ? quests
      : quests.filter(function (q) { return (q.tags || []).indexOf(activeFilter) !== -1; });

    var html = "";
    TIERS.forEach(function (tier) {
      var inTier = filtered.filter(function (q) { return q.tier === tier.key; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (!inTier.length) return;
      html +=
        '<section class="tier">' +
        '<div class="tier-head"><h2 class="tier-title">' + tier.title + '</h2></div>' +
        '<p class="tier-desc">' + tier.desc + '</p>' +
        '<div class="grid">' + inTier.map(cardHtml).join("") + '</div>' +
        '</section>';
    });

    boardEl.innerHTML = html || '<div class="empty-state">No quests match this filter.</div>';

    bindCardActions(boardEl);
  }

  function ingest(docs) {
    docs = (docs || []).filter(function (d) { return d.title; });

    var tagSet = {};
    docs.forEach(function (d) { (d.tags || []).forEach(function (t) { tagSet[t] = true; }); });
    allTags = Object.keys(tagSet).sort();

    latestDocs = docs;
    renderProgress(docs);
    renderFilters();
    renderBoard(docs);
  }

  function openQuestModal(quest) {
    editingQuestId = quest ? quest.id : null;
    questModalTitle.textContent = quest ? "Edit Quest" : "Add Quest";
    document.getElementById("questTitle").value = quest ? quest.title : "";
    document.getElementById("questHook").value = quest ? quest.hook : "";
    document.getElementById("questTier").value = quest ? quest.tier : "weekend";
    document.getElementById("questTags").value = quest && quest.tags ? quest.tags.join(", ") : "";
    document.getElementById("questDod").value = quest ? quest.dod : "";
    questModalOverlay.hidden = false;
  }

  function closeQuestModal() {
    questModalOverlay.hidden = true;
    questForm.reset();
    editingQuestId = null;
  }

  function onQuestFormSubmit(e) {
    e.preventDefault();
    var data = {
      title: document.getElementById("questTitle").value.trim(),
      hook: document.getElementById("questHook").value.trim(),
      tier: document.getElementById("questTier").value,
      tags: document.getElementById("questTags").value.split(",")
        .map(function (t) { return t.trim(); })
        .filter(Boolean),
      dod: document.getElementById("questDod").value.trim()
    };

    var promise = editingQuestId
      ? window.questLog.updateQuest(editingQuestId, data)
      : window.questLog.createQuest(data);

    promise.then(function () {
      closeQuestModal();
      return refetchQuests();
    }).catch(function () {});
  }

  function onDeleteQuest(id) {
    if (!window.confirm("Delete this quest? This cannot be undone.")) return;
    window.questLog.deleteQuest(id).then(refetchQuests).catch(function () {});
  }

  function openPinnedModal(repo) {
    editingPinnedId = repo.id;
    document.getElementById("pinnedStatus").value = repo.status || "";
    document.getElementById("pinnedNext").value = repo.next || "";
    document.getElementById("pinnedTodo").value = repo.todo || "";
    pinnedModalOverlay.hidden = false;
  }

  function closePinnedModal() {
    pinnedModalOverlay.hidden = true;
    pinnedForm.reset();
    editingPinnedId = null;
  }

  function onPinnedFormSubmit(e) {
    e.preventDefault();
    if (!editingPinnedId) return;
    var data = {
      status: document.getElementById("pinnedStatus").value.trim(),
      next: document.getElementById("pinnedNext").value.trim(),
      todo: document.getElementById("pinnedTodo").value.trim()
    };

    window.questLog.updatePinned(editingPinnedId, data).then(function () {
      closePinnedModal();
      return refetchPinned();
    }).catch(function () {});
  }
})();
