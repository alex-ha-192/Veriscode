// STAGE 6: A Simple CPU
//
// This ties everything together into a tiny but real, working CPU. It
// has one accumulator register (acc), a program counter (pc) that walks
// through memory one instruction at a time, and a 16-word memory shared
// between instructions and data. Each instruction is 8 bits: the top 4
// bits are the opcode, the bottom 4 bits are an address.
//
//   LDA addr   acc <= mem[addr]              ("load")
//   ADD addr   acc <= acc + mem[addr]
//   SUB addr   acc <= acc - mem[addr]
//   STA addr   mem[addr] <= acc              ("store")
//   JMP addr   pc <= addr                    (unconditional jump)
//   JZ  addr   pc <= addr, but only if acc is 0
//   HALT       stop
//
// A tiny demo program is preloaded below: it computes mem[8] + mem[9] and
// stores the result at mem[10], then halts. Click ▶ Simulate and watch
// `acc` climb to 8 (3 + 5) over a few cycles, then `halted` go high.
//
// Once that works, try WRITING YOUR OWN PROGRAM: set `load_en` high in
// the simulator grid, put an instruction byte in `load_instr` and its
// address in `load_addr`, and it gets written straight into memory on
// the next clock edge - no recompiling needed. That's how you "plug in"
// a program interactively, the same way you'd load a real program into
// memory.
module simple_cpu (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       load_en,
  input  logic [3:0] load_addr,
  input  logic [7:0] load_instr,
  output logic [3:0] pc,
  output logic [7:0] acc,
  output logic [7:0] ir,       // the instruction currently at mem[pc]
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

  // Demo program: LDA 8; ADD 9; STA 10; HALT.  mem[8]=3, mem[9]=5.
  initial begin
    mem[0] = {OP_LDA,  4'd8};
    mem[1] = {OP_ADD,  4'd9};
    mem[2] = {OP_STA,  4'd10};
    mem[3] = {OP_HALT, 4'd0};
    mem[8] = 8'd3;
    mem[9] = 8'd5;
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
      mem[load_addr] <= load_instr;
    end else if (!halted) begin
      case (opcode)
        OP_LDA:  begin acc <= mem[addr]; pc <= pc + 1'b1; end
        OP_ADD:  begin acc <= acc + mem[addr]; pc <= pc + 1'b1; end
        // TODO: SUB should work just like ADD above, but subtract
        // mem[addr] from acc instead of adding it.
        OP_SUB:  begin acc <= acc; pc <= pc + 1'b1; end
        OP_STA:  begin mem[addr] <= acc; pc <= pc + 1'b1; end
        OP_JMP:  begin pc <= addr; end
        // TODO: JZ ("jump if zero") should jump to `addr`, but only when
        // acc equals 0 - otherwise it should behave like every other
        // instruction and just move on to the next one (pc + 1). Try
        // SystemVerilog's ?: (ternary) operator, the same way `zero` was
        // computed in alu.sv: condition ? value_if_true : value_if_false.
        OP_JZ:   begin pc <= pc + 1'b1; end
        OP_HALT: begin halted <= 1'b1; end
        default: begin pc <= pc + 1'b1; end // NOP and anything unrecognized
      endcase
    end
  end

endmodule
