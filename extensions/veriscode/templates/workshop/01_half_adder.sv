// STAGE 1: Half Adder
//
// The simplest possible piece of arithmetic hardware. It adds two single
// bits (a + b) and produces a 1-bit sum plus a carry-out bit for when the
// result needs 2 bits to represent (1 + 1 = 10 in binary).
//
//   a  b | sum  carry
//   0  0 |  0     0
//   0  1 |  1     0
//   1  0 |  1     0
//   1  1 |  0     1     <- sum alone can't represent "2"
//
// Click ▶ Simulate above, then click the "sum" and "carry" cells to try
// different a/b combinations and watch the truth table for yourself.
module half_adder (
  input  logic a,
  input  logic b,
  output logic sum,
  output logic carry
);

  // TODO: sum should be 1 whenever exactly one of a, b is 1 (this is
  // exactly what the XOR operator ^ does).
  assign sum = 1'b0;

  // TODO: carry should be 1 only when BOTH a and b are 1 (this is
  // exactly what the AND operator & does).
  assign carry = 1'b0;

endmodule
