// Solution reference for the workshop's capstone stage - kept as a
// permanent CI-tested fixture so the curriculum can't silently rot.
module simple_cpu (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       load_en,
  input  logic [3:0] load_addr,
  input  logic [7:0] load_instr,
  output logic [3:0] pc,
  output logic [7:0] acc,
  output logic [7:0] ir,
  output logic       halted
);
  localparam logic [3:0] OP_NOP  = 4'b0000;
  localparam logic [3:0] OP_LDA  = 4'b0001;
  localparam logic [3:0] OP_ADD  = 4'b0010;
  localparam logic [3:0] OP_SUB  = 4'b0011;
  localparam logic [3:0] OP_STA  = 4'b0100;
  localparam logic [3:0] OP_JMP  = 4'b0101;
  localparam logic [3:0] OP_JZ   = 4'b0110;
  localparam logic [3:0] OP_HALT = 4'b1111;

  logic [7:0] mem [0:15];

  // A tiny demo program: ACC = mem[8] + mem[9], store it at mem[10], halt.
  initial begin
    mem[0]  = {OP_LDA,  4'd8};
    mem[1]  = {OP_ADD,  4'd9};
    mem[2]  = {OP_STA,  4'd10};
    mem[3]  = {OP_HALT, 4'd0};
    mem[8]  = 8'd3;
    mem[9]  = 8'd5;
  end

  assign ir = mem[pc];
  wire [3:0] opcode = ir[7:4];
  wire [3:0] addr   = ir[3:0];

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      pc     <= 4'd0;
      acc    <= 8'd0;
      halted <= 1'b0;
    end else if (load_en) begin
      // Writing directly into memory while the CPU is paused/halted is
      // how you "plug in" your own program from the simulator's grid.
      mem[load_addr] <= load_instr;
    end else if (!halted) begin
      case (opcode)
        OP_LDA:  begin acc <= mem[addr]; pc <= pc + 1'b1; end
        OP_ADD:  begin acc <= acc + mem[addr]; pc <= pc + 1'b1; end
        OP_SUB:  begin acc <= acc - mem[addr]; pc <= pc + 1'b1; end
        OP_STA:  begin mem[addr] <= acc; pc <= pc + 1'b1; end
        OP_JMP:  begin pc <= addr; end
        OP_JZ:   begin pc <= (acc == 8'd0) ? addr : pc + 1'b1; end
        OP_HALT: begin halted <= 1'b1; end
        default: begin pc <= pc + 1'b1; end // NOP and anything unrecognized
      endcase
    end
  end
endmodule
