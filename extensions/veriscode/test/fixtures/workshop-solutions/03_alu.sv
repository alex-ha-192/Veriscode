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
      OP_SUB:  result = a - b;
      OP_AND:  result = a & b;
      OP_OR:   result = a | b;
      default: result = 4'b0000;
    endcase
  end

  assign zero = (result == 4'b0000);
endmodule
