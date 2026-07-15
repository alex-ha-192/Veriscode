import { stripComments } from "./portParser";

export interface ModuleInstance {
  /** The type of module being instantiated, e.g. "half_adder". */
  moduleType: string;
  /** The instance name, e.g. "ha0". */
  instanceName: string;
  /** Port name -> the expression connected to it, e.g. {a: "sum0"}. */
  connections: Record<string, string>;
}

// Instantiation only ever appears at the structural (module) level, never
// inside a procedural block - stripping begin/end (and function/task)
// bodies first means the instance regex below never has to worry about
// `unique case (...)`, `if (...)`, or similar looking superficially
// similar ("word word (...)"). This also happens to be a correct
// simplification, not just a safety net: SV genuinely disallows module
// instantiation inside procedural code.
function stripProceduralBlocks(text: string): string {
  // Single pass with a stack of open "begin" positions: whenever an "end"
  // pops the stack back to empty, that span (from its outermost begin to
  // this end) is a whole top-level procedural block, nested begin/end
  // pairs included - removing it whole has the same result as hollowing
  // it out from the inside, without the repeated whole-string re-scans
  // that would take.
  const TOKEN = /\b(begin|end)\b/g;
  const spans: { start: number; end: number }[] = [];
  const openStack: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m[1] === "begin") {
      openStack.push(m.index);
    } else if (openStack.length > 0) {
      const beginIdx = openStack.pop()!;
      if (openStack.length === 0) {
        spans.push({ start: beginIdx, end: m.index + m[0].length });
      }
    }
  }

  let result = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    result = result.slice(0, spans[i].start) + " " + result.slice(spans[i].end);
  }
  // function..endfunction / task..endtask bodies (rare in this curriculum,
  // but stripped for the same reason).
  result = result.replace(/\bfunction\b[\s\S]*?\bendfunction\b/g, " ");
  result = result.replace(/\btask\b[\s\S]*?\bendtask\b/g, " ");
  return result;
}

const NOT_A_MODULE_TYPE = new Set([
  "if", "else", "for", "while", "case", "casex", "casez", "unique", "priority",
  "always", "always_ff", "always_comb", "always_latch", "initial", "final",
  "assign", "wire", "logic", "reg", "input", "output", "inout", "parameter",
  "localparam", "generate", "endgenerate", "module", "endmodule", "function",
  "endfunction", "task", "endtask", "typedef", "struct", "enum", "packed",
  "signed", "unsigned", "return",
]);

/**
 * Finds module instantiations at the structural level of `moduleBodyText`
 * (everything between the port list and `endmodule`). Deliberately a
 * heuristic, not a full parser - used only to draw the read-only diagram
 * view, never for simulation, so an occasional miss just means an
 * instance doesn't show up in the picture rather than anything breaking.
 */
export function parseInstances(moduleBodyText: string): ModuleInstance[] {
  const clean = stripProceduralBlocks(stripComments(moduleBodyText));
  const instances: ModuleInstance[] = [];

  // <ModuleType> [#(params)] <instanceName> ( .port(conn), .port2(conn2) ) ;
  const INSTANCE = /\b([A-Za-z_]\w*)\s*(#\s*\([^;]*?\))?\s+([A-Za-z_]\w*)\s*\(((?:[^()]|\([^()]*\))*)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = INSTANCE.exec(clean)) !== null) {
    const [, moduleType, , instanceName, portList] = m;
    if (NOT_A_MODULE_TYPE.has(moduleType) || NOT_A_MODULE_TYPE.has(instanceName)) {
      continue;
    }
    // Named port connections only (.port(conn)) - positional (Verilog-1995
    // style) instantiation isn't supported, matching the rest of this
    // codebase's "teaching subset" scope.
    const connections: Record<string, string> = {};
    const PORT_CONN = /\.(\w+)\s*\(\s*([^()]*?)\s*\)/g;
    let pm: RegExpExecArray | null;
    let anyNamedConnection = false;
    while ((pm = PORT_CONN.exec(portList)) !== null) {
      connections[pm[1]] = pm[2];
      anyNamedConnection = true;
    }
    if (!anyNamedConnection) {
      continue; // Not recognizably an instantiation (e.g. a plain function call).
    }
    instances.push({ moduleType, instanceName, connections });
  }

  return instances;
}
