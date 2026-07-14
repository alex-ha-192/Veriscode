import * as vscode from "vscode";
import { parseModule } from "../simulation/portParser";
import { isSystemVerilogDoc } from "../isSystemVerilogDoc";

/**
 * A PlatformIO-style Activity Bar panel: quick actions (New Project,
 * Simulate) plus a live summary of whichever SystemVerilog module is
 * currently active. The actual interactive timing diagram still opens as
 * its own editor-area panel (SimulatorPanel) rather than living in this
 * sidebar - a wide per-cycle grid doesn't fit usefully in a narrow
 * sidebar, so this view is a launcher/status hub in front of it, the way
 * PlatformIO's sidebar is a task list in front of its full-tab PIO Home.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "veriscode.home";

  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.pushActiveModule()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.pushActiveModule();
        }
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg?.type) {
        case "ready":
          this.pushActiveModule();
          break;
        case "newProject":
          void vscode.commands.executeCommand("veriscode.newProject");
          break;
        case "simulate":
          void vscode.commands.executeCommand("veriscode.simulate");
          break;
      }
    });
  }

  private pushActiveModule(): void {
    if (!this.view) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSystemVerilogDoc(editor.document)) {
      this.view.webview.postMessage({ type: "activeModule", fileName: null, module: null });
      return;
    }
    const fileName = editor.document.uri.path.split("/").pop() ?? editor.document.uri.fsPath;
    const module = parseModule(editor.document.getText());
    this.view.webview.postMessage({
      type: "activeModule",
      fileName,
      module: module ? { name: module.name, ports: module.ports } : null,
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "sidebar.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "sidebar.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Veriscode</title>
</head>
<body>
  <button id="newProject">+ New SystemVerilog Project</button>

  <h2>Active File</h2>
  <div id="emptySection">Open a .sv file to see it here.</div>
  <div id="activeSection" style="display:none">
    <div class="module-name" id="moduleName"></div>
    <div class="file-name" id="fileName"></div>
    <ul id="portList"></ul>
    <button id="simulate" class="secondary">▶ Simulate</button>
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
