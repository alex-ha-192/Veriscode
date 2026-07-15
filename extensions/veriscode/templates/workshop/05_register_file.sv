// STAGE 5: Register File
//
// A CPU needs more than one register to work with - this is a small bank
// of 4 registers (numbered 0-3), each 8 bits wide. You can write to one
// register per clock cycle (`we` + `waddr` + `wdata`), and read from two
// registers at once, instantly (`raddr1`/`raddr2` -> `rdata1`/`rdata2`) -
// real CPUs read two operands per instruction (e.g. "add register 1 to
// register 2"), which is exactly why there are two read ports.
module register_file (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       we,
  input  logic [1:0] waddr,
  input  logic [7:0] wdata,
  input  logic [1:0] raddr1,
  input  logic [1:0] raddr2,
  output logic [7:0] rdata1,
  output logic [7:0] rdata2
);

  // Four 8-bit registers, indexed like an array: regs[0], regs[1], ...
  logic [7:0] regs [0:3];

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      regs[0] <= 8'd0;
      regs[1] <= 8'd0;
      regs[2] <= 8'd0;
      regs[3] <= 8'd0;
    end else if (we) begin
      regs[waddr] <= wdata;
    end
  end

  // TODO: rdata1 should show whichever register raddr1 points at
  // (regs[raddr1]), and rdata2 should show whichever register raddr2
  // points at - array indexing works just like it did for `regs[waddr]`
  // above.
  assign rdata1 = 8'd0;
  assign rdata2 = 8'd0;

endmodule
