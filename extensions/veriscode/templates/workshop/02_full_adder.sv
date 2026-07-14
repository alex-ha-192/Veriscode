// STAGE 2: Full Adder
//
// A half_adder can only add two bits. A full_adder adds THREE bits (a, b,
// and a carry-in from a previous, less-significant bit) - which is what
// you need to chain adders together into a wider adder. This is your
// first *multi-module* design: it builds a full adder out of two
// half_adders, wired together.
//
// (This file and half_adder.sv both live in this project folder - that's
// the whole trick to using one module inside another in Veriscode: just
// save them next to each other.)
module full_adder (
  input  logic a,
  input  logic b,
  input  logic cin,
  output logic sum,
  output logic cout
);

  logic sum0, carry0, carry1;

  // First half adder: adds a + b.
  half_adder ha0 (.a(a), .b(b), .sum(sum0), .carry(carry0));

  // Second half adder: adds that result to the carry-in.
  half_adder ha1 (.a(sum0), .b(cin), .sum(sum), .carry(carry1));

  // TODO: cout should be 1 if EITHER half adder produced a carry - that's
  // exactly what the OR operator | does.
  assign cout = 1'b0;

endmodule
