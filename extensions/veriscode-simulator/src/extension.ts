import * as vscode from "vscode";
import { newProjectCommand } from "./newProject";
import { SimulateCodeLensProvider } from "./simulateCodeLens";
import { SimulatorPanel } from "./webview/panel";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("veriscode.newProject", () => newProjectCommand(context)),

    vscode.commands.registerCommand("veriscode.simulate", async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showErrorMessage("Open a SystemVerilog file to simulate.");
        return;
      }
      const document = await vscode.workspace.openTextDocument(targetUri);
      const cycles = vscode.workspace
        .getConfiguration("veriscode.simulator")
        .get<number>("defaultCycles", 8);
      await SimulatorPanel.show(context, document, cycles);
    }),

    vscode.languages.registerCodeLensProvider(
      [{ language: "systemverilog" }, { language: "verilog" }],
      new SimulateCodeLensProvider()
    )
  );
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions handle cleanup.
}
