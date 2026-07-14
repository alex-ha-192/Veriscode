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

  assign rdata1 = regs[raddr1];
  assign rdata2 = regs[raddr2];
endmodule
