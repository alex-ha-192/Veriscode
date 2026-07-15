// STAGE 4: Register
//
// Everything so far has been *combinational* - the output reacts
// instantly to the inputs, with no memory. A register is different: it
// *remembers* a value across clock cycles. This one loads a new value
// only when `en` (enable) is high; otherwise it just keeps whatever it
// was already holding. `rst_n` clears it back to 0 (active-low: 0 means
// "reset now", 1 means "run normally" - the sidebar/simulator will show
// this port with a "reset" badge for exactly that reason).
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
      // TODO: when enabled, q should load the value on d.
      q <= q;
    end
    // (no else needed: if rst_n is high and en is low, q just keeps its
    // current value automatically - that's what "remembering" means.)
  end

endmodule
