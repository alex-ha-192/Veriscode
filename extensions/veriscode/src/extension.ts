import * as vscode from "vscode";
import { newProjectCommand } from "./newProject";
import { composeTopCommand } from "./composeTop";
import { SimulateCodeLensProvider } from "./simulateCodeLens";
import { SimulatorPanel } from "./webview/panel";
import { SidebarViewProvider } from "./webview/sidebarView";
import { VeribleLinter, formatWithVerible } from "./veribleLint";
import { isSystemVerilogDoc } from "./isSystemVerilogDoc";

export function activate(context: vscode.ExtensionContext): void {
  const linter = new VeribleLinter(context);
  context.subscriptions.push(linter);

  for (const doc of vscode.workspace.textDocuments) {
    if (isSystemVerilogDoc(doc)) {
      void linter.lint(doc);
    }
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, new SidebarViewProvider(context)),

    vscode.commands.registerCommand("veriscode.newProject", () => newProjectCommand(context)),

    vscode.commands.registerCommand("veriscode.composeTop", (uri?: vscode.Uri) => composeTopCommand(context, uri)),

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
    ),

    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isSystemVerilogDoc(doc)) {
        void linter.lint(doc);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const cfg = vscode.workspace.getConfiguration("veriscode.verible");
      if (isSystemVerilogDoc(doc) && cfg.get<boolean>("lintOnSave", true)) {
        void linter.lint(doc);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const cfg = vscode.workspace.getConfiguration("veriscode.verible");
      if (isSystemVerilogDoc(e.document) && cfg.get<boolean>("lintOnType", true)) {
        linter.scheduleLint(e.document, 500);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => linter.clear(doc.uri)),
    vscode.languages.registerDocumentFormattingEditProvider(
      [{ language: "systemverilog" }, { language: "verilog" }],
      {
        async provideDocumentFormattingEdits(document) {
          const formatted = await formatWithVerible(context, document);
          if (formatted === undefined) {
            return [];
          }
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          return [vscode.TextEdit.replace(fullRange, formatted)];
        },
      }
    ),
    vscode.workspace.onWillSaveTextDocument((e) => {
      const cfg = vscode.workspace.getConfiguration("veriscode.verible");
      if (isSystemVerilogDoc(e.document) && cfg.get<boolean>("formatOnSave", false)) {
        e.waitUntil(
          vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            e.document.uri
          )
        );
      }
    })
  );
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions handle cleanup.
}
