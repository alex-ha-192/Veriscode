import { ParsedModule, Port, PortDirection } from "./types";

const CLOCK_NAME = /^(clk|clock)(_[a-z0-9]+)?$/i;

// A reset "core" token: optional a (async) / n (negated) prefix, "rst" or
// "reset", optional trailing n. Matches rst, rstn, nrst, arst, reset,
// resetn, nreset, aresetn - but NOT data ports that merely *contain* the
// substring (burst, first, worst), because it's anchored to a whole
// underscore-delimited token rather than matched anywhere in the name.
const RESET_CORE = /^(a)?(n)?(rst|reset)(n)?$/;
// A separate polarity-suffix token, e.g. the "n" in rst_n, "ni" in rst_ni,
// "b" (bar) in reset_b.
const RESET_POLARITY_SUFFIX = /^(n|ni|nn|b)$/;

/**
 * Best-effort reset detection from a port name, purely for picking sane
 * *default* step values (see buildDefaultSteps) and an informational
 * badge - never a hard constraint, since every cell stays freely editable
 * regardless. Returns undefined for non-reset-looking names.
 */
export function detectResetPolarity(name: string): "active-low" | "active-high" | undefined {
  const tokens = name.toLowerCase().split("_").filter(Boolean);
  let coreIdx = -1;
  let coreMatch: RegExpExecArray | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const m = RESET_CORE.exec(tokens[i]);
    if (m) {
      coreIdx = i;
      coreMatch = m;
      break;
    }
  }
  if (!coreMatch) return undefined;

  const negatedPrefix = !!coreMatch[2]; // nrst / nreset
  const negatedSuffix = !!coreMatch[4]; // rstn / resetn
  const nextToken = tokens[coreIdx + 1];
  const suffixPolarity = nextToken !== undefined && RESET_POLARITY_SUFFIX.test(nextToken); // rst_n / reset_b
  const activeLow = negatedPrefix || negatedSuffix || suffixPolarity;
  return activeLow ? "active-low" : "active-high";
}

/**
 * Strips // and /* *\/ comments while preserving line structure (so later
 * line/col reasoning, if ever needed, stays accurate).
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

/** Finds the span of a balanced (...) block starting at the first "(" at or after `from`. */
function matchParens(text: string, from: number): { start: number; end: number } | null {
  const start = text.indexOf("(", from);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

/** Splits `text` on top-level commas, ignoring commas nested in (), [] or {}. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length > 0) parts.push(cur);
  return parts;
}

/**
 * Extracts `parameter NAME = <int literal>` defaults from a `#( ... )`
 * block (or anywhere in the source, as a fallback). Only literal-integer
 * defaults are resolved; anything more exotic is simply left out of the
 * map, and expressions that need it fail to resolve (safe fallback).
 */
export function parseParamDefaults(src: string): Record<string, number> {
  const defaults: Record<string, number> = {};
  const re = /\bparameter\s+(?:\w+\s+)?([A-Za-z_][A-Za-z0-9_$]*)\s*=\s*(-?\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    defaults[m[1]] = Number(m[2]);
  }
  return defaults;
}

/** Tiny recursive-descent evaluator for +,-,*,/ integer expressions with parens and identifiers. */
function evalExpr(expr: string, params: Record<string, number>): number | null {
  const tokens = expr.match(/\d+|[A-Za-z_][A-Za-z0-9_$]*|[()+\-*/]/g);
  if (!tokens) return null;
  let pos = 0;
  let failed = false;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parsePrimary(): number {
    const tok = next();
    if (tok === undefined) {
      failed = true;
      return 0;
    }
    if (tok === "(") {
      const v = parseAdd();
      if (peek() === ")") next();
      else failed = true;
      return v;
    }
    if (tok === "-") {
      return -parsePrimary();
    }
    if (/^\d+$/.test(tok)) {
      return Number(tok);
    }
    if (tok in params) {
      return params[tok];
    }
    failed = true;
    return 0;
  }

  function parseMul(): number {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parsePrimary();
      v = op === "*" ? v * rhs : Math.trunc(v / rhs);
    }
    return v;
  }

  function parseAdd(): number {
    let v = parseMul();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseMul();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = parseAdd();
  return failed || pos !== tokens.length ? null : result;
}

function widthOfRange(range: string | undefined, params: Record<string, number>): number | null {
  if (!range) return 1;
  const m = /\[\s*([^:\]]+?)\s*:\s*([^\]]+?)\s*\]/.exec(range);
  if (!m) return 1;
  const hi = evalExpr(m[1], params);
  const lo = evalExpr(m[2], params);
  if (hi === null || lo === null) {
    return null; // genuinely unresolved (e.g. a parameter with no literal default)
  }
  return Math.abs(hi - lo) + 1;
}

