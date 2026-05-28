<script>
  import { onMount } from 'svelte';

  const img = (name) => `/writing/softcore/images/${name}`;

  // -----------------------------------------------------------------------
  // Code snippets — kept as raw template literals so we don't have to fight
  // Svelte's HTML escaping for braces, dollars, and pipes.
  // -----------------------------------------------------------------------

  const code = {
    // VHDL barrel shifter — left shift by B(4..0), one mux stage per shift bit.
    barrelShift: `-- Shift by 16, 8, 4, 2, 1 — one mux stage per bit of B.
-- Five stages, no loops, fully combinational. Synthesizes flat.
SLL_Stage0 <= A(15 downto 0) & x"0000"  when B(4) = '1' else A;
SLL_Stage1 <= SLL_Stage0(23 downto 0) & x"00"   when B(3) = '1' else SLL_Stage0;
SLL_Stage2 <= SLL_Stage1(27 downto 0) & x"0"    when B(2) = '1' else SLL_Stage1;
SLL_Stage3 <= SLL_Stage2(29 downto 0) & "00"    when B(1) = '1' else SLL_Stage2;
SLL_Result <= SLL_Stage3(30 downto 0) & '0'     when B(0) = '1' else SLL_Stage3;

-- SRA reuses the same staircase but feeds the sign bit into the top.
sign_bit   <= A(31);
SRA_Stage0 <= (15 downto 0 => sign_bit) & A(31 downto 16)         when B(4) = '1' else A;
SRA_Stage1 <= (7  downto 0 => sign_bit) & SRA_Stage0(31 downto 8) when B(3) = '1' else SRA_Stage0;
SRA_Stage2 <= (3  downto 0 => sign_bit) & SRA_Stage1(31 downto 4) when B(2) = '1' else SRA_Stage1;
SRA_Stage3 <= (1  downto 0 => sign_bit) & SRA_Stage2(31 downto 2) when B(1) = '1' else SRA_Stage2;
SRA_Result <= sign_bit & SRA_Stage3(31 downto 1)                  when B(0) = '1' else SRA_Stage3;`,

    // C bit-packing for R-type instructions — keep the original comment because
    // it captures the "imagine just masking the bits" framing.
    bitPackR: `uint32_t transform_instruction(Instruction* instr) {
    uint32_t encoded = 0;
    switch (instr->type) {
        // in all of these basically imagine just masking the bits we want.
        // we have something like the instruction representation in its struct
        // form, but we cant just cast into uint32_t directly so we're masking
        // the bits we want. for ex the opcode (imagine an 8-bit instruction
        // instead of 32 where the last 3 are the opcode) opcode is 123,
        // encoded |= (123 & 00000111) << 0  gives 00000123. next instruction
        // just gonna grab the next few bits eventually filling the whole
        // thing up.
    case R:
        encoded |= ((instr->r_type.opcode & R_OPCODE_MASK) << R_OPCODE_SHIFT);
        encoded |= ((instr->r_type.rd     & R_RD_MASK)     << R_RD_SHIFT);
        encoded |= ((instr->r_type.funct3 & R_FUNCT3_MASK) << R_FUNCT3_SHIFT);
        encoded |= ((instr->r_type.rs1    & R_RS1_MASK)    << R_RS1_SHIFT);
        encoded |= ((instr->r_type.rs2    & R_RS2_MASK)    << R_RS2_SHIFT);
        encoded |= ((instr->r_type.funct7 & R_FUNCT7_MASK) << R_FUNCT7_SHIFT);
        break;
    /* ... B, I1, I2, U, J, S all do the same trick with their own field
       layouts ... */
    }
    return encoded;
}`,

    // Function-pointer dispatch table at the heart of the assembler.
    dispatch: `// Each instruction name maps to a fetch_<name> function pointer
// that walks the token stream and returns a typed Instr_Pre.
// The whole assembler is "look up the name, call the handler".
Command commands[] = {
    { .name = "add",  .type = _ins, .handler.f_instr = fetch_add  },
    { .name = "sub",  .type = _ins, .handler.f_instr = fetch_sub  },
    { .name = "sll",  .type = _ins, .handler.f_instr = fetch_sll  },
    { .name = "slt",  .type = _ins, .handler.f_instr = fetch_slt  },
    { .name = "sltu", .type = _ins, .handler.f_instr = fetch_sltu },
    { .name = "xor",  .type = _ins, .handler.f_instr = fetch_xor  },
    { .name = "srl",  .type = _ins, .handler.f_instr = fetch_srl  },
    { .name = "sra",  .type = _ins, .handler.f_instr = fetch_sra  },
    { .name = "or",   .type = _ins, .handler.f_instr = fetch_or   },
    { .name = "and",  .type = _ins, .handler.f_instr = fetch_and  },
    { .name = "mul",  .type = _ins, .handler.f_instr = fetch_mul  },
    { .name = "div",  .type = _ins, .handler.f_instr = fetch_div  },
    { .name = "rem",  .type = _ins, .handler.f_instr = fetch_rem  },
    { .name = "jal",  .type = _ins, .handler.f_instr = fetch_jal  },
    { .name = "lui",  .type = _ins, .handler.f_instr = fetch_lui  },
    { .name = "lw",   .type = _ins, .handler.f_instr = fetch_lw   },
    { .name = "sw",   .type = _ins, .handler.f_instr = fetch_sw   },
    { .name = "beq",  .type = _ins, .handler.f_instr = fetch_beq  },
    /* ...the rest of RV32IM + pseudo-ops + .data/.text/.globl directives... */
};`,

    // Software multiply in RISC-V assembly — shift-and-add with sign handling.
    softwareMul: `# software_mul: signed shift-and-add multiply.
#   in:  s1, s2
#   out: a0 = s1 * s2
software_mul:
    addi sp, sp, -4
    sw   ra, 0(sp)

    add  a0, s1, x0          # a0 = s1
    add  a1, s2, x0          # a1 = s2
    add  x10, x0, x0         # result = 0

    # determine sign of result: flip if signs differ
    slt  x11, x0, a0
    slt  x12, x0, a1
    xor  x13, x11, x12

    # absolute-value both operands
    blt  a0, x0, negate_a0
    jal  x0, check_a1
negate_a0:
    sub  a0, x0, a0
check_a1:
    blt  a1, x0, negate_a1
    jal  x0, multiply_loop
negate_a1:
    sub  a1, x0, a1

multiply_loop:
    beq  a1, x0, multiply_done   # done when multiplier hits 0
    andi x14, a1, 1              # peel off lsb
    beq  x14, x0, skip_add_mul   # if 0, just shift
    add  x10, x10, a0            # else accumulate
skip_add_mul:
    slli a0, a0, 1               # a0 <<= 1
    srli a1, a1, 1               # a1 >>= 1
    jal  x0, multiply_loop

multiply_done:
    beq  x13, x0, positive_result
    sub  x10, x0, x10            # apply sign
positive_result:
    add  a0, x10, x0
    lw   ra, 0(sp)
    addi sp, sp, 4
    jalr x0, 0(x1)`,

    // The MIF emit step — write halfwords in little-endian byte order with an
    // optional listing comment. This is the bridge from "C struct" to
    // "Quartus-compatible memory image".
    mifEmit: `int parser_generate_mif(Parser* parser) {
    FILE* mif = fopen("output.mif", "w");
    fprintf(mif, "DEPTH = 32768;\\n");
    fprintf(mif, "WIDTH = 16;\\n");
    fprintf(mif, "ADDRESS_RADIX = HEX;\\n");
    fprintf(mif, "DATA_RADIX = BIN;\\n");
    fprintf(mif, "CONTENT\\nBEGIN\\n");

    size_t mif_index = 0;
    for (size_t i = 0; i < parser->ia->len; ++i) {
        Instr_Pre instr   = parser->ia->buffer[i];
        Instruction enc   = {0};
        size_t      n_enc = 1;

        // Pass 2: resolve any label references against the symbol table,
        // then bit-pack the typed Instr_Pre into a real RV32 word.
        encode_instruction(parser->st, parser->ia, &instr, &enc, &n_enc, mif_index * 2);
        uint32_t word = transform_instruction(&enc);

        // 16-bit memory, little-endian halfwords. Two MIF lines per
        // 32-bit instruction. Optionally trail with a listing comment.
        uint8_t b0 = (word >>  0) & 0xFF, b1 = (word >>  8) & 0xFF;
        uint8_t b2 = (word >> 16) & 0xFF, b3 = (word >> 24) & 0xFF;

        fprintf(mif, "%02zX : %s%s;", mif_index++, bin8(b1), bin8(b0));
        if (parser->generate_listing) fprintf(mif, "\\t-- %s", instr.listing);
        fprintf(mif, "\\n%02zX : %s%s;\\n",      mif_index++, bin8(b3), bin8(b2));
    }
    // ...HALT sentinel, then a .data section with the same byte ordering...
    fprintf(mif, "END;\\n");
    return SUCCESS;
}

/* output.mif looks like:
     00 : 0000000000010011;   -- addi x0, x0, 0
     01 : 0000000000000000;
     02 : 0000000000010011;   -- addi x1, x0, 13
     03 : 0000110100000000;
     ...
   Quartus's In-System Memory Content Editor reads this directly and
   writes it into the FPGA's on-chip RAM over JTAG. No linker, no ELF. */`,

    // The run loop — fetch, decode, execute, repeat. Same shape the silicon's
    // FSM walks, just compressed into one C++ function.
    emulatorLoop: `void Emulator::run(bool trace) {
    for (size_t i = 0; i < 1000000; ++i) {       // bounded — kills runaway loops
        registers[0] = 0;                         // x0 is hard-wired zero

        uint32_t        instr = fetch();          // read 32 bits from PC
        InstructionType type  = decode(instr);    // opcode -> R/I/S/B/U/J/...

        if (running == FINISHED)   break;
        if (running == WAIT_INPUT) {              // ECALL with read intent
            std::cin >> memory_bank.input_buffer;
            running = prev;
        }

        execute(instr, type);                     // dispatch by type, mutate state
        registers[0] = 0;                         // re-pin x0

        if (running == HALT) {                    // -d / debug single-step
            print_status_get_input(instr);
            if (running == QUIT) break;
        }
    }
}`,

    // The MIF-loader inside the emulator. This and the FPGA's on-chip RAM
    // both consume the same artifact.
    emulatorLoad: `void Emulator::load_mif(const std::string& filename) {
    std::ifstream infile(filename);
    std::string   line;
    bool          content = false;
    int           i = 0;

    while (std::getline(infile, line)) {
        if (line.find("BEGIN") != std::string::npos) { content = true; continue; }
        if (!content) continue;
        if (line.find("END;") != std::string::npos) { memory_bank.size = i; break; }
        if (line.find("--")   == 0)  continue;     // comment-only line

        // "0A : 0000110100000000; -- addi x1, x0, 13"
        size_t colon = line.find(':');
        size_t end   = line.find(';');
        unsigned long addr = std::stoul(trim(line.substr(0, colon)),               nullptr, 16);
        unsigned long word = std::stoul(trim(line.substr(colon + 1, end-colon-1)), nullptr, 2);

        memory_bank.write_half_word(addr * 2, word);  // 16-bit cells, byte-addressed
        ++i;
    }
}`,

    // The memory-side FSM that the CPU talks to over the handshake bus.
    // This is the part that lives on the FPGA and arbitrates real off-chip RAM.
    memFsm: `architecture default of memory_fsm is
  type state is (
    memsuspend, idle, reset,
    setlines, setreadaddr, setwriteaddr,
    startread, r_unstable, readdata,
    startwrite, w_unstable, back
  );
  signal current_state, next_state : state;
  signal mem_rw_int                : std_ulogic;
begin
  fsm: process(current_state, mem_dataready_inv) begin
    case current_state is
      when reset =>
        mem_addressready <= '0';
        mem_rw_int       <= '0';            -- start in read
        next_state       <= idle;

      when idle =>                          -- wait for memory subsys to be free
        if mem_dataready_inv = '1' then next_state <= setlines;
        else                            next_state <= idle;
        end if;

      when setlines =>                      -- drive width and direction
        mem_sixteenbit   <= '1';
        mem_thirtytwobit <= '0';
        if mem_rw_int = '0' then next_state <= setreadaddr;
        else                     next_state <= setwriteaddr;
        end if;

      when startread =>                     -- raise address-ready, hand off to RAM
        mem_addressready <= '1';
        next_state       <= r_unstable;

      when r_unstable =>                    -- spin until subsys says "data is good"
        if mem_dataready_inv = '0' then next_state <= readdata;
        else                            next_state <= r_unstable;
        end if;

      when readdata =>                      -- latch the word, drop addressready
        internal_bus     <= mem_data_read(15 downto 0);
        mem_addressready <= '0';
        next_state       <= back;

      -- ...startwrite / w_unstable / back mirror the read path...
      when others => next_state <= reset;
    end case;
  end process;
end;`,

    // C++ emulator R-type dispatch — funct3 / funct7 switch.
    emulatorRType: `void Emulator::executeRType(uint32_t instruction) {
    uint32_t rd     = (instruction >>  7) & 0x1F;
    uint32_t funct3 = (instruction >> 12) & 0x07;
    uint32_t rs1    = (instruction >> 15) & 0x1F;
    uint32_t rs2    = (instruction >> 20) & 0x1F;
    uint32_t funct7 = (instruction >> 25) & 0x7F;

    if (funct7 != 0x1) {
        switch (funct3) {
        case 0x0:  // ADD or SUB — funct7 picks
            registers[rd] = (funct7 == 0x20)
                ? registers[rs1] - registers[rs2]
                : registers[rs1] + registers[rs2];
            break;
        case 0x1:  registers[rd] = registers[rs1] << (registers[rs2] & 0x1F); break;
        case 0x2:  registers[rd] = ((int32_t)registers[rs1] < (int32_t)registers[rs2]); break;
        case 0x3:  registers[rd] = (registers[rs1] < registers[rs2]); break;
        case 0x4:  registers[rd] = registers[rs1] ^ registers[rs2]; break;
        case 0x5:  // SRL or SRA
            registers[rd] = (funct7 == 0x20)
                ? (uint32_t)((int32_t)registers[rs1] >> (registers[rs2] & 0x1F))
                : registers[rs1] >> (registers[rs2] & 0x1F);
            break;
        case 0x6:  registers[rd] = registers[rs1] | registers[rs2]; break;
        case 0x7:  registers[rd] = registers[rs1] & registers[rs2]; break;
        }
    } else {
        // RV32M: MUL / DIV / REM family — funct7 == 0x1
        switch (funct3) {
        case 0x0:  registers[rd] = registers[rs1] * registers[rs2]; break;
        case 0x4:  registers[rd] = registers[rs2] ? registers[rs1] / registers[rs2] : 0; break;
        case 0x6:  registers[rd] = registers[rs2] ? registers[rs1] % registers[rs2] : 0; break;
        /* ... mulh, mulhsu, mulhu, divu, remu ... */
        }
    }
}`
  };

  // -----------------------------------------------------------------------
  // Lazy-load Prism for syntax highlighting.
  // -----------------------------------------------------------------------

  let codeRoot;

  onMount(() => {
    const PRISM_CSS = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css';
    const PRISM_CORE = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js';
    const PRISM_AUTOLOADER = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js';

    const ensureStylesheet = (href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    };

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (existing.dataset.loaded === 'true') {
            resolve();
          } else {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
          }
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.addEventListener('load', () => {
          script.dataset.loaded = 'true';
          resolve();
        });
        script.addEventListener('error', reject);
        document.head.appendChild(script);
      });

    ensureStylesheet(PRISM_CSS);

    (async () => {
      try {
        await loadScript(PRISM_CORE);
        if (window.Prism) {
          window.Prism.plugins = window.Prism.plugins || {};
          window.Prism.plugins.autoloader = window.Prism.plugins.autoloader || {};
          window.Prism.plugins.autoloader.languages_path =
            'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
        }
        await loadScript(PRISM_AUTOLOADER);
        if (window.Prism && codeRoot) {
          window.Prism.highlightAllUnder(codeRoot);
        }
      } catch (err) {
        console.error('prism load failed', err);
      }
    })();
  });
