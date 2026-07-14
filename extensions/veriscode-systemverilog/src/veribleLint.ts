import * as cp from "child_process";
import * as vscode from "vscode";
import { resolveBinary } from "./toolchain";

// Tolerant parser for verible-verilog-lint's "file:line:col: message [rule]"
// style output. We deliberately don't hard-require the trailing bracketed
// rule tag since exact formatting has drifted across Verible releases -
// file/line/col/message is all a Diagnostic strictly needs.
const DIAG_LINE = /^(.*?):(\d+):(\d+):\s*(.*)$/;
const RULE_TAG = /\[([\w.:-]+)\]\s*$/;

export class VeribleLinter {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.collection = vscode.languages.createDiagnosticCollection("verible");
    context.subscriptions.push(this.collection);
  }

  dispose(): void {
    this.collection.dispose();
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
  }

  scheduleLint(document: vscode.TextDocument, debounceMs: number): void {
    if (!isSystemVerilogDoc(document)) {
      return;
    }
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.lint(document);
      }, debounceMs)
    );
  }

  async lint(document: vscode.TextDocument): Promise<void> {
    if (!isSystemVerilogDoc(document) || document.uri.scheme !== "file") {
      return;
    }

    const config = vscode.workspace.getConfiguration("veriscode.verible");
    const binPath = resolveBinary(
      this.context,
      "verible-verilog-lint",
      config.get<string>("path")
    );
    if (!binPath) {
      return; // Silently skip: no bundled/PATH binary available.
    }

    const disabledRules = config.get<string[]>("disabledRules") ?? [];
    const args = [document.uri.fsPath];
    for (const rule of disabledRules) {
      args.push(`--rules=-${rule}`);
    }

    let output: string;
    try {
      output = await runCapture(binPath, args);
    } catch (err) {
      // Verible exits non-zero when it finds lint violations; that's
      // expected and still produces usable stdout/stderr, so only bail
      // out on a genuine spawn failure (e.g. binary missing/unexecutable).
      if (err instanceof SpawnFailure) {
        return;
      }
      output = (err as RunFailure).combinedOutput;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    for (const line of output.split(/\r?\n/)) {
      const match = DIAG_LINE.exec(line.trim());
      if (!match) {
        continue;
      }
      const [, file, lineStr, colStr, rawMessage] = match;
      if (!document.uri.fsPath.endsWith(file) && file !== document.uri.fsPath) {
        continue;
      }
      const lineNo = Math.max(0, parseInt(lineStr, 10) - 1);
      const colNo = Math.max(0, parseInt(colStr, 10) - 1);
      const ruleMatch = RULE_TAG.exec(rawMessage);
      const message = rawMessage.trim();
      const range = new vscode.Range(lineNo, colNo, lineNo, colNo + 1);
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = "verible";
      if (ruleMatch) {
        diagnostic.code = ruleMatch[1];
      }
      diagnostics.push(diagnostic);
    }

    this.collection.set(document.uri, diagnostics);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }
}

export function isSystemVerilogDoc(document: vscode.TextDocument): boolean {
  return document.languageId === "systemverilog" || document.languageId === "verilog";
}

class SpawnFailure extends Error {}
class RunFailure extends Error {
  constructor(public readonly combinedOutput: string) {
    super("verible-verilog-lint reported issues");
  }
}

function runCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("error", () => reject(new SpawnFailure("failed to launch verible-verilog-lint")));
    child.on("close", (code) => {
      const combined = out + err;
      if (code === 0) {
        resolve(combined);
      } else {
        reject(new RunFailure(combined));
      }
    });
  });
}

export async function formatWithVerible(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration("veriscode.verible");
  const binPath = resolveBinary(context, "verible-verilog-format", config.get<string>("path"));
  if (!binPath) {
    return undefined;
  }
  try {
    return await runCapture(binPath, [document.uri.fsPath]);
  } catch (err) {
    if (err instanceof RunFailure) {
      return undefined;
    }
    return undefined;
  }
}
