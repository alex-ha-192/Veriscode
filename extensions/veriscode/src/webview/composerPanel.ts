import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { LibraryModule } from "../generation/moduleLibrary";
import { ComposerSpec, generateTopModule, validateComposerSpec } from "../generation/topGenerator";
import { getNonce, contentSecurityPolicy } from "./webviewUtils";
import { DisposableWebviewPanel } from "./disposableWebviewPanel";

interface ClientLibraryModule {
  name: string;
  ports: { name: string; direction: string; width: number }[];
}

interface ClientState {
  folderName: string;
  library: ClientLibraryModule[];
}

/**
 * A GUI for building a top-level module out of modules the student has
 * already written, without hand-writing instantiation syntax: pick modules
 * from a palette, drag them onto a canvas, wire ports to net names, declare
 * the top module's own ports, then Generate writes out real, readable
 * SystemVerilog. This is the "connect things together" complement to the
 * read-only Logical Schematic view in the simulator panel - that one
 * visualizes an existing module's structure, this one produces a new file.
 */
export class ComposerPanel extends DisposableWebviewPanel {
  private static current: ComposerPanel | undefined;

  static async show(context: vscode.ExtensionContext, folder: string, library: LibraryModule[]): Promise<void> {
    if (ComposerPanel.current && !ComposerPanel.current.disposed) {
      ComposerPanel.current.refresh(folder, library);
      ComposerPanel.current.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "veriscode.composer",
      "Build Top Module",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    const instance = new ComposerPanel(context, panel, folder, library);
    ComposerPanel.current = instance;
    panel.onDidDispose(() => {
      if (ComposerPanel.current === instance) {
        ComposerPanel.current = undefined;
      }
    });
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    private folder: string,
    private library: LibraryModule[]
  ) {
    super(panel);
    this.panel.webview.html = this.renderHtml();
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
  }

  private refresh(folder: string, library: LibraryModule[]): void {
    this.folder = folder;
    this.library = library;
    this.post({ type: "init", state: this.clientState() });
  }

  private clientState(): ClientState {
    return {
      folderName: path.basename(this.folder) || this.folder,
      library: this.library.map((m) => ({
        name: m.module.name,
        ports: m.module.ports.map((p) => ({ name: p.name, direction: p.direction, width: p.width })),
      })),
    };
  }

  private async handleMessage(msg: any): Promise<void> {
    switch (msg?.type) {
      case "ready":
        this.post({ type: "init", state: this.clientState() });
        break;
      case "generate":
        await this.handleGenerate(msg.spec as ComposerSpec);
        break;
    }
  }

  private async handleGenerate(spec: ComposerSpec): Promise<void> {
    const availableModuleTypes = new Set(this.library.map((m) => m.module.name));
    const errors = validateComposerSpec(spec, availableModuleTypes);
    if (errors.length > 0) {
      this.post({ type: "generateResult", ok: false, errors });
      return;
    }

    const topName = spec.topName.trim();

    // Refuse to silently clobber a module the student already built - that
    // file may be depended on by other modules in this folder. A generic
    // top-level scratch file with a name collision gets a normal
    // overwrite prompt below; an existing *building block* gets a hard
    // stop instead, since overwriting it could quietly break other work.
    if (availableModuleTypes.has(topName)) {
      this.post({
        type: "generateResult",
        ok: false,
        errors: [`"${topName}" is already the name of one of your existing modules - choose a different name for the top module.`],
      });
      return;
    }

    const sv = generateTopModule({ ...spec, topName });
    const targetPath = path.join(this.folder, `${topName}.sv`);

    if (fs.existsSync(targetPath)) {
      const choice = await vscode.window.showWarningMessage(
        `"${topName}.sv" already exists in this folder. Overwrite it?`,
        { modal: true },
        "Overwrite"
      );
      if (choice !== "Overwrite") {
        this.post({ type: "generateResult", ok: false, errors: ["Cancelled - a file with that name already exists."] });
        return;
      }
    }

    try {
      fs.writeFileSync(targetPath, sv, "utf8");
    } catch (err: any) {
      this.post({ type: "generateResult", ok: false, errors: [`Couldn't write the file: ${err?.message ?? err}`] });
      return;
    }

    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
    this.post({ type: "generateResult", ok: true, fileName: `${topName}.sv` });
  }

  private renderHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "composer.js")
    );
    const dragUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "schematicCanvas.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css")
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(webview, nonce)}" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Build Top Module</title>
</head>
<body>
  <h1>Build Top Module</h1>
  <p class="subtitle" id="subtitle"></p>

  <div class="composer-layout">
    <div class="composer-palette" id="palette">
      <h2>Your Modules</h2>
      <div id="paletteList"></div>
      <p class="legend">Click a module to add it to the canvas.</p>
    </div>

    <div class="composer-main">
      <div class="toolbar">
        <label class="top-name-label">
          Top module name
          <input type="text" id="topName" class="top-name-input" value="top" />
        </label>
        <button id="addPort">+ Top-Level Port</button>
        <button id="generate">Generate SystemVerilog</button>
      </div>
      <pre id="errorLog" class="composer-errors"></pre>
      <p id="successLog" class="composer-success" style="display:none"></p>
      <p class="legend">
        Click a module in the palette to add an instance. Type net names into the boxes on
        the right side of each port to wire things together - two ports with the same net
        name are connected. A port wired to a top-level port name connects straight through.
      </p>
      <div class="schematic-canvas" id="canvas"></div>
    </div>
  </div>

  <script nonce="${nonce}" src="${dragUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