</script>

<svelte:head>
  <title>RV32IM soft-core — a walkthrough · arvaer</title>
  <meta
    name="description"
    content="A 32-bit RISC-V soft-core CPU in VHDL, plus a hand-written assembler and emulator — gates to compiler, end to end."
  />
</svelte:head>

<div class="walkthrough" bind:this={codeRoot}>
  <nav class="top-nav">
    <a href="/">← back</a>
    <span class="top-nav-sep">/</span>
    <a href="/">writing</a>
    <span class="top-nav-sep">/</span>
    <span class="top-nav-current">soft-core</span>
  </nav>

  <header class="wt-header">
    <div class="wt-eyebrow">walkthrough</div>
    <h1>RV32IM, from gates up</h1>
    <div class="wt-subtitle">
      A 32-bit RISC-V soft-core in VHDL, plus a hand-written assembler and emulator.
    </div>
    <div class="wt-meta">
      <span>VHDL · C · C++ · RISC-V asm</span>
      <span>·</span>
      <span>Altera DE2-115 (Cyclone IV)</span>
    </div>
  </header>

  <section class="hook">
    <p>
      <span class="lede">Four pieces, one toolchain.</span>
      A 32-bit RISC-V (RV32I + M) CPU in VHDL running on a Cyclone IV. A two-pass assembler in C that turns <code>.s</code> into a <code>.mif</code> the FPGA can boot from. A C++ emulator that's the golden reference — same ISA, same memory map, faster iteration. And a small assembly program that asks for two integers, multiplies them, and prints the result over UART.
    </p>
    <p class="hook-tail">
      The point was to never lie to myself about what's underneath. No softened abstractions, no generated cores. ALU is a barrel of muxes. The assembler is a function-pointer table. The emulator is a fetch-decode-execute loop with a <code>switch</code>. Honestly the whole thing is simpler than people make it out to be — the magic is just the names.
    </p>
  </section>

  <section class="part">
    <div class="part-kicker">The shape</div>
    <h2>Multicycle datapath</h2>

    <div class="prose">
      <p>The CPU is a multicycle RV32IM, modeled after the Patterson &amp; Hennessy MIPS multicycle architecture but reworked for RISC-V's instruction formats. Split I-cache and D-cache, both 4-way set associative, write-back. One ALU, one register file, one memory port, sequenced by a state machine that walks fetch → decode → execute → memory → writeback.</p>
    </div>

    <figure class="wt-figure">
      <img src={img('datapath.jpg')} alt="RV32IM multicycle datapath" />
      <figcaption>The datapath. PC feeds a unified memory port through an I-or-D mux, the instruction register decodes into the register file, ALU outputs latch into AluOut, the MAC unit lives off the same operand bus, and the whole thing is sequenced by a controller that emits IRWrite / PCSource / ALUSrc / ALUOp / RegWrite / MemToReg.</figcaption>
    </figure>

    <div class="prose">
      <p>The interesting decision was making the cache split. A unified memory works fine for a textbook MIPS, but the moment you have any program with non-trivial loops the I-fetch and D-load contend for the same port and you eat extra cycles. Splitting them means the controller can prefetch the next instruction while the previous one is still in its memory stage, which on a multicycle is most of the win you'd otherwise need pipelining for.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">The ALU</div>
    <h2>Barrel shifter, mux tree</h2>

    <div class="prose">
      <p>The shifter is the part of the ALU that's most fun to write in hardware because it has no software analogue. You can't loop. You have to commit to a fixed amount of routing in silicon and let the bits flow. The trick is the same one a barrel shifter has used since forever — one mux stage per bit of the shift amount, doubling the shift distance each stage.</p>
    </div>

    <pre class="codeblock"><code class="language-vhdl">{code.barrelShift}</code></pre>

    <div class="prose">
      <p>Five stages, fully combinational, no clocking. The synthesizer flattens it into a routing fabric, and the entire shift completes in one trip across the LUT mesh — which on a Cyclone IV is comfortably inside the multicycle's clock period.</p>

      <p>Sign-extending arithmetic shifts gets the same staircase, except instead of feeding zeros into the top, you replicate the sign bit. Watch <code>SRA_Stage0</code>: <code>(15 downto 0 =&gt; sign_bit)</code> is VHDL's "fill these 16 lanes with the sign". Same circuit, two inputs swapped.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">The assembler</div>
    <h2>From <code>.s</code> to a memory image</h2>

    <div class="prose">
      <p>The assembler is the bridge between human-readable RISC-V and the bits the silicon actually executes. Four stages, end to end:</p>
    </div>

    <ol class="readpath-steps">
      <li>
        <div class="step-header">
          <span class="step-num">1</span>
          <strong>Tokenize.</strong>
        </div>
        <p>Stream characters in from the <code>.s</code> file, emit a flat token stream. Mnemonics, register names, integers, commas, parens, labels, directives. <code>.include</code> is handled here — included files get their tokens spliced inline so the parser never has to know about the filesystem.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">2</span>
          <strong>Parse + dispatch.</strong>
        </div>
        <p>Single hash lookup on each mnemonic into a global command table. Hit calls the handler, miss is an error. Each handler walks just enough of the token stream to fill in the operands for its instruction type. Labels go straight into a symbol table with their current code address.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">3</span>
          <strong>Encode.</strong>
        </div>
        <p>Resolve label references against the symbol table, expand pseudo-ops (<code>li</code>, <code>la</code>, <code>j</code>, <code>mv</code>, <code>ret</code>) into one or two real instructions, then bit-pack each typed struct into a 32-bit RISC-V word.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">4</span>
          <strong>Emit MIF.</strong>
        </div>
        <p>Write the words out as Altera-format halfwords with optional listing comments. This is the artifact the emulator and the FPGA both consume.</p>
      </li>
    </ol>

    <div class="subpart">
      <div class="subpart-kicker">Stage 2 — dispatch</div>
      <h3>One record per instruction, function-pointer table</h3>

      <div class="prose">
        <p>RV32IM is ~50 instructions including pseudo-ops. You can't sanely write a parser that switches on instruction names — you'd end up with a thousand-line <code>if/else</code> tower. Instead: one record per instruction, indexed by name, holding a function pointer to the right fetch handler.</p>
      </div>

      <pre class="codeblock"><code class="language-c">{code.dispatch}</code></pre>

      <div class="prose">
        <p>The parser pulls a token, looks it up, calls <code>handler.f_instr(parser, tokenstream)</code>, and gets back a typed <code>Instr_Pre</code>. The <em>type</em> field (R / I / S / B / U / J / pseudo) tells the encoder which fields are populated. R-type wants <code>rd, rs1, rs2</code>; B-type wants <code>rs1, rs2, label</code>; etc.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Stage 3 — encode</div>
      <h3>Bit-packing into a 32-bit word</h3>

      <pre class="codeblock"><code class="language-c">{code.bitPackR}</code></pre>

      <div class="prose">
        <p>That comment up top is the whole game. RISC-V's R-type spec gives you exactly six fields with exactly six bit positions, and "encoding" really is just shift-and-OR each field into the right slot. The mask catches accidental high bits, the shift puts it where the spec says it goes. <strong>Hardware reads the same word back out by shifting and masking the other direction</strong> — which is literally the first thing the emulator's R-type executor does, and what the FSM-driven decode stage does on the FPGA.</p>

        <p>The other instruction formats are the same idea with different layouts. B-type and J-type are the only spicy ones: their immediates are scrambled across the word so that the bit positions of the upper bits never move between formats — a hardware-friendliness compromise that makes the assembler's life slightly worse and the silicon's life much better.</p>
      </div>
    </div>

    <div class="subpart">
      <div class="subpart-kicker">Stage 4 — emit</div>
      <h3>The Altera MIF format</h3>

      <div class="prose">
        <p>The output is a <code>.mif</code> — Memory Initialization File — which is just Altera's plain-text format for "what's in this RAM at boot". The header declares depth and width; the body is <code>address : data;</code> lines. The data RAM on the DE2-115 is 16 bits wide, so each 32-bit instruction becomes two MIF lines, little-endian. Pass <code>-d</code> and the original assembly listing rides along as a trailing comment, which is invaluable when you're debugging on hardware and reading raw memory.</p>
      </div>

      <pre class="codeblock"><code class="language-c">{code.mifEmit}</code></pre>

      <div class="prose">
        <p>That's the whole loader contract. No linker, no ELF, no relocation table. The MIF file <em>is</em> the program. Quartus's In-System Memory Content Editor reads this format directly over JTAG and writes it into the FPGA's on-chip RAM. The emulator reads the same file with <code>std::stoul</code> on the data field. Two execution targets, one artifact.</p>
      </div>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">The emulator</div>
    <h2>Fetch, decode, execute — same MIF, software target</h2>

    <div class="prose">
      <p>The emulator exists for one reason: synthesis takes ten minutes and FPGA debugging is miserable. So the same ISA gets a software model that runs the same <code>.mif</code> the hardware does, lets you single-step, and dumps a trace log on exit. When something goes wrong I want to know whether it's the program or the silicon, and the emulator is what answers that question in 50ms instead of 10 minutes.</p>

      <p>It starts by reading the MIF directly into a memory bank that mimics the FPGA's address space — same layout, same word width, same endianness:</p>
    </div>

    <pre class="codeblock"><code class="language-cpp">{code.emulatorLoad}</code></pre>

    <div class="prose">
      <p>Once the MIF is loaded, the run loop is the cleanest possible expression of fetch-decode-execute — the same loop the hardware FSM walks, just compressed into one C++ function:</p>
    </div>

    <pre class="codeblock"><code class="language-cpp">{code.emulatorLoop}</code></pre>

    <div class="prose">
      <p>The cycle limit is a sanity guard for runaway programs. <code>x0</code> gets re-pinned every iteration because RISC-V's hard-wired zero is a contract <em>this</em> register file enforces in software, not a thing the C++ array gives you for free. <code>WAIT_INPUT</code> is the emulator's hook for ECALL-driven I/O: when the program reads from the memory-mapped UART register, the emulator pauses for stdin instead.</p>

      <p>The decode step turns 32 bits into one of seven format tags by switching on the low 7 bits (the opcode). Execute then dispatches by tag — and R-type is the densest, ten instructions sharing one opcode and distinguished only by <code>funct3</code> (and <code>funct7</code> when the opcode is overloaded for SUB vs ADD, SRA vs SRL, or the entire M-extension multiply/divide block):</p>
    </div>

    <pre class="codeblock"><code class="language-cpp">{code.emulatorRType}</code></pre>

    <div class="prose">
      <p>Same logic the FSM-driven hardware ALU implements. Same bit-fields the assembler wrote out. <strong>The emulator and the silicon are two implementations of one spec</strong>, both consuming the same MIF, both arriving at the same answer — which is what makes the tooling chain feel solid. When the program prints <code>156</code> for <code>12 × 13</code> on the FPGA seven-segment displays, it's because every layer agreed on what those 32 bits meant.</p>

      <p>Pass <code>-d</code> and the emulator runs in trace mode: every instruction logs to <code>trace_log</code> with its decoded fields, and the loop pauses after each step so you can poke at the registers before continuing. Catching a bug this way and then re-running on the FPGA-with-confidence is the entire reason the emulator is in this repo.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">The silicon</div>
    <h2>VHDL → Quartus → USB Blaster → DE2-115</h2>

    <div class="prose">
      <p>The hardware side of all this is written in VHDL. Every <code>.vhd</code> file in the repo is one module — ALU, register file, memory FSM, multicycle controller, top-level board glue — and they connect to each other through entity ports the same way C functions connect through arguments. The whole CPU plus its peripherals, plus the pin assignments to the DE2-115's switches, LEDs, seven-segments, and PS/2 port, are sitting in <code>memory.vhd</code> as the top-level entity.</p>

      <p>The piece that makes the rest possible is the memory subsystem's own little FSM. The CPU's controller sits on the other side of a handshake bus — drive an address, raise <code>mem_addressready</code>, wait for <code>mem_dataready_inv</code> to drop, latch the word — and this FSM is what makes that handshake work against real off-chip SSRAM:</p>
    </div>

    <pre class="codeblock"><code class="language-vhdl">{code.memFsm}</code></pre>

    <div class="prose">
      <p>This is what FPGA programming actually looks like. No loops, no functions in the C sense — every state of every FSM compiles down to a chunk of LUTs and routing, and every signal is a wire. The <em>type state is (memsuspend, idle, ...);</em> declaration is doing a lot of work: synthesis encodes it into a small number of flip-flops, and every <code>case</code>-arm becomes a parallel block of combinational logic that decides what the next-state register should be at the next clock edge.</p>

      <p>Once the VHDL elaborates and passes timing, the toolchain flow is short:</p>
    </div>

    <ol class="readpath-steps">
      <li>
        <div class="step-header">
          <span class="step-num">1</span>
          <strong>Compile in Quartus.</strong>
        </div>
        <p>Quartus Lite synthesizes the VHDL into a netlist, places and routes it onto the Cyclone IV's LUT fabric, and produces a <code>.sof</code> bitstream. This is the longest step — anywhere from 2 to 10 minutes depending on what changed — and it's why the emulator exists.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">2</span>
          <strong>Flash with the USB Blaster.</strong>
        </div>
        <p>The DE2-115 has an Altera USB Blaster on-board JTAG dongle. Quartus's Programmer talks to it over USB, walks the JTAG chain, and shoves the <code>.sof</code> into the FPGA's volatile config memory. After this point the chip <em>is</em> the CPU. Press a key, the FSM advances. Power-cycle and the bitstream is gone — there's a separate path for writing it to the configuration flash if you want it sticky.</p>
      </li>

      <li>
        <div class="step-header">
          <span class="step-num">3</span>
          <strong>Load the program with the In-System Memory Content Editor.</strong>
        </div>
        <p>This is the part that's easy to miss. The CPU is now alive on the FPGA, but its on-chip RAM is empty. Quartus has a separate tool — the <em>In-System Memory Content Editor</em> — that talks over the same JTAG connection and writes a <code>.mif</code> directly into the synthesized RAM at runtime, without re-synthesizing or re-flashing. New program? Re-assemble, click "Import Data from File", press the reset key on the board. Done in seconds.</p>
      </li>
    </ol>

    <aside class="aside">
      <div class="aside-label">why this separation matters</div>
      <div class="aside-body">
        <p>Synthesis is slow. If the only way to load a new program were to re-synthesize the bitstream with the program baked in, the iteration loop would be ten minutes per change and nobody would ever write any software. Splitting "what gates exist" from "what's in RAM" is the same trick every real CPU plays — the silicon is mask-set, the program is just memory. The In-System Memory Content Editor is the FPGA equivalent of <code>dd</code>-ing a kernel into a boot partition.</p>
        <p>So the loop ends up: <em>edit assembly → asm → emu (validate in 50ms) → if good, ISMCE-flash and reset</em>. Whole thing is under a minute round-trip once Quartus is running.</p>
      </div>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">The program</div>
    <h2>Software multiply, before the M extension worked</h2>

    <div class="prose">
      <p>The final demo asks for two integers over the UART, multiplies them, prints the result. By the end the M extension was working in hardware, but I wrote the software multiply first and kept it around because (a) it's a real test of branches, jumps, and the calling convention, and (b) it's just a satisfying piece of assembly. Shift-and-add, sign-handled by hand:</p>
    </div>

    <pre class="codeblock"><code class="language-asm">{code.softwareMul}</code></pre>

    <div class="prose">
      <p>The classic algorithm: peel off the LSB of the multiplier, conditionally add the multiplicand to the accumulator, shift both, repeat until the multiplier hits zero. Sign handling is one XOR up front (signs differ → flip the result at the end) plus two absolute-value branches to make sure the loop only ever sees non-negative operands. The stack frame is just <code>addi sp, sp, -4 / sw ra / ... / lw ra / addi sp, sp, 4 / jalr x0, 0(x1)</code> — no frame pointer needed for a leaf-ish function with no locals beyond what fits in temporaries.</p>

      <p>Once that worked, swapping it out for a single <code>mul s3, s1, s2</code> was a one-line change. Same calling convention, same return register. The whole point of having an ISA.</p>
    </div>
  </section>

  <section class="part">
    <div class="part-kicker">End to end</div>
    <h2>What the toolchain looks like</h2>

    <div class="prose">
      <p>The whole flow, end to end:</p>
    </div>

    <pre class="codeblock"><code class="language-bash"># --- one-time, when the hardware changes ---
