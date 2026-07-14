import * as vscode from "vscode";

export function isSystemVerilogDoc(document: vscode.TextDocument): boolean {
  return document.languageId === "systemverilog" || document.languageId === "verilog";
}
