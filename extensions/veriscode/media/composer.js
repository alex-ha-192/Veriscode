// Webview client for the "Build Top Module" composer. Plain DOM/JS, no
// framework - same rationale as main.js: this only ever runs inside a
// single VS Code webview, and the surface area is small enough that a
// bundler/framework would add more weight than it saves.
(function () {
  const vscode = acquireVsCodeApi();

  /** @type {{folderName: string, library: Array<{name:string, ports: Array<{name:string, direction:string, width:number}>}>}} */
  let library = { folderName: "", library: [] };

  /** Top-level port rows the student is declaring for the module being built. */
  let topPorts = [];
  let topPortSeq = 0;

  /** Instances placed on the canvas. */
  let instances = [];
  let instanceSeq = 0;

  /** @type {Record<string, {x:number, y:number}>} */
  const boxPositions = {};
  const { ensurePosition, positionBox, makeDraggable } = window.VeriscodeSchematic;

  const el = {
    subtitle: document.getElementById("subtitle"),
    paletteList: document.getElementById("paletteList"),
    topName: document.getElementById("topName"),
    addPort: document.getElementById("addPort"),
    generate: document.getElementById("generate"),
    errorLog: document.getElementById("errorLog"),
    successLog: document.getElementById("successLog"),
    canvas: document.getElementById("canvas"),
  };

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "init") {
      library = msg.state;
      el.subtitle.textContent = `Modules found in "${library.folderName}" - click one to add it to the canvas.`;
      renderPalette();
      renderCanvas();
    } else if (msg.type === "generateResult") {
      showResult(msg);
    }
  });

  function showResult(result) {
    if (result.ok) {
      el.errorLog.style.display = "none";
      el.errorLog.textContent = "";
      el.successLog.style.display = "block";
      el.successLog.textContent = `Created ${result.fileName} and opened it in the editor.`;
    } else {
      el.successLog.style.display = "none";
      el.errorLog.style.display = "block";
      el.errorLog.textContent = result.errors.join("\n");
    }
  }

  function renderPalette() {
    el.paletteList.innerHTML = "";
    if (library.library.length === 0) {
      const empty = document.createElement("p");
      empty.className = "legend";
      empty.textContent = "No SystemVerilog modules found in this folder.";
      el.paletteList.appendChild(empty);
      return;
    }
    for (const mod of library.library) {
      const item = document.createElement("div");
      item.className = "palette-item";
      const name = document.createElement("div");
      name.className = "palette-item-name";
      name.textContent = mod.name;
      const count = document.createElement("div");
      count.className = "palette-item-detail";
      count.textContent = `${mod.ports.length} port${mod.ports.length === 1 ? "" : "s"}`;
      item.appendChild(name);
      item.appendChild(count);
      item.addEventListener("click", () => addInstance(mod));
      el.paletteList.appendChild(item);
    }
  }

  function addInstance(mod) {
    const priorOfType = instances.filter((i) => i.moduleType === mod.name).length;
    const id = `inst${instanceSeq++}`;
    instances.push({
      id,
      instanceName: `${mod.name}_${priorOfType}`,
      moduleType: mod.name,
      ports: mod.ports.map((p) => ({ name: p.name, direction: p.direction, width: p.width, netName: "" })),
    });
    renderCanvas();
  }

  function removeInstance(id) {
    instances = instances.filter((i) => i.id !== id);
    delete boxPositions[id];
    renderCanvas();
  }

  function addTopPort() {
    topPorts.push({ id: `p${topPortSeq++}`, name: `port${topPorts.length}`, direction: "input", width: 1 });
    renderCanvas();
  }
  el.addPort.addEventListener("click", addTopPort);

  function removeTopPort(id) {
    topPorts = topPorts.filter((p) => p.id !== id);
    renderCanvas();
  }

  el.generate.addEventListener("click", () => {
    vscode.postMessage({ type: "generate", spec: collectSpec() });
  });

  function collectSpec() {
    return {
      topName: el.topName.value.trim(),
      topPorts: topPorts.map((p) => ({ name: p.name.trim(), direction: p.direction, width: p.width })),
      instances: instances.map((inst) => ({
        instanceName: inst.instanceName.trim(),
        moduleType: inst.moduleType,
        connections: inst.ports.map((p) => ({
          portName: p.name,
          direction: p.direction,
          width: p.width,
          netName: p.netName.trim(),
        })),
      })),
    };
  }

  function makeRemoveButton(onClick) {
    const btn = document.createElement("span");
    btn.className = "box-remove";
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function renderTopBox() {
    const box = document.createElement("div");
    box.className = "schematic-box top composer-top-box";

    const titleEl = document.createElement("div");
    titleEl.className = "box-title";
    titleEl.textContent = "Top-level ports ";
    const sub = document.createElement("span");
    sub.className = "box-subtitle";
    sub.textContent = "(this module's own interface)";
    titleEl.appendChild(sub);
    box.appendChild(titleEl);

    if (topPorts.length === 0) {
      const hint = document.createElement("div");
      hint.className = "schematic-port-row";
      hint.innerHTML = '<span class="legend" style="margin:0">Click "+ Top-Level Port" to add one.</span>';
      box.appendChild(hint);
    }

    for (const port of topPorts) {
      const row = document.createElement("div");
      row.className = "schematic-port-row composer-port-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "net-input port-name-input";
      nameInput.value = port.name;
      nameInput.addEventListener("input", () => (port.name = nameInput.value));

      const dirSelect = document.createElement("select");
      dirSelect.className = "dir-select";
      for (const d of ["input", "output", "inout"]) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        if (d === port.direction) opt.selected = true;
        dirSelect.appendChild(opt);
      }
      dirSelect.addEventListener("change", () => (port.direction = dirSelect.value));

      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "1";
      widthInput.className = "width-input";
      widthInput.value = String(port.width);
      widthInput.title = "Width in bits";
      widthInput.addEventListener("input", () => {
        const n = parseInt(widthInput.value, 10);
        port.width = Number.isFinite(n) && n >= 1 ? n : 1;
      });

      row.appendChild(nameInput);
      row.appendChild(dirSelect);
      row.appendChild(widthInput);
      row.appendChild(makeRemoveButton(() => removeTopPort(port.id)));
      box.appendChild(row);
    }

    const pos = ensurePosition(boxPositions, "top", 20, 20);
    positionBox(box, pos);
    makeDraggable(box, titleEl, boxPositions, "top");
    return box;
  }

  function renderInstanceBox(inst) {
    const box = document.createElement("div");
    box.className = "schematic-box";
    box.dataset.boxId = inst.id;

    const titleEl = document.createElement("div");
    titleEl.className = "box-title composer-instance-title";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "instance-name-input";
    nameInput.value = inst.instanceName;
    nameInput.addEventListener("input", () => (inst.instanceName = nameInput.value));
    nameInput.addEventListener("mousedown", (e) => e.stopPropagation());

    const sub = document.createElement("span");
    sub.className = "box-subtitle";
    sub.textContent = ` : ${inst.moduleType}`;

    titleEl.appendChild(nameInput);
    titleEl.appendChild(sub);
    titleEl.appendChild(makeRemoveButton(() => removeInstance(inst.id)));
    box.appendChild(titleEl);

    for (const port of inst.ports) {
      const row = document.createElement("div");
      row.className = "schematic-port-row composer-port-row";

      const left = document.createElement("span");
      const dir = document.createElement("span");
      dir.className = `dir ${port.direction}`;
      dir.textContent = port.direction;
      left.appendChild(dir);
      const nameSpan = document.createElement("span");
      nameSpan.className = "port-name";
      nameSpan.textContent = port.name;
      left.appendChild(nameSpan);

      const netInput = document.createElement("input");
      netInput.type = "text";
      netInput.className = "net-input";
      netInput.placeholder = "net name";
      netInput.value = port.netName;
      netInput.addEventListener("input", () => (port.netName = netInput.value));

      row.appendChild(left);
      row.appendChild(netInput);
      box.appendChild(row);
    }

    const pos = ensurePosition(boxPositions, inst.id, 340, 20 + instances.indexOf(inst) * 10);
    positionBox(box, pos);
    makeDraggable(box, titleEl, boxPositions, inst.id);
    return box;
  }

  function renderCanvas() {
    el.canvas.innerHTML = "";
    el.canvas.appendChild(renderTopBox());
    instances.forEach((inst, i) => {
      ensurePosition(boxPositions, inst.id, 340, 20 + i * 190);
      el.canvas.appendChild(renderInstanceBox(inst));
    });
  }

  vscode.postMessage({ type: "ready" });
})();
