export type PortDirection = "input" | "output" | "inout";

export interface Port {
  name: string;
  direction: PortDirection;
  /** Raw packed-dimension text as written, e.g. "[7:0]", or undefined for a 1-bit port. */
  packedRange?: string;
  /** Bit width, resolved from literal bounds or a parameter's literal default; a generic fallback otherwise. */
  width: number;
  /** True if `width` came from a genuinely resolved expression rather than the unresolved fallback. */
  widthResolved: boolean;
  /** Safe "[N-1:0]"-style range to use when declaring a same-width variable outside the DUT (e.g. in a testbench). */
  declRange?: string;
  /** True if this port looks like a free-running clock (name matches clk/clock). */
  isClockLike: boolean;
  /** Best-effort guess at reset semantics from the name, used only to pick sane default step values. */
  resetPolarity?: "active-low" | "active-high";
}

export interface ParsedModule {
  name: string;
  ports: Port[];
  sourceText: string;
}

/** One column of the timing diagram: a map of input port name -> SystemVerilog value literal. */
export type SimStep = Record<string, string>;

export interface SimulationRequest {
  modulePath: string;
  module: ParsedModule;
  /** Ordered list of steps (cycles for clocked designs, time-steps otherwise). */
  steps: SimStep[];
  clockPeriodNs: number;
}

export interface WaveformSignal {
  name: string;
  direction: PortDirection;
  width: number;
  /** One value string per step, aligned 1:1 with the request's `steps` array. */
  values: string[];
}

export interface SimulationResult {
  ok: boolean;
  /** Raw compiler/simulator stderr+stdout, shown to the user on failure. */
  log: string;
  signals: WaveformSignal[];
}
