import * as vscode from "vscode";
import { parseModule } from "../simulation/portParser";
import { simulate } from "../simulation/icarusRunner";
import { buildDefaultSteps, backfillSteps } from "../simulation/defaultSteps";
import { parseInstances, ModuleInstance } from "../simulation/instanceParser";
import { ParsedModule, SimStep } from "../simulation/types";

interface ClientState {
  module: { name: string; ports: ParsedModule["ports"] };
  steps: SimStep[];
  clockPeriodNs: number;
  hasClock: boolean;
  /** Submodule instances found in the source, for the read-only diagram tab. */
  instances: ModuleInstance[];
}

const CLOCK_PERIOD_NS = 10;
// Collapses a burst of rapid cell edits (e.g. typing several values in
// quick succession) into a single simulate() call instead of spawning an
// iverilog+vvp process per keystroke - each run only takes ~15ms even for
// the workshop's largest design (see docs/toolchain-notes.md), so this is
// about not wasting CPU on results that are about to be superseded, not
// about the runs themselves being slow.
const SET_VALUE_DEBOUNCE_MS = 150;

export class SimulatorPanel {
  private static readonly panels = new Map<string, SimulatorPanel>();

  private readonly panel: vscode.WebviewPanel;
  private module: ParsedModule;
  private steps: SimStep[];
  private disposed = false;
  // Monotonic token so that if edits queue several simulations, a slow
  // earlier run can't overwrite the result of a newer one that finished
  // first (each simulate() call is an independent iverilog+vvp process).
  private simGeneration = 0;
  private setValueDebounce: ReturnType<typeof setTimeout> | undefined;

  static async show(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    defaultCycles: number
  ): Promise<void> {
    const key = document.uri.toString();
    const existing = SimulatorPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const module = parseModule(document.getText());
    if (!module) {
      void vscode.window.showErrorMessage(
        "Veriscode couldn't find a `module ... (...);` declaration to simulate in this file."
      );
      return;
    }
    if (module.ports.length === 0) {
      void vscode.window.showWarningMessage(
        `Module "${module.name}" has no ports - nothing to drive or observe.`
      );
    }

    const panel = vscode.window.createWebviewPanel(
      "veriscode.simulator",
      `Simulate: ${module.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    const instance = new SimulatorPanel(context, panel, document, module, defaultCycles);
    SimulatorPanel.panels.set(key, instance);
    panel.onDidDispose(() => {
      SimulatorPanel.panels.delete(key);
      instance.disposed = true;
    });
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    private document: vscode.TextDocument,
    module: ParsedModule,
    defaultCycles: number
  ) {
    this.panel = panel;
    this.module = module;
    this.steps = buildDefaultSteps(module, Math.max(1, defaultCycles));
    this.panel.webview.html = this.renderHtml();

    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.toString() === this.document.uri.toString()) {
        this.reparseAndRerun();
      }
    });
    this.panel.onDidDispose(() => {
      saveListener.dispose();
      if (this.setValueDebounce) {
        clearTimeout(this.setValueDebounce);
      }
    });
  }

  private hasClock(): boolean {
    return this.module.ports.some((p) => p.isClockLike && p.direction === "input");
  }

  private post(message: unknown): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private clientState(): ClientState {
    return {
      module: { name: this.module.name, ports: this.module.ports },
      steps: this.steps,
      clockPeriodNs: CLOCK_PERIOD_NS,
      hasClock: this.hasClock(),
      instances: parseInstances(this.module.sourceText),
    };
  }

  private async handleMessage(msg: any): Promise<void> {
    switch (msg?.type) {
      case "ready":
        this.post({ type: "init", state: this.clientState() });
        await this.runSimulation();
        break;
      case "setValue": {
        const step = this.steps[msg.step];
        if (step) {
          step[msg.signal] = msg.value;
          this.scheduleSimulation();
        }
        break;
      }
      case "addCycle": {
        const last = this.steps[this.steps.length - 1] ?? {};
        this.steps.push({ ...last });
        this.post({ type: "steps", steps: this.steps });
        await this.runSimulation();
        break;
      }
      case "removeStep": {
        if (this.steps.length > 1) {
          this.steps.splice(msg.step, 1);
          this.post({ type: "steps", steps: this.steps });
          await this.runSimulation();
        }
        break;
      }
      case "rerun":
        await this.runSimulation();
        break;
    }
  }

  private reparseAndRerun(): void {
    const reparsed = parseModule(this.document.getText());
    if (!reparsed) {
      this.post({ type: "status", message: "Module declaration not found after save.", kind: "error" });
      return;
    }
    this.module = reparsed;
    // Keep user-entered values for ports that still exist; drop the rest;
    // fill in a sensible default for any newly-introduced port (editing
    // the file to add an input mid-session must not leave a step with a
    // missing value - see backfillSteps).
    const validNames = new Set(reparsed.ports.map((p) => p.name));
    this.steps = this.steps.map((step) => {
      const filtered: SimStep = {};
      for (const [k, v] of Object.entries(step)) {
        if (validNames.has(k)) filtered[k] = v;
      }
      return filtered;
    });
    backfillSteps(reparsed, this.steps);
    this.post({ type: "init", state: this.clientState() });
    void this.runSimulation();
  }

  /** Debounced entry point for high-frequency triggers (cell edits). */
  private scheduleSimulation(): void {
    if (this.setValueDebounce) {
      clearTimeout(this.setValueDebounce);
    }
    this.setValueDebounce = setTimeout(() => {
      this.setValueDebounce = undefined;
      void this.runSimulation();
    }, SET_VALUE_DEBOUNCE_MS);
  }

  private async runSimulation(): Promise<void> {
    const generation = ++this.simGeneration;
    this.post({ type: "status", message: "Simulating…", kind: "running" });
    const config = vscode.workspace.getConfiguration("veriscode.simulator");
    const result = await simulate(this.module, this.document.uri.fsPath, this.steps, CLOCK_PERIOD_NS, {
      extensionPath: this.context.extensionPath,
      iverilogOverride: config.get<string>("icarusPath"),
      vvpOverride: config.get<string>("vvpPath"),
    });
    // Drop this result if a newer simulation was kicked off while we ran -
    // its result is the one that matches the current steps/module state.
    if (generation !== this.simGeneration) {
      return;
    }
    this.post({ type: "result", result });
  }

  private renderHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css")
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Veriscode Simulator</title>
</head>
<body>
  <h1 id="title">module</h1>
  <p class="subtitle" id="subtitle"></p>
  <div class="tabs">
    <button class="tab active" id="tabTiming" data-tab="timing">Timing Diagram</button>
    <button class="tab" id="tabSchematic" data-tab="schematic">Diagram</button>
  </div>
  <div id="timingView">
    <div class="toolbar">
      <button id="addCycle">+ Cycle</button>
      <button class="secondary" id="rerun">Re-run</button>
      <span id="status"></span>
    </div>
    <pre id="errorLog"></pre>
    <div class="diagram-scroll">
      <div class="diagram" id="diagram"></div>
    </div>
    <p class="legend">Click any input cell to type a value (e.g. 0, 1, x, 4'hA, 3'b101). Outputs update automatically.</p>
  </div>
  <div id="schematicView" style="display:none">
    <p class="legend">Drag boxes to rearrange. Hover a net name to highlight every place it's connected.</p>
    <div class="schematic-canvas" id="schematicCanvas"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
