// A create/edit form over existing markup. Both boards use one; the markup
// already exists in index.html, so this wires it rather than rendering it.
//
// It owns the whole lifecycle: which item is being edited, populating inputs,
// clearing on close, and the three ways out (cancel, Escape, backdrop click).
//
// config:
//   overlay, form, heading, cancel, addButton  element ids
//   headings  { create, edit }   heading text for each mode
//   fields    [{ id, key, fallback?, read?, write? }]
//             id is the input's element id, key the property on the item.
//             read maps the input's string to the stored value (default: trim),
//             write maps a stored value back to a string (default: as-is),
//             fallback is the value used when creating rather than editing.
//   onOpen    optional hook after the fields are populated, before it shows
//   create(data) / update(id, data)   must return promises
//   onSaved   called after either resolves
//
// Returns { open(item|null), close, values, field(key) }. field() exposes an
// input element for callers that need to watch it — quests listens to the
// scope select to refresh its note.
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

  // Identity check, not `closest`: a click inside the form bubbles up to the
  // overlay too, and must not be treated as a click on the backdrop.
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  form.addEventListener("submit", onSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  return { open: open, close: close, values: values, field: field };
}
