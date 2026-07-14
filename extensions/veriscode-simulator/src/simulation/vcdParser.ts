export interface VcdVar {
  id: string;
  name: string;
  width: number;
}

export interface VcdChange {
  timeNs: number;
  id: string;
  value: string;
}

export interface ParsedVcd {
  vars: VcdVar[];
  changes: VcdChange[];
  timescaleNs: number;
}

/** Parses `$timescale <n> <unit> $end` into a nanosecond multiplier. */
function parseTimescale(text: string): number {
  const m = /\$timescale\s+(\d+)\s*(fs|ps|ns|us|ms|s)\s*\$end/.exec(text);
  if (!m) return 1;
  const n = Number(m[1]);
  const unit = m[2];
  const toNs: Record<string, number> = { fs: 1e-6, ps: 1e-3, ns: 1, us: 1e3, ms: 1e6, s: 1e9 };
  return n * toNs[unit];
}

/**
 * Minimal VCD (Value Change Dump) parser covering scalar and vector
 * $var declarations plus b/r/x-style value changes - everything Icarus
 * Verilog's $dumpvars output uses.
 */
export function parseVcd(text: string): ParsedVcd {
  const vars: VcdVar[] = [];
  const changes: VcdChange[] = [];
  const timescaleNs = parseTimescale(text);

  let currentTimeNs = 0;
  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    if (line.startsWith("$var")) {
      // $var wire 8 " count [7:0] $end
      const parts = line.split(/\s+/);
      // parts: $var <type> <width> <id> <name...> $end
      const width = Number(parts[2]);
      const id = parts[3];
      const nameParts: string[] = [];
      for (let i = 4; i < parts.length; i++) {
        if (parts[i] === "$end") break;
        nameParts.push(parts[i]);
      }
      const name = nameParts.join(" ").replace(/\s*\[.*\]$/, "");
      vars.push({ id, name, width: Number.isFinite(width) ? width : 1 });
      continue;
    }

    if (line.startsWith("#")) {
      const t = Number(line.slice(1));
      if (Number.isFinite(t)) {
        currentTimeNs = t * timescaleNs;
      }
      continue;
    }

    if (line[0] === "b" || line[0] === "B") {
      const [bits, id] = line.slice(1).split(/\s+/);
      if (id) {
        changes.push({ timeNs: currentTimeNs, id, value: formatBinary(bits) });
      }
      continue;
    }

    if (line[0] === "r" || line[0] === "R") {
      const [val, id] = line.slice(1).split(/\s+/);
      if (id) {
        changes.push({ timeNs: currentTimeNs, id, value: val });
      }
      continue;
    }

    // Scalar change: <value><id> with no space, e.g. "1!" or "x#".
    const scalarMatch = /^([01xXzZ])(\S+)$/.exec(line);
    if (scalarMatch) {
      changes.push({ timeNs: currentTimeNs, id: scalarMatch[2], value: scalarMatch[1] });
    }
  }

  return { vars, changes, timescaleNs };
}

function formatBinary(bits: string): string {
  if (/[xX]/.test(bits)) return "x";
  if (/[zZ]/.test(bits)) return "z";
  if (bits.length === 0) return "0";
  return String(parseInt(bits, 2));
}

/**
 * Samples the value of each variable at (or immediately before) each of the
 * requested `sampleTimesNs`, returning one value string per sample time.
 */
export function sampleSignal(parsed: ParsedVcd, varId: string, sampleTimesNs: number[]): string[] {
  const changesForVar = parsed.changes
    .filter((c) => c.id === varId)
    .sort((a, b) => a.timeNs - b.timeNs);

  const result: string[] = [];
  let cursor = 0;
  let lastValue = "x";
  for (const t of sampleTimesNs) {
    while (cursor < changesForVar.length && changesForVar[cursor].timeNs <= t) {
      lastValue = changesForVar[cursor].value;
      cursor++;
    }
    result.push(lastValue);
  }
  return result;
}