$ quartus_sh --flow compile cpu.qpf      # synth + place + route → cpu.sof
$ quartus_pgm -m JTAG -o "p;cpu.sof"     # flash bitstream over USB Blaster

# --- per program, every iteration ---
$ asm -d main.s                          # .s + .include + .data → output.mif
$ emu output.mif                         # software check; -d for single-step

# Load output.mif into on-chip RAM via Quartus's
# In-System Memory Content Editor (JTAG, no re-synth).
# Press the reset key on the board.
# Watch hex0..hex7 light up.</code></pre>

    <div class="prose">
      <p>Two execution targets, one artifact. The bitstream changes only when the gates change. The MIF changes every time the program does. The emulator is what I run during development; the FPGA is what proves it. And because both consume the same MIF, when they disagree it's a real bug — not a tooling artifact.</p>
    </div>

    <aside class="aside">
      <div class="aside-label">why this was worth doing</div>
      <div class="aside-body">
        <p>You can read the RISC-V spec front to back without ever feeling like you understand it. It only clicks once you've had to <em>encode</em> a B-type immediate by hand, watch a barrel shifter compose, and write the line of C++ that decides whether <code>0x33 / funct3=0x0 / funct7=0x20</code> means SUB. Once you've done that for one ISA, every other ISA is just a different bit layout for the same conversation between software and silicon.</p>
        <p>And honestly — almost nothing in this repo is <em>complicated</em>. It's a stack of small, named primitives. The assembler is a hash table of function pointers. The ALU is a barrel of muxes. The emulator is a switch statement. The FPGA is the same switch statement, drawn in wires. Naming the spirit, etc.</p>
      </div>
    </aside>
  </section>

  <section class="part">
    <div class="part-kicker">Appendix</div>
    <h2>Design docs</h2>

    <div class="prose">
      <p>The three reference docs I kept on the wall while building this. Raw markdown — open them in any viewer, mark them up, pull what you need.</p>
    </div>

    <ul class="docs-list">
      <li class="doc-card">
        <div class="doc-head">
          <span class="doc-title">Principles of Operation</span>
          <a class="doc-download" href="/writing/softcore/docs/principles-of-operation.md" download>download .md ↓</a>
        </div>
        <p class="doc-highlight">
          The full spec. RV32IM ISA reference with every instruction's bit layout (R / I / S / B / U / J), the register file with ABI aliases, the memory map (<code>0xf000</code> string buffer, <code>0xfece</code> stack base, <code>0xff04</code> UART), the clocking scheme (rising-edge writes, falling-edge state transitions), and the complete sequencer state table. Everything you'd need to write or audit a program against this CPU.
        </p>
      </li>

      <li class="doc-card">
        <div class="doc-head">
          <span class="doc-title">Sequencer Description</span>
          <a class="doc-download" href="/writing/softcore/docs/sequencer-description.md" download>download .md ↓</a>
        </div>
        <p class="doc-highlight">
          The control-signal vocabulary the multicycle controller speaks: <code>PCWrite</code>, <code>IRWrite</code>, <code>ALUSrcA</code>, <code>RegRead</code>, the cache-miss handshake. Every state in the FSM with the signals it asserts and the conditions for transitioning out. Includes the off-chip memory FSM in full VHDL — the gnarly read/write handshake the CPU sits behind.
        </p>
      </li>

      <li class="doc-card">
        <div class="doc-head">
          <span class="doc-title">Display Scheme</span>
          <a class="doc-download" href="/writing/softcore/docs/display-scheme.md" download>download .md ↓</a>
        </div>
        <p class="doc-highlight">
          Live debug. Every FSM state gets a hex value on <code>hex0</code>, every ALU op gets one on <code>hex1</code>, and the lower 16 bits of the PC ride on <code>hex2</code>–<code>hex5</code>. Watch the CPU think while a program runs. This is the trick that makes a stuck program legible without a logic analyzer.
        </p>
      </li>
    </ul>
  </section>

  <footer class="wt-footer">
    <a href="/">← back to writing</a>
  </footer>
