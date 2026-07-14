module register (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       en,
  input  logic [7:0] d,
  output logic [7:0] q
);
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q <= 8'd0;
    end else if (en) begin
      q <= d;
    end
  end
endmodule
