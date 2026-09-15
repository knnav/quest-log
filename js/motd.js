export function initMotd() {
  var el = document.getElementById("motd");
  if (!el || !window.motd) return;

  window.motd.list().then(function (messages) {
    if (!Array.isArray(messages) || !messages.length) return;
    var pick = messages[Math.floor(Math.random() * messages.length)];
    el.textContent = pick;
  }).catch(function () {});
}
