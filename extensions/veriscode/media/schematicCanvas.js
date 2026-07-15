// Shared DOM helpers for the two schematic-style canvases (the read-only
// Logical Schematic tab in main.js, and the editable canvas in
// composer.js): drag-and-position logic, plus the small "removable ✕
// button" pattern both use. Position tracking: each caller keeps its own
// {id -> {x,y}} store and calls these free functions against it, so
// dragging behaves identically in both places without duplicating the
// mouse-tracking code.
(function () {
  function ensurePosition(store, id, defaultX, defaultY) {
    if (!store[id]) {
      store[id] = { x: defaultX, y: defaultY };
    }
    return store[id];
  }

  function positionBox(box, pos) {
    box.style.left = `${pos.x}px`;
    box.style.top = `${pos.y}px`;
  }

  function makeDraggable(box, handle, store, id) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const pos = store[id] ?? { x: 0, y: 0 };
      originX = pos.x;
      originY = pos.y;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const x = Math.max(0, originX + dx);
      const y = Math.max(0, originY + dy);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    });

    window.addEventListener("mouseup", (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const x = Math.max(0, originX + dx);
      const y = Math.max(0, originY + dy);
      if (store[id]) {
        store[id].x = x;
        store[id].y = y;
      }
    });
  }

  /** A small "✕" affordance that stops its click from bubbling (so it works inside a draggable title bar) before calling onClick. */
  function makeRemoveButton(className, title, onClick) {
    const btn = document.createElement("span");
    btn.className = className;
    btn.textContent = "✕";
    btn.title = title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  window.VeriscodeSchematic = { ensurePosition, positionBox, makeDraggable, makeRemoveButton };
})();
