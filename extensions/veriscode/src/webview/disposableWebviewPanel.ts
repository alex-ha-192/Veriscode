import * as vscode from "vscode";

/**
 * Shared plumbing for this extension's webview panels: tracks whether the
 * underlying vscode.WebviewPanel has been disposed and guards
 * postMessage() against firing after that - VS Code throws if you post to
 * a disposed webview, and every panel here (SimulatorPanel, ComposerPanel)
 * needs the same guard, so it lives in one place instead of being
 * reimplemented per class.
 */
export abstract class DisposableWebviewPanel {
  protected disposed = false;

  protected constructor(protected readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => {
      this.disposed = true;
    });
  }

  protected post(message: unknown): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage(message);
    }
  }
}
