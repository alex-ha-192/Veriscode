import * as vscode from "vscode";
import { VeribleLinter, isSystemVerilogDoc, formatWithVerible } from "./veribleLint";

export function activate(context: vscode.ExtensionContext): void {
  const linter = new VeribleLinter(context);
  context.subscriptions.push(linter);

  const lintOpenDocs = () => {
    for (const doc of vscode.workspace.textDocuments) {
      if (isSystemVerilogDoc(doc)) {
        void linter.lint(doc);
      }
    }
  };
  lintOpenDocs();

  context.subscriptions.push(
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
