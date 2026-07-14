module full_adder (
  input  logic a,
  input  logic b,
  input  logic cin,
  output logic sum,
  output logic cout
);
  logic sum0, carry0, carry1;

  half_adder ha0 (.a(a), .b(b), .sum(sum0), .carry(carry0));
  half_adder ha1 (.a(sum0), .b(cin), .sum(sum), .carry(carry1));

  assign cout = carry0 | carry1;
endmodule
