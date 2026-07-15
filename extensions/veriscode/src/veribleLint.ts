import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { resolveBinary } from "./toolchain";
import { isSystemVerilogDoc } from "./isSystemVerilogDoc";

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
      this.context.extensionPath,
      "verible-verilog-lint",
      config.get<string>("path")
    );
    if (!binPath) {
      return; // Silently skip: no bundled/PATH binary available.
    }

    const disabledRules = config.get<string[]>("disabledRules") ?? [];
    const ruleFlags = disabledRules.map((rule) => `--rules=-${rule}`);

    // Lint the current *buffer* contents, not the on-disk file - otherwise
    // "lint as you type" would report against the last saved version, with
    // stale positions and messages. Verible runs against a temp copy of the
    // live text (see runOnBufferText).
    let output: string;
    try {
      output = await runOnBufferText(binPath, document, ruleFlags);
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
      // The reported file path is the temp copy, not the real document -
      // but we only ever lint one file per run, so every diagnostic line
      // belongs to this document. No path filtering needed.
      const [, , lineStr, colStr, rawMessage] = match;
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
    child.on("error", () => reject(new SpawnFailure(`failed to launch ${bin}`)));
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

/**
 * Runs a Verible tool against the document's *current in-memory text*
 * rather than its on-disk file, by writing the live buffer to a temp copy
 * (with a matching extension) and pointing the tool at that. This keeps
 * lint-as-you-type and Format Document correct even when the buffer has
 * unsaved edits - pointing Verible at the on-disk path would otherwise
 * lint/format the last saved version, and (for format, whose result
 * replaces the whole buffer) silently discard the unsaved edits.
 */
async function runOnBufferText(
  bin: string,
  document: vscode.TextDocument,
  extraArgs: string[]
): Promise<string> {
  const ext = path.extname(document.uri.fsPath) || (document.languageId === "verilog" ? ".v" : ".sv");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-verible-"));
  const tempPath = path.join(dir, `buffer${ext}`);
  try {
    fs.writeFileSync(tempPath, document.getText(), "utf8");
    return await runCapture(bin, [tempPath, ...extraArgs]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function formatWithVerible(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration("veriscode.verible");
  const binPath = resolveBinary(context.extensionPath, "verible-verilog-format", config.get<string>("path"));
  if (!binPath) {
    return undefined;
  }
  try {
    // Format the live buffer text, not the on-disk file - see runOnBufferText.
    return await runOnBufferText(binPath, document, []);
  } catch {
    // Either the binary couldn't launch (SpawnFailure) or verible-verilog-format
    // rejected the input, e.g. a syntax error (RunFailure). In both cases we
    // simply make no edits rather than surfacing a formatter error.
    return undefined;
  }
}
