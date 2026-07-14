(function () {
  const vscode = acquireVsCodeApi();

  const el = {
    newProject: document.getElementById("newProject"),
    activeSection: document.getElementById("activeSection"),
    emptySection: document.getElementById("emptySection"),
    moduleName: document.getElementById("moduleName"),
    fileName: document.getElementById("fileName"),
    portList: document.getElementById("portList"),
    simulate: document.getElementById("simulate"),
  };

  el.newProject.addEventListener("click", () => vscode.postMessage({ type: "newProject" }));
  el.simulate.addEventListener("click", () => vscode.postMessage({ type: "simulate" }));

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "activeModule") {
      render(msg);
    }
  });

  function render(msg) {
    if (!msg.module) {
      el.activeSection.style.display = "none";
      el.emptySection.style.display = "block";
      el.emptySection.textContent = msg.fileName
        ? `No module found in ${msg.fileName}.`
        : "Open a .sv file to see it here.";
      return;
    }
    el.emptySection.style.display = "none";
    el.activeSection.style.display = "block";
    el.moduleName.textContent = `module ${msg.module.name}`;
    el.fileName.textContent = msg.fileName || "";
    el.portList.innerHTML = "";
    for (const port of msg.module.ports) {
      const li = document.createElement("li");
      const width = port.width > 1 ? ` [${port.width - 1}:0]` : "";
      const resetBadge = port.resetPolarity
        ? ` <span class="dir reset">reset (${port.resetPolarity})</span>`
        : "";
      li.innerHTML = `<span class="dir ${port.direction}">${port.direction}</span> ${port.name}${width}${resetBadge}`;
      el.portList.appendChild(li);
    }
  }

  vscode.postMessage({ type: "ready" });
})();
