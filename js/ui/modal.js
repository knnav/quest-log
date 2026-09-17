// Both boards put a form over the board, fill it from an item or leave it
// blank, and save by creating or updating. Only the fields and the calls
// differ, so those are all this asks for.
//
// A field is { id, key }: read that input, trim it, store it under key.
// Anything shaped differently — tags are a list, scope has a default — brings
// its own read/write pair.
export function createModal(config) {
  var overlay = document.getElementById(config.overlay);
  var form = document.getElementById(config.form);
  var headingEl = document.getElementById(config.heading);
  var cancelEl = document.getElementById(config.cancel);
  var addEl = config.addButton ? document.getElementById(config.addButton) : null;

  var elements = {};
  config.fields.forEach(function (field) {
    elements[field.key] = document.getElementById(field.id);
  });

  var editingId = null;

  function field(key) {
    return elements[key];
  }

  function open(item) {
    editingId = item ? item.id : null;
    headingEl.textContent = item ? config.headings.edit : config.headings.create;

    config.fields.forEach(function (f) {
      var raw = item ? item[f.key] : undefined;
      if (f.write) {
        elements[f.key].value = f.write(raw);
      } else {
        elements[f.key].value = (raw === undefined || raw === null) ? (f.fallback || "") : raw;
      }
    });

    if (config.onOpen) config.onOpen();
    overlay.hidden = false;
  }

  function close() {
    overlay.hidden = true;
    form.reset();
    editingId = null;
  }

  function values() {
    var data = {};
    config.fields.forEach(function (f) {
      var raw = elements[f.key].value;
      data[f.key] = f.read ? f.read(raw) : raw.trim();
    });
    return data;
  }

  function onSubmit(e) {
    e.preventDefault();
    var data = values();
    var promise = editingId ? config.update(editingId, data) : config.create(data);

    promise.then(function () {
      close();
      return config.onSaved();
    }).catch(function () {});
  }

  if (addEl) addEl.addEventListener("click", function () { open(null); });
  cancelEl.addEventListener("click", close);

  // Only the backdrop closes it. A click that lands inside the form must not.
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  form.addEventListener("submit", onSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  return { open: open, close: close, values: values, field: field };
}
