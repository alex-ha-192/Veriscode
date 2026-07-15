// STAGE 3: ALU (Arithmetic Logic Unit)
//
// Every CPU has an ALU: a block that takes two numbers (a, b) and an
// "opcode" telling it which operation to perform, and produces a result.
// This one supports 4 operations, picked with a 2-bit op code. It also
// reports a "zero" flag - true whenever the result is exactly 0, which a
// CPU can later use to decide whether to jump (see simple_cpu.sv).
module alu (
  input  logic [3:0] a,
  input  logic [3:0] b,
  input  logic [1:0] op,
  output logic [3:0] result,
  output logic       zero
);

  localparam logic [1:0] OP_ADD = 2'b00;
  localparam logic [1:0] OP_SUB = 2'b01;
  localparam logic [1:0] OP_AND = 2'b10;
  localparam logic [1:0] OP_OR  = 2'b11;

  always_comb begin
    case (op)
      OP_ADD:  result = a + b;
      // TODO: OP_SUB should work just like OP_ADD above, but subtract b
      // from a instead of adding it.
      OP_SUB:  result = 4'b0000;
      OP_AND:  result = a & b;
      OP_OR:   result = a | b;
      default: result = 4'b0000;
    endcase
  end

  assign zero = (result == 4'b0000);

endmodule
