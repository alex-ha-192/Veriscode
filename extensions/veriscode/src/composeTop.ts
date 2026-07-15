import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { listModulesInFolder } from "./generation/moduleLibrary";
import { ComposerPanel } from "./webview/composerPanel";

/**
 * Entry point for "Veriscode: Build Top Module (GUI)". Resolves the folder
 * of already-written modules to compose from - either the folder the
 * command was invoked on (right-click in Explorer) or, absent that, a
 * folder the user picks, defaulting near whatever file is currently open -
 * then opens the composer webview on it.
 */
export async function composeTopCommand(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  let folder: string | undefined;

  if (uri) {
    try {
      const stat = fs.statSync(uri.fsPath);
      folder = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
    } catch {
      folder = undefined;
    }
  }

  if (!folder) {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const defaultUri = activeUri ? vscode.Uri.file(path.dirname(activeUri.fsPath)) : undefined;
    const picked = await vscode.window.showOpenDialog({
      title: "Choose the folder with the SystemVerilog modules to build from",
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Use This Folder",
      defaultUri,
    });
    if (!picked || picked.length === 0) {
      return;
    }
    folder = picked[0].fsPath;
  }

  const library = listModulesInFolder(folder);
  if (library.length === 0) {
    void vscode.window.showWarningMessage(
      `No SystemVerilog modules found in "${path.basename(folder)}". Build a few modules first, then compose them here.`
    );
    return;
  }

  await ComposerPanel.show(context, folder, library);
}
