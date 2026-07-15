import * as vscode from "vscode";

/** A fresh per-render nonce, used to scope the CSP's script-src to exactly the inline <script> tag we emit. */
export function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/** The single CSP shape shared by every webview in this extension: no fetches, only our own images/styles, and only the nonce'd script. */
export function contentSecurityPolicy(webview: vscode.Webview, nonce: string): string {
  return `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
}
