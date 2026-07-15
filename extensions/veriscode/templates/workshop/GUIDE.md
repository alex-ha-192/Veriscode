# Build a Simple CPU

Welcome! By the end of this workshop you'll have built a working 8-bit
CPU, one small piece at a time - starting from a circuit with just two
inputs and ending with something that runs actual programs.

No previous hardware design experience needed. Budget **1-2 hours**.

## How each stage works

Every file below is a `module` you can simulate on its own - open it,
click **▶ Simulate** above the module (or the same button in the
Veriscode sidebar), and an interactive timing diagram opens beside your
code. Click any blue **input** cell to type a value; **output** cells
update automatically. Add more cycles with **+ Cycle**.

Each file has one or two spots marked `// TODO` - that's the only code
you need to write. Everything compiles and simulates *before* you touch
the TODOs too, so you'll always see *something* happen when you click
Simulate - just not the right thing yet. Fix the TODO, click **Re-run**,
and check the diagram again.

Verible (the linter built into Veriscode) will also underline anything
that doesn't parse - if a TODO turns red, that's a hint your edit isn't
valid SystemVerilog yet, not that the concept is wrong.

## The stages

| # | File | What it adds | ~Time |
|---|------|---------------|-------|
| 1 | `01_half_adder.sv` | Your first circuit: add two bits with `^` and `&`. | 10 min |
| 2 | `02_full_adder.sv` | Combine two half adders - your first *multi-module* design. | 15 min |
| 3 | `03_alu.sv` | An ALU: pick an operation (ADD/SUB/AND/OR) with an opcode. | 15 min |
| 4 | `04_register.sv` | Your first *sequential* circuit - a value that persists across clock cycles. | 15 min |
| 5 | `05_register_file.sv` | A small bank of registers, addressed like an array. | 15 min |
| 6 | `06_simple_cpu.sv` | The capstone: wires a memory, program counter, and ALU-like logic into a real CPU. | 20-30 min |

Work through them in order - each stage either directly reuses the
previous one's ideas, or (for the full adder) its actual module.

## Stage 6: running your own program

`06_simple_cpu.sv` starts with a tiny built-in program (it computes
3 + 5 and halts) so you can see it work immediately. Once your TODOs are
fixed, try writing your own:

1. Set `load_en` high and put an instruction byte in `load_instr` with
   its address in `load_addr` for one cycle - it gets written straight
   into memory, no recompiling.
2. Repeat for each instruction (and any data values) your program needs.
3. Set `load_en` back to low and watch `pc`/`acc`/`halted` step through
   it, exactly like the built-in demo.

The instruction set is in the comment at the top of the file: `LDA`,
`ADD`, `SUB`, `STA`, `JMP`, `JZ`, `HALT`. Try writing a program that
counts down from a starting value to zero using `SUB` and `JZ`.

## Tips for running this as a class

- **Live-code stage 1 together first** (2-3 minutes) so everyone sees the
  Simulate button, the timing diagram, and the click-to-edit cells before
  working solo - that's the entire tool to learn, and it transfers to
  every later stage unchanged.
- Stages 1-3 are pure combinational logic (no clock) - the diagram shows
  one column per time step. Stages 4-6 are clocked - one column per clock
  cycle, and a reset pulse is pre-loaded in cycle 0 automatically.
- If someone finishes early, the natural extension is: add a new opcode
  to the CPU (e.g. `INC` - increment acc without touching memory), or a
  third read port to the register file.
