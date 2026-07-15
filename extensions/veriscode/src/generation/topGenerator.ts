import { PortDirection } from "../simulation/types";

export interface ComposerTopPort {
  name: string;
  direction: PortDirection;
  /** 1 for a scalar port, >1 for a packed vector. */
  width: number;
}

export interface ComposerConnection {
  portName: string;
  direction: PortDirection;
  width: number;
  /** The net name the user wired this port to; "" (or whitespace) means leave unconnected. */
  netName: string;
}

export interface ComposerInstanceSpec {
  instanceName: string;
  moduleType: string;
  connections: ComposerConnection[];
}

export interface ComposerSpec {
  topName: string;
  topPorts: ComposerTopPort[];
  instances: ComposerInstanceSpec[];
}

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function declRange(width: number): string {
  return width > 1 ? `[${width - 1}:0] ` : "";
}

const DIRECTION_KEYWORD: Record<PortDirection, string> = {
  input: "input ",
  output: "output",
  inout: "inout ",
};

/**
 * Turns a GUI-composed netlist (top-level ports + a set of submodule
 * instances with per-port net-name wiring) into real, readable
 * SystemVerilog source - the same instantiation syntax a student would
 * otherwise have to hand-write and get exactly right. Deliberately simple
 * formatting (no column alignment beyond the direction keyword): Verible's
 * formatter is one save away if a student wants it prettier, and matching
 * the existing "teaching subset, not a full toolchain" scope, this
 * function does no width/type checking of its own - iverilog is the
 * source of truth for whether the wiring is actually correct.
 */
export function generateTopModule(spec: ComposerSpec): string {
  const portLines = spec.topPorts.map(
    (p) => `  ${DIRECTION_KEYWORD[p.direction]} logic ${declRange(p.width)}${p.name}`
  );

  const topPortNames = new Set(spec.topPorts.map((p) => p.name));

  // Internal nets: any non-blank net name used in a connection that isn't
  // itself a top-level port (those wire straight to the port, no separate
  // `logic` declaration needed). Keeps first-seen width for a given net;
  // a genuine width mismatch across instances is a wiring bug the student
  // will see when they simulate, not something this generator polices.
  const internalNets = new Map<string, number>();
  for (const inst of spec.instances) {
    for (const conn of inst.connections) {
      const net = conn.netName.trim();
      if (!net || topPortNames.has(net)) continue;
      if (!internalNets.has(net)) {
        internalNets.set(net, conn.width);
      }
    }
  }

  const netDeclLines: string[] = [];
  if (internalNets.size > 0) {
    const byWidth = new Map<number, string[]>();
    for (const [net, width] of internalNets) {
      if (!byWidth.has(width)) byWidth.set(width, []);
      byWidth.get(width)!.push(net);
    }
    for (const [width, names] of [...byWidth.entries()].sort((a, b) => a[0] - b[0])) {
      netDeclLines.push(`  logic ${declRange(width)}${names.join(", ")};`);
    }
  }

  const instanceBlocks = spec.instances.map((inst) => {
    const connLines = inst.connections.map((conn) => `    .${conn.portName}(${conn.netName.trim()})`);
    const body = connLines.length > 0 ? `\n${connLines.join(",\n")}\n  ` : "";
    return `  ${inst.moduleType} ${inst.instanceName} (${body});`;
  });

  const parts = [`module ${spec.topName} (`, portLines.join(",\n"), ");"];
  if (netDeclLines.length > 0) {
    parts.push("", netDeclLines.join("\n"));
  }
  if (instanceBlocks.length > 0) {
    parts.push("", instanceBlocks.join("\n\n"));
  }
  parts.push("endmodule", "");

  return parts.join("\n");
}

/**
 * Server-side re-check of a spec built by the composer webview. The
 * webview does its own validation for immediate feedback, but the
 * extension host re-validates before touching disk - the client state is
 * just a message payload, not a trusted source of truth. Returns a list
 * of human-readable problems; an empty list means the spec is safe to
 * generate.
 */
export function validateComposerSpec(spec: ComposerSpec, availableModuleTypes: Set<string>): string[] {
  const errors: string[] = [];

  const topName = spec.topName.trim();
  if (!topName) {
    errors.push("Give the top module a name.");
  } else if (!IDENTIFIER.test(topName)) {
    errors.push(`"${topName}" isn't a valid SystemVerilog identifier (letters, digits, underscore; can't start with a digit).`);
  }

  const seenPortNames = new Set<string>();
  for (const p of spec.topPorts) {
    const name = p.name.trim();
    if (!IDENTIFIER.test(name)) {
      errors.push(`Top-level port "${p.name}" isn't a valid identifier.`);
    } else if (seenPortNames.has(name)) {
      errors.push(`Top-level port "${name}" is declared more than once.`);
    }
    seenPortNames.add(name);
    if (!Number.isInteger(p.width) || p.width < 1) {
      errors.push(`Top-level port "${name}" has an invalid width.`);
    }
  }

  if (spec.instances.length === 0) {
    errors.push("Add at least one module instance before generating.");
  }

  const seenInstanceNames = new Set<string>();
  for (const inst of spec.instances) {
    const name = inst.instanceName.trim();
    if (!IDENTIFIER.test(name)) {
      errors.push(`Instance name "${inst.instanceName}" isn't a valid identifier.`);
    } else if (seenInstanceNames.has(name)) {
      errors.push(`Instance name "${name}" is used more than once.`);
    }
    seenInstanceNames.add(name);

    if (!availableModuleTypes.has(inst.moduleType)) {
      errors.push(`"${inst.moduleType}" (instance "${inst.instanceName}") isn't one of the modules found in this folder.`);
    }

    for (const conn of inst.connections) {
      const net = conn.netName.trim();
      if (net && !IDENTIFIER.test(net)) {
        errors.push(`"${inst.instanceName}.${conn.portName}" is wired to "${net}", which isn't a valid net name.`);
      }
    }
  }

  return errors;
}
