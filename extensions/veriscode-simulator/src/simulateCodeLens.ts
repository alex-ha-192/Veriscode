import * as vscode from "vscode";

const MODULE_DECL = /^\s*module\s+[A-Za-z_][A-Za-z0-9_$]*/;

export class SimulateCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      if (MODULE_DECL.test(text)) {
        const range = new vscode.Range(line, 0, line, text.length);
        lenses.push(
          new vscode.CodeLens(range, {
            title: "▶ Simulate",
            command: "veriscode.simulate",
            arguments: [document.uri],
          })
        );
      }
    }
    return lenses;
  }
}
