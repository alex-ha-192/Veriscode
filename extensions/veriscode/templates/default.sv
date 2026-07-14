// Welcome to Veriscode!
//
// This is a small synchronous counter. Click the ▶ Simulate button above
// (or run "Veriscode: Simulate" from the command palette) to open an
// interactive timing diagram: click any input cell to try out values for
// "en" and "rst_n" at each clock cycle, and watch "count" react live.
module counter #(
  parameter WIDTH = 8
) (
  input  logic             clk,
  input  logic             rst_n,
  input  logic             en,
  output logic [WIDTH-1:0] count
);

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      count <= '0;
    end else if (en) begin
      count <= count + 1'b1;
    end
  end

endmodule
