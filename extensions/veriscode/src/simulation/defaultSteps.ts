import { ParsedModule, Port, SimStep } from "./types";

/**
 * The default value for one input port at one step index. Reset-like
 * ports (see Port.resetPolarity) get a one-cycle reset pulse followed by
 * release, rather than defaulting to "0" for every cycle - a design with
 * an active-low reset held at 0 forever never does anything observable,
 * which reads as "the simulator is broken" on first use. Every other
 * input defaults to "0". Cells stay freely editable regardless.
 */
function defaultValueFor(port: Port, stepIndex: number): string {
  if (port.resetPolarity) {
    const asserted = port.resetPolarity === "active-low" ? "0" : "1";
    const deasserted = port.resetPolarity === "active-low" ? "1" : "0";
    return stepIndex === 0 ? asserted : deasserted;
  }
  return "0";
}

export function buildDefaultSteps(module: ParsedModule, count: number): SimStep[] {
  const inputs = module.ports.filter((p) => p.direction === "input" && !p.isClockLike);
  const steps: SimStep[] = [];
  for (let i = 0; i < count; i++) {
    const step: SimStep = {};
    for (const p of inputs) {
      step[p.name] = defaultValueFor(p, i);
    }
    steps.push(step);
  }
  return steps;
}

/**
 * Fills in a default value for any input port missing from a step (e.g.
 * a new port introduced by editing+saving the file while a simulation
 * panel is already open, where existing steps predate that port) -
 * mutates each step in place. Without this, a step lacking a value for
 * some port would reach the testbench generator as `undefined`.
 */
export function backfillSteps(module: ParsedModule, steps: SimStep[]): void {
  const inputs = module.ports.filter((p) => p.direction === "input" && !p.isClockLike);
  steps.forEach((step, i) => {
    for (const p of inputs) {
      if (!(p.name in step)) {
        step[p.name] = defaultValueFor(p, i);
      }
    }
  });
}