</div>

<style>
  .walkthrough {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 120px;
    color: var(--text);
  }

  .top-nav {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.72rem;
    color: var(--text-dim);
    letter-spacing: 0.04em;
    margin-bottom: 56px;
  }

  .top-nav a {
    color: var(--text-dim);
    text-decoration: none;
    transition: color 0.2s;
  }

  .top-nav a:hover {
    color: var(--text-bright);
  }

  .top-nav-sep {
    opacity: 0.4;
  }

  .top-nav-current {
    color: var(--text-bright);
  }

  .wt-header {
    padding-bottom: 40px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 40px;
  }

  .wt-eyebrow {
    font-size: 0.7rem;
    color: var(--text-dim);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .wt-header h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 2.4rem;
    color: var(--text-bright);
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  .wt-subtitle {
    font-family: var(--serif);
    font-style: italic;
    font-size: 1.05rem;
    color: var(--text);
    margin-bottom: 28px;
  }

  .wt-meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.74rem;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }

  .wt-meta span {
    opacity: 0.65;
  }

  .hook {
    padding: 8px 0 48px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 48px;
  }

  .hook p {
    font-family: var(--serif);
    font-size: 1.18rem;
    line-height: 1.7;
    color: var(--text-bright);
    margin: 0 0 1em;
  }

  .hook p.hook-tail {
    font-size: 1.04rem;
    color: var(--text);
    margin-bottom: 0;
  }

  .hook .lede {
    font-family: var(--serif);
    font-weight: 500;
    color: var(--text-bright);
    letter-spacing: 0.01em;
  }

  .part {
    padding: 32px 0 56px;
    margin-bottom: 16px;
  }

  .part-kicker {
    font-size: 0.7rem;
    color: var(--accent);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .part h2 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 1.6rem;
    color: var(--text-bright);
    letter-spacing: -0.01em;
    margin-bottom: 24px;
    line-height: 1.25;
  }

  .prose {
    margin-bottom: 8px;
  }

  .prose p {
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1.1em;
  }

  .prose p:last-child {
    margin-bottom: 0;
  }

  .prose code {
    font-family: var(--mono);
    font-size: 0.86em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-bright);
  }

  .part:not(:last-of-type)::after {
    content: '✦  ✦  ✦';
    display: block;
    text-align: center;
    color: var(--accent);
    font-size: 0.78rem;
    letter-spacing: 0.4em;
    margin: 40px 0 -40px;
    opacity: 0.35;
  }

  .readpath-steps {
    list-style: none;
    padding: 0;
    margin: 28px 0 0;
  }

  .readpath-steps > li {
    position: relative;
    padding: 18px 0;
    border-top: 1px dashed var(--border);
  }

  .readpath-steps > li:first-child {
    border-top: none;
  }

  .step-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 8px;
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--text-bright);
  }

  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--accent);
    border-radius: 50%;
    color: var(--accent);
    font-family: var(--serif);
    font-size: 0.85rem;
    font-weight: 500;
    flex-shrink: 0;
    align-self: center;
  }

  .step-header strong {
    font-weight: 500;
  }

  .readpath-steps p {
    margin-left: 42px;
    margin-top: 0;
    font-size: 0.98rem;
    font-family: var(--serif);
    line-height: 1.7;
    color: var(--text);
  }

  .readpath-steps p code {
    font-family: var(--mono);
    font-size: 0.86em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-bright);
  }

  .subpart {
    margin-top: 56px;
    padding-top: 36px;
    border-top: 1px dashed var(--border);
  }

  .subpart h3 {
    font-family: var(--serif);
    font-weight: 400;
    font-style: italic;
    font-size: 1.3rem;
    color: var(--text-bright);
    letter-spacing: -0.01em;
    margin: 0 0 18px;
  }

  .subpart-kicker {
    font-size: 0.66rem;
    color: var(--accent);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 6px;
    opacity: 0.75;
  }

  .part h2 code {
    font-family: var(--mono);
    font-size: 0.78em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 6px;
    border-radius: 3px;
    color: var(--text-bright);
    font-weight: 400;
    letter-spacing: 0;
  }

  .wt-figure {
    margin: 28px 0;
  }

  .wt-figure img {
    display: block;
    width: 100%;
    height: auto;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    padding: 12px;
  }

  .wt-figure figcaption {
    font-size: 0.78rem;
    color: var(--text-dim);
    text-align: center;
    margin-top: 10px;
    font-style: italic;
    font-family: var(--serif);
    line-height: 1.55;
  }

  .codeblock {
    margin: 22px 0 26px;
    padding: 18px 20px;
    background: #111418;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    overflow-x: auto;
    font-family: var(--mono);
    font-size: 0.78rem;
    line-height: 1.6;
    color: var(--text);
  }

  .codeblock code {
    font-family: var(--mono);
    font-size: inherit;
    background: transparent;
    padding: 0;
    color: inherit;
    white-space: pre;
  }

  /* Token classes are added by Prism at runtime, so they're :global. */
  .codeblock :global(code[class*='language-']) {
    background: transparent !important;
    text-shadow: none !important;
  }

  .codeblock :global(.token.comment) {
    color: #6b6660 !important;
    font-style: italic;
  }
  .codeblock :global(.token.keyword),
  .codeblock :global(.token.builtin) {
    color: #b8977e !important;
  }
  .codeblock :global(.token.string) {
    color: #c9b78d !important;
  }
  .codeblock :global(.token.number) {
    color: #d6b289 !important;
  }
  .codeblock :global(.token.function) {
    color: #e8d4b0 !important;
  }
  .codeblock :global(.token.operator),
  .codeblock :global(.token.punctuation) {
    color: #c8c4bc !important;
  }
  .codeblock :global(.token.macro) {
    color: #b8977e !important;
  }

  .aside {
    margin: 32px 0;
    padding: 22px 26px 22px 28px;
    border-left: 3px solid var(--accent);
    background: rgba(184, 151, 126, 0.045);
    border-radius: 0 4px 4px 0;
    position: relative;
  }

  .aside::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 40px;
    height: 40px;
    background: linear-gradient(
      135deg,
      transparent 50%,
      var(--accent-dim) 50%,
      var(--accent-dim) 52%,
      transparent 52%
    );
    opacity: 0.4;
    pointer-events: none;
  }

  .aside-label {
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.8rem;
    color: var(--accent);
    letter-spacing: 0.04em;
    margin-bottom: 14px;
  }

  .aside-label::before {
    content: '※  ';
    font-style: normal;
    opacity: 0.7;
  }

  .aside-body p {
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.75;
    color: var(--text-bright);
    margin: 0 0 1em;
  }

  .aside-body p:last-child {
    margin-bottom: 0;
  }

  .aside-body em {
    color: var(--accent);
    font-style: italic;
  }

  .docs-list {
    list-style: none;
    padding: 0;
    margin: 28px 0 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .doc-card {
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    padding: 18px 22px;
    background: rgba(184, 151, 126, 0.03);
    transition: background 0.2s, border-color 0.2s;
  }

  .doc-card:hover {
    background: rgba(184, 151, 126, 0.07);
  }

  .doc-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .doc-title {
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--text-bright);
    letter-spacing: -0.005em;
  }

  .doc-download {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--accent);
    text-decoration: none;
    letter-spacing: 0.04em;
    white-space: nowrap;
    transition: color 0.2s;
  }

  .doc-download:hover {
    color: var(--text-bright);
  }

  .doc-highlight {
    font-family: var(--serif);
    font-size: 0.96rem;
    line-height: 1.7;
    color: var(--text);
    margin: 0;
  }

  .doc-highlight code {
    font-family: var(--mono);
    font-size: 0.86em;
    background: rgba(184, 151, 126, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-bright);
  }

  .wt-footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .wt-footer a {
    color: var(--accent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .wt-footer a:hover {
    color: var(--text-bright);
  }

  @media (max-width: 620px) {
    .walkthrough {
      padding: 32px 20px 80px;
    }

    .wt-header h1 {
      font-size: 1.9rem;
    }

    .part h2 {
      font-size: 1.35rem;
    }

    .codeblock {
      font-size: 0.7rem;
      padding: 14px 14px;
    }

    .hook p {
      font-size: 1.05rem;
    }
  }
</style>