const DIRECTIONS: PortDirection[] = ["input", "output", "inout"];
const TYPE_KEYWORDS = new Set([
  "logic", "wire", "reg", "bit", "byte", "shortint", "int", "longint",
  "integer", "time", "signed", "unsigned", "tri", "wand", "wor",
]);

const UNRESOLVED_WIDTH_FALLBACK = 32;

function parsePortDecl(
  decl: string,
  carry: { direction: PortDirection },
  params: Record<string, number>
): Port[] {
  const tokens = decl.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  let idx = 0;
  if (DIRECTIONS.includes(tokens[0] as PortDirection)) {
    carry.direction = tokens[0] as PortDirection;
    idx = 1;
  }
  // Skip type/signing keywords (logic, wire, signed, etc.) and net-type "var".
  while (idx < tokens.length && (TYPE_KEYWORDS.has(tokens[idx]) || tokens[idx] === "var")) {
    idx++;
  }

  // What remains is: optional [packed range] name1 [unpacked], name2, ...
  // We already split on top-level commas at the call site, so there is a
  // single name here (possibly with a leading packed range attached).
  const rest = tokens.slice(idx).join(" ");
  const rangeMatch = /^\s*(\[[^\]]*\])\s*/.exec(rest);
  const packedRange = rangeMatch ? rangeMatch[1] : undefined;
  const afterRange = rangeMatch ? rest.slice(rangeMatch[0].length) : rest;
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_$]*)/.exec(afterRange.trim());
  if (!nameMatch) return [];
  const name = nameMatch[1];

  const resolved = widthOfRange(packedRange, params);
  const width = resolved ?? UNRESOLVED_WIDTH_FALLBACK;
  const declRange = width > 1 ? `[${width - 1}:0]` : undefined;
  const resetPolarity = detectResetPolarity(name);

  return [
    {
      name,
      direction: carry.direction,
      packedRange,
      width,
      widthResolved: resolved !== null,
      declRange,
      isClockLike: CLOCK_NAME.test(name),
      resetPolarity,
    },
  ];
}

/**
 * Parses the first ANSI-style module header found in `src`. Supports the
 * common subset used in teaching examples: `module name #(params) (ports);`
 * with input/output/inout, logic/reg/wire/bit types, and packed ranges.
 * Not a full SystemVerilog parser - non-ANSI (separate port + declaration)
 * modules are out of scope.
 */
export function parseModule(src: string): ParsedModule | null {
  const clean = stripComments(src);
  const moduleMatch = /\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)/.exec(clean);
  if (!moduleMatch) return null;
  const name = moduleMatch[1];

  let cursor = moduleMatch.index + moduleMatch[0].length;

  // Optional #( parameter list ) before the port list - skip it.
  const afterName = clean.slice(cursor);
  const hashIdx = afterName.search(/\S/);
  let portListSearchFrom = cursor;
  if (hashIdx !== -1 && afterName[hashIdx] === "#") {
    const paramBlock = matchParens(clean, cursor);
    if (paramBlock) {
      portListSearchFrom = paramBlock.end + 1;
    }
  }

  const portBlock = matchParens(clean, portListSearchFrom);
  if (!portBlock) {
    return { name, ports: [], sourceText: src };
  }
  const portListText = clean.slice(portBlock.start + 1, portBlock.end);
  const params = parseParamDefaults(clean.slice(moduleMatch.index, portBlock.end));

  const ports: Port[] = [];
  const carry = { direction: "input" as PortDirection };
  for (const rawDecl of splitTopLevel(portListText)) {
    const decl = rawDecl.trim();
    if (!decl) continue;
    ports.push(...parsePortDecl(decl, carry, params));
  }

  return { name, ports, sourceText: src };
}
