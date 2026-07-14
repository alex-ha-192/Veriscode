// Webview client for the Veriscode interactive simulator. Plain DOM/JS by
// design - no bundler, no framework - since this only ever runs inside a
// single VS Code webview and the surface area is small.
(function () {
  const vscode = acquireVsCodeApi();

  const CELL_W = 56;
  const ROW_H = 30;
  const WAVE_HIGH_Y = 6;
  const WAVE_LOW_Y = ROW_H - 6;

  /** @type {{module: any, steps: Record<string,string>[], clockPeriodNs: number, hasClock: boolean, instances: any[]}} */
  let state = { module: { name: "", ports: [] }, steps: [], clockPeriodNs: 10, hasClock: false, instances: [] };
  /** @type {Array<{name:string, direction:string, width:number, values:string[]}>} */
  let lastSignals = [];

  const el = {
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    status: document.getElementById("status"),
    errorLog: document.getElementById("errorLog"),
    diagram: document.getElementById("diagram"),
    addCycle: document.getElementById("addCycle"),
    rerun: document.getElementById("rerun"),
    tabTiming: document.getElementById("tabTiming"),
    tabSchematic: document.getElementById("tabSchematic"),
    timingView: document.getElementById("timingView"),
    schematicView: document.getElementById("schematicView"),
    schematicCanvas: document.getElementById("schematicCanvas"),
  };

  el.addCycle.addEventListener("click", () => vscode.postMessage({ type: "addCycle" }));
  el.rerun.addEventListener("click", () => vscode.postMessage({ type: "rerun" }));

  function selectTab(tab) {
    const timing = tab === "timing";
    el.tabTiming.classList.toggle("active", timing);
    el.tabSchematic.classList.toggle("active", !timing);
    el.timingView.style.display = timing ? "" : "none";
    el.schematicView.style.display = timing ? "none" : "";
    if (!timing) renderSchematic();
  }
  el.tabTiming.addEventListener("click", () => selectTab("timing"));
  el.tabSchematic.addEventListener("click", () => selectTab("schematic"));

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "init":
        state = msg.state;
        lastSignals = [];
        render();
        break;
      case "status":
        setStatus(msg.message, msg.kind);
        break;
      case "result":
        if (msg.result.ok) {
          lastSignals = msg.result.signals;
          setStatus(`Simulated ${state.steps.length} ${state.hasClock ? "cycles" : "steps"}`, "ok");
          el.errorLog.style.display = "none";
        } else {
          setStatus("Simulation failed - see log below", "error");
          el.errorLog.style.display = "block";
          el.errorLog.textContent = msg.result.log;
        }
        renderValues();
        break;
      case "steps":
        state.steps = msg.steps;
        render();
        break;
    }
  });

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = kind || "";
  }

  function valueAt(signalName, stepIndex) {
    const sig = lastSignals.find((s) => s.name === signalName);
    if (sig) return sig.values[stepIndex] ?? "x";
    // No result yet: for inputs, show what's staged; outputs show unknown.
    return state.steps[stepIndex]?.[signalName] ?? "x";
  }

  function render() {
    el.title.textContent = state.module.name ? `module ${state.module.name}` : "No module";
    el.subtitle.textContent = state.hasClock
      ? `Clocked design - one column per clock cycle (${state.clockPeriodNs}ns period)`
      : "Combinational design - one column per time step";

    const n = state.steps.length;
    el.diagram.innerHTML = "";
    el.diagram.style.gridTemplateColumns = `190px repeat(${n}, ${CELL_W}px)`;

    // Header row.
    el.diagram.appendChild(makeDiv("row-label", ""));
    for (let i = 0; i < n; i++) {
      const header = makeDiv("header-cell", state.hasClock ? `cycle ${i}` : `t${i}`);
      if (n > 1) {
        const remove = document.createElement("span");
        remove.className = "remove";
        remove.textContent = "✕";
        remove.title = "Remove this column";
        remove.addEventListener("click", () => vscode.postMessage({ type: "removeStep", step: i }));
        header.appendChild(remove);
      }
      el.diagram.appendChild(header);
    }

    // The clock itself isn't shown - it's not editable and always samples
    // as a flat "1" (see sampleTimeForStep), so a row for it conveys
    // nothing beyond what the subtitle above already says.
    const inputs = state.module.ports.filter((p) => p.direction === "input" && !p.isClockLike);
    const outputs = state.module.ports.filter((p) => p.direction !== "input");

    for (const p of inputs) renderRow(p, true);
    for (const p of outputs) renderRow(p, false);

    renderValues();

    // Keep the diagram tab's content in sync even while it's hidden, so
    // switching to it never shows stale data from before a save/reparse.
    if (el.schematicView.style.display !== "none") renderSchematic();
  }

  function renderRow(port, editable) {
    const label = makeDiv("row-label", "");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = port.name;
    const dir = document.createElement("span");
    dir.className = `dir ${port.direction}`;
    dir.textContent = port.width > 1 ? `${port.direction} [${port.width - 1}:0]` : port.direction;
    label.appendChild(nameSpan);
    label.appendChild(dir);
    if (port.resetPolarity) {
      const reset = document.createElement("span");
      reset.className = "dir reset";
      reset.title =
        port.resetPolarity === "active-low"
          ? "Looks like an active-low reset: 0 = held in reset, 1 = running normally."
          : "Looks like an active-high reset: 1 = held in reset, 0 = running normally.";
      reset.textContent = port.resetPolarity === "active-low" ? "reset (low)" : "reset (high)";
      label.appendChild(reset);
    }
    el.diagram.appendChild(label);

    if (port.width === 1 && !editable) {
      // Read-only 1-bit output: waveform trace, no edit affordances.
      el.diagram.appendChild(makeWaveCell(port, false));
    } else if (port.width === 1) {
      el.diagram.appendChild(makeWaveCell(port, true));
    } else {
      const n = state.steps.length;
      for (let i = 0; i < n; i++) {
        el.diagram.appendChild(makeBusCell(port, i, editable));
      }
    }
  }

  function makeDiv(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function makeBusCell(port, stepIndex, editable) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const inner = document.createElement("div");
    inner.className = `bus-cell ${port.direction}` + (editable ? " editable" : "");
    inner.dataset.signal = port.name;
    inner.dataset.step = String(stepIndex);
    inner.textContent = "…";
    cell.appendChild(inner);
    if (editable) {
      inner.addEventListener("click", () => openInlineEditor(inner, port.name, stepIndex));
    }
    return cell;
  }

  function openInlineEditor(hostEl, signalName, stepIndex) {
    const current = state.steps[stepIndex]?.[signalName] ?? "0";
    const input = document.createElement("input");
    input.className = "cell-edit-input";
    input.value = current;
    hostEl.textContent = "";
    hostEl.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      const value = input.value.trim() || "0";
      vscode.postMessage({ type: "setValue", step: stepIndex, signal: signalName, value });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = current;
        input.blur();
      }
    });
    input.addEventListener("blur", commit, { once: true });
  }

  function makeWaveCell(port, editable) {
    const n = state.steps.length;
    const cell = document.createElement("div");
    cell.className = "cell wave-row";
    cell.style.gridColumn = `span ${n}`;
    const width = n * CELL_W;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "wave");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(ROW_H));
    svg.setAttribute("viewBox", `0 0 ${width} ${ROW_H}`);
    svg.dataset.signal = port.name;
    cell.appendChild(svg);
    return cell;
  }

  function renderValues() {
    // Bus cells.
    document.querySelectorAll(".bus-cell").forEach((elm) => {
      const div = /** @type {HTMLElement} */ (elm);
      if (div.querySelector("input")) return; // mid-edit, don't clobber
      const signal = div.dataset.signal;
      const step = Number(div.dataset.step);
      const value = valueAt(signal, step);
      div.textContent = value;
      div.classList.toggle("unknown", /[xz]/i.test(value));
    });

    // Wave (1-bit) rows.
    document.querySelectorAll("svg.wave").forEach((elm) => {
      const svg = /** @type {SVGSVGElement} */ (elm);
      const signal = svg.dataset.signal;
      const port = state.module.ports.find((p) => p.name === signal);
      const editable = port && port.direction === "input" && !port.isClockLike;
      drawWave(svg, signal, editable);
    });
  }

  function drawWave(svg, signalName, editable) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const n = state.steps.length;
    const values = [];
    for (let i = 0; i < n; i++) values.push(valueAt(signalName, i));

    const port = state.module.ports.find((p) => p.name === signalName);
    const isOutput = port && port.direction !== "input";

    let d = "";
    for (let i = 0; i < n; i++) {
      const x0 = i * CELL_W;
      const x1 = x0 + CELL_W;
      const y = values[i] === "1" ? WAVE_HIGH_Y : WAVE_LOW_Y;
      d += i === 0 ? `M ${x0} ${y} ` : ``;
      const prevY = i === 0 ? y : values[i - 1] === "1" ? WAVE_HIGH_Y : WAVE_LOW_Y;
      if (i > 0 && prevY !== y) {
        d += `L ${x0} ${prevY} L ${x0} ${y} `;
      } else if (i === 0) {
        d += "";
      }
      d += `L ${x1} ${y} `;
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "trace" + (isOutput ? " output" : ""));
    path.setAttribute("d", d.trim());
    svg.appendChild(path);

    if (editable) {
      for (let i = 0; i < n; i++) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "hit editable");
        rect.setAttribute("x", String(i * CELL_W));
        rect.setAttribute("y", "0");
        rect.setAttribute("width", String(CELL_W));
        rect.setAttribute("height", String(ROW_H));
        rect.addEventListener("click", () => openSvgEditor(svg, signalName, i));
        svg.appendChild(rect);
      }
    }
  }

  function openSvgEditor(svg, signalName, stepIndex) {
    const current = state.steps[stepIndex]?.[signalName] ?? "0";
    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", String(stepIndex * CELL_W + 2));
    fo.setAttribute("y", "2");
    fo.setAttribute("width", String(CELL_W - 4));
    fo.setAttribute("height", String(ROW_H - 4));
    const input = document.createElement("input");
    input.className = "cell-edit-input";
    input.value = current;
    fo.appendChild(input);
    svg.appendChild(fo);
    input.focus();
    input.select();
    const commit = () => {
      const value = input.value.trim() || "0";
      vscode.postMessage({ type: "setValue", step: stepIndex, signal: signalName, value });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = current;
        input.blur();
      }
    });
    input.addEventListener("blur", commit, { once: true });
  }

  // --- Diagram tab: a read-only structural view of the module and any
  // submodules it instantiates, built from parsing the source (no live
  // simulation values here - see instanceParser.ts for why this stays
  // structure-only rather than trying to show internal signal values).
  // Boxes are draggable purely for visual rearrangement; positions persist
  // for the life of the panel, keyed by a stable box id.

  /** @type {Record<string, {x: number, y: number}>} */
  const boxPositions = {};

  function ensurePosition(id, defaultX, defaultY) {
    if (!boxPositions[id]) {
      boxPositions[id] = { x: defaultX, y: defaultY };
    }
    return boxPositions[id];
  }

  function renderSchematic() {
    const canvas = el.schematicCanvas;
    canvas.innerHTML = "";

    if (!state.module.name) {
      canvas.appendChild(makeDiv("schematic-empty", "No module to show."));
      return;
    }

    const topPorts = state.module.ports;
    const topBox = makeSchematicBox("top", state.module.name, "top-level module", topPorts, true);
    const topPos = ensurePosition("top", 20, 20);
    positionBox(topBox, topPos);
    canvas.appendChild(topBox);

    if (state.instances.length === 0) {
      const hint = makeDiv(
        "schematic-empty",
        "This module doesn't instantiate any submodules - it's a single block."
      );
      hint.style.position = "absolute";
      hint.style.left = "20px";
      hint.style.top = "140px";
      canvas.appendChild(hint);
    } else {
      state.instances.forEach((inst, i) => {
        const ports = Object.keys(inst.connections).map((portName) => ({
          name: portName,
          // We don't know the submodule's own port directions (its source
          // isn't necessarily open/parsed) - shown neutrally instead of
          // guessing input/output.
          direction: "port",
          width: 1,
          netName: inst.connections[portName],
        }));
        const box = makeSchematicBox(
          `inst:${inst.instanceName}`,
          inst.instanceName,
          inst.moduleType,
          ports,
          false
        );
        const pos = ensurePosition(`inst:${inst.instanceName}`, 320, 20 + i * 170);
        positionBox(box, pos);
        canvas.appendChild(box);
      });
    }

    // Hovering any net-name label highlights every other label with the
    // same net name, across every box - the "trace the wire" interaction
    // that stands in for drawing an actual connecting line.
    canvas.querySelectorAll(".net-name").forEach((elm) => {
      elm.addEventListener("mouseenter", () => {
        const net = elm.dataset.net;
        canvas.querySelectorAll(`.net-name[data-net="${cssEscape(net)}"]`).forEach((m) => m.classList.add("highlight"));
      });
      elm.addEventListener("mouseleave", () => {
        const net = elm.dataset.net;
        canvas.querySelectorAll(`.net-name[data-net="${cssEscape(net)}"]`).forEach((m) => m.classList.remove("highlight"));
      });
    });
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  }

  function positionBox(box, pos) {
    box.style.left = `${pos.x}px`;
    box.style.top = `${pos.y}px`;
  }

  function makeSchematicBox(id, title, subtitle, ports, isTop) {
    const box = document.createElement("div");
    box.className = "schematic-box" + (isTop ? " top" : "");
    box.dataset.boxId = id;

    const titleEl = document.createElement("div");
    titleEl.className = "box-title";
    titleEl.textContent = title + " ";
    const sub = document.createElement("span");
    sub.className = "box-subtitle";
    sub.textContent = subtitle;
    titleEl.appendChild(sub);
    box.appendChild(titleEl);

    for (const port of ports) {
      const row = document.createElement("div");
      row.className = "schematic-port-row";

      const left = document.createElement("span");
      if (port.direction === "input" || port.direction === "output") {
        const dir = document.createElement("span");
        dir.className = `dir ${port.direction}`;
        dir.textContent = port.direction;
        left.appendChild(dir);
      }
      const nameSpan = document.createElement("span");
      nameSpan.className = "port-name";
      nameSpan.textContent = port.name;
      left.appendChild(nameSpan);
      row.appendChild(left);

      // Top-level ports are the net itself (their own name); instance
      // ports show what net they're wired to.
      const netLabel = document.createElement("span");
      netLabel.className = "net-name";
      const netName = isTop ? port.name : port.netName || "(unconnected)";
      netLabel.textContent = netName;
      netLabel.dataset.net = netName;
      row.appendChild(netLabel);

      box.appendChild(row);
    }

    makeDraggable(box, titleEl);
    return box;
  }

  function makeDraggable(box, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = box.getBoundingClientRect();
      const canvasRect = el.schematicCanvas.getBoundingClientRect();
      originX = rect.left - canvasRect.left + el.schematicCanvas.scrollLeft;
      originY = rect.top - canvasRect.top + el.schematicCanvas.scrollTop;
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
      const id = box.dataset.boxId;
      if (id && boxPositions[id]) {
        boxPositions[id].x = x;
        boxPositions[id].y = y;
      }
    });
  }

  vscode.postMessage({ type: "ready" });
})();
