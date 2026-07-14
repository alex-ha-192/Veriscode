import { ParsedModule, SimStep } from "./types";

/**
 * Reset-like ports (see Port.resetPolarity) get a one-cycle reset pulse
 * followed by release, rather than every input defaulting to "0" - a
 * design with an active-low reset held at 0 forever never does anything
 * observable, which reads as "the simulator is broken" on first use. All
 * other inputs still default to "0"; every cell stays freely editable
 * regardless of these starting values.
 */
export function buildDefaultSteps(module: ParsedModule, count: number): SimStep[] {
  const inputs = module.ports.filter((p) => p.direction === "input" && !p.isClockLike);
  const steps: SimStep[] = [];
  for (let i = 0; i < count; i++) {
    const step: SimStep = {};
    for (const p of inputs) {
      if (p.resetPolarity) {
        const asserted = p.resetPolarity === "active-low" ? "0" : "1";
        const deasserted = p.resetPolarity === "active-low" ? "1" : "0";
        step[p.name] = i === 0 ? asserted : deasserted;
      } else {
        step[p.name] = "0";
      }
    }
    steps.push(step);
  }
  return steps;
}
