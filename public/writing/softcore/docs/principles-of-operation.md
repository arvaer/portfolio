Michael J Almeida

# Foreword
This RISC32 machine is a custom 32-bit Reduced Instruction Set Computing (RISC) architecture implemented on an FPGA (Altera DE2-115). It is designed to support the simple yet powerful Integer and Multiplication instruction sets from published by the RISC-V foundation. 
As a single person effort over a single semester, there was an honest attempt to not cut corners and stay as close to the specification as possible. However, This was not entirely feasible-- especially for IO and memory.
The Risc-V computer describes a load store architecture with a standard fetch-decode-execute cycle. 
- **Instruction Set Architecture (ISA):** RISC-V I + M
- **Execution Pipeline:** A multi-stage pipeline for instruction execution.
- **Memory Hierarchy:**  registers and main memory.
- **Peripheral Interfaces:** Supporting standard I/O operations via sp/2 serial.
- **MAC** : A dedicated hardware multiplier

# Organization

## General Purpose Registers
Registers with an Asterisk mean that they are not implemented in the hardware above, but in the calling conventions for RISC-V

|  reg   | ABI/Alias | Description                 |
| :----: | --------- | --------------------------- |
|   x0   | zero      | Hard Wired Zero             |
|   x1   | ra        | Return Register             |
|   x2   | sp        | Stack Pointer               |
|   x3   | gp        | *global pointer             |
|   x4   | tp        | *thread pointer             |
|   x5   | t0        | temporary / alt link        |
|  x6-7  | t1-2      | temporaries                 |
|   x8   | s0/fp     | Frame Pointers              |
|   x9   | s1        | saved                       |
| x10-11 | a0-1      | function args / return vals |
| x12-17 | a2-7      | function arguments          |
| x18-27 | s2-11     | saved                       |
| x28-31 | t3-6      | temporaries                 |

## Main Cycle
### **Description of the Clocking Scheme**

1. **Clock Edges:**
    - **Rising Edge:** Registers are updated, destructive actions (e.g., writing to registers or memory) occur.
    - **Falling Edge:** FSM transitions to the next state.
2. **Clock High Time:**
    - Combinational logic evaluates signals to prepare for the next state.
3. **Clock Low Time:**
    - Signals propagate through combinational logic.
#### Instruction fetch
- The **Program Counter (PC)** holds the address of the next instruction to be executed.
- Instructions are fetched from the instruction memory and stored in the **Instruction Register (IR)**.
- The PC is updated to point to the next instruction, typically by incrementing it by 4 (byte addressing).
#### **Instruction Decode**
- The IR content is decoded into control signals for the subsequent pipeline stages.
- The instruction format follows the RISC convention, with fields for opcode, source registers, destination register, and immediate values.
- The decoded control signals configure the ALU, memory, and write-back stages.
#### **Execution**
- **Arithmetic and Logic Unit (ALU):** Executes arithmetic and logic operations based on decoded signals.
- **Control Logic:** Determines the flow of execution (e.g., branching, jumps).

## Memory
There are several resered spaces in memory for this computer. In ascending order:
- *0xf000 - 0xf18f* This is a buffer of maximum 100 words that are used for internal string storage. It is especially useful when trying to print complex logic to the sp2 interface as it allows for string like operations.
- *0xfece* This is the beginning of the Stack, which grows downards 1kb. 
- *0xff00* REG_IOCTL: This is furnished to us by the memory subsystem, and is used to negotiate with the sp/2 interface
- *0xff04* REG_IOB!: This is the memory mapped io location, whereby reading and writing equates to sending and recieving data over sp/2. 
## Multi-Cycle Stages
#### **Stages**
1. **Fetch (IF):** Retrieve instruction from memory.
2. **Decode (ID):** Decode instruction and read operands.
3. **Execute (EX):** Perform operations using the ALU.
4. **Memory Access (MEM):** Interact with memory if needed.
	1. Forward stall if we try to read and write from memory io. 
5. **ALUOut (WB):** Update registers with results.

#### 10. **Development Workflow**
- **Assembler:** Converts assembly instructions to machine code.
- **Emulator:** Allows debugging and testing of instruction set and programs.
- **Quartus**: Quartus Lite was used to synthesize and program the FPGA with the Usb Blaster. 


---

# Instruction set Design, Implementation, and Block Diagram
 ![[Pasted image 20241220132319.png]]
## RV32I Instruction Formats
$$
\begin{array}{|c|c|c|c|c|c|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} &\textbf{Type}\\
\hline
\ {\text{funct7}} & \text{rs2} & \text{rs1} & \text{funct3} & \text{rd} & \text{opcode}  &\text{R}\\
\hline
\ {\text{imm[11:6]}} & {\text{imm[5:0]}} & \text{rs1} & \text{funct3} & \text{rd} & \text{opcode} &\text{I}\\
\hline
\ {\text{imm[11:5]}} & \text{rs2} & \text{rs1} & \text{funct3} & \text{imm[4:0]} & \text{opcode} &\text{S}\\
\hline
\ {\text{imm[31:25]}} &\text{imm[24:20]} &\text{imm[19:15]} &\text{imm[14:12]} &\text{rd} & \text{opcode} &\text{U}\\
\hline
\ {\text{imm[12] | imm[10:5]}} & \text{rs2} & \text{rs1} & \text{funct3} & \text{imm[4:1] | imm[11]} & \text{opcode}  &\text{B}\\
\hline
\ {\text{imm[20] | imm[10:5]}} &\text{imm[5:0] | imm[11]} &\text{imm[19:15]} &\text{imm[14:12]} &\text{rd} & \text{opcode} &\text{J}\\
\hline
\end{array}
$$

---
### ALU Codes

| bin   | alias                                |
| ----- | ------------------------------------ |
| 00000 | Addition (Add, Addi)                 |
| 00001 | Subtraction (Sub)                    |
| 00010 | Bitwise AND (And, Andi)              |
| 00011 | Bitwise OR (Or, Ori)                 |
| 00100 | Bitwise XOR (Xor, Xori)              |
| 00100 | Shift Left Logical (SLL, SLLI)       |
| 00110 | Shift Right Logical (SRL, SRLI)      |
| 00111 | Shift Right Arithmetic (SRA, SRAI)   |
| 01000 | Set Less Than (SLT, SLTI)            |
| 01001 | Set Less Than Unsigned (SLTU, SLTUI) |
| 01010 | Equality (Beq, Bne)                  |
| 01011 | LT Comparisons (BLT, BGE, etc)       |
| 01100 | Multiplication(MUL)                  |
| 01101 | Division (DIV)                       |
| 01110 | Remainder (REM)                      |
| 11111 | No OP (NOP)                          |

### **R-Type Instructions**
$$
\begin{array}{|c|c|c|c|c|c|l|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 111 & \text{rd} & 0110011 & \text{AND} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 110 & \text{rd} & 0110011 & \text{OR} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 100 & \text{rd} & 0110011 & \text{XOR} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 000 & \text{rd} & 0110011 & \text{ADD} \\
\hline
0100000 & \text{rs2} & \text{rs1} & 000 & \text{rd} & 0110011 & \text{SUB} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 001 & \text{rd} & 0110011 & \text{SLL} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 010 & \text{rd} & 0110011 & \text{SLT} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 011 & \text{rd} & 0110011 & \text{SLTU} \\
\hline
0000000 & \text{rs2} & \text{rs1} & 101 & \text{rd} & 0110011 & \text{SRL} \\
\hline
0100000 & \text{rs2} & \text{rs1} & 101 & \text{rd} & 0110011 & \text{SRA} \\
\hline
\end{array}
$$

##### and  rd,rs1,rs2
Set register rd to the bitwise and of rs1 and rs2

>  if x17 = 0x55551111 and x18 = 0xff00ff00
>  | and x12,x17,x18 =>  x12 = 0x55001100
##### or rd,rs1,rs2
Set register rd to the bitwise or of rs1 and rs2
>  x17 = 0x55551111 
>  x18 = 0xff00ff00 
>  | or x12,x17,x18 => x12 = 0xff55ff11.
##### xor rd,rs1,rs2
Set register rd to the bitwise xor of rs1 and rs2
> x17 = 0x55551111 x18 = 0xff00ff00   | xor x12,x17,x18 => x12 = 0xaa55ee11
##### add rd,rs1,rs2
Set register rd to rs1+rs2
Note that funct7 must be zero for this instruction (so it differs from sub)
##### sub rd,rs1,rs2
Set register rd to rs1-rs2
Note that funct7 must be 0b01000000 for this instruction (so it differs from add)
##### sll rd,rs1,rs2
Shift rs1 left by the number of bits specified in the least significant 5 bits of rs2 and store the result in rd.
> x17 = 0x12345678  x18 = 0x08  | sll x12,x17,x18 => x12 = 0x34567800.
##### slt rd,rs1,rs2
If the signed int in rs1 is less than rs2, then set rd to 1, else 0
##### slty rd,rs1,rs2
If the unsigned int in rs1 is less than rs2, then set rd to 1, else 0
##### srl rd,rs1,rs2
Logic shift rs1 right by the 5 least significant bits in rs2, then store in rd.
> x17 = 0x87654321   x18 = 0x08 
> |srl x12,x17,x18  => x12 = 0x00876543

Note that the value of funct7 must be zero for this instruction. (The value of funct7 is how the sra instruction is differentiated from the srl instruction.)

##### sra rd,rs1,rs2
Arithmetic-shift rs1 right by the number of bits given in the least-significant 5 bits of the rs2 register and store the result in rd.
> x17 = 0x87654321   x18 = 0x08 
> | sra x12,x17,x18 => x12=0xff876543.

---
#### *Standard I-Type Instructions*
$$
\begin{array}{|c|c|c|c|c|l|}
\hline
\textbf{31-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{imm[11:0]} & \text{rs1} & 111 & \text{rd} & 0010011 & \text{ANDI} \\
\hline
\text{imm[11:0]} & \text{rs1} & 110 & \text{rd} & 0010011 & \text{ORI} \\
\hline
\text{imm[11:0]} & \text{rs1} & 100 & \text{rd} & 0010011 & \text{XORI} \\
\hline
\text{imm[11:0]} & \text{rs1} & 000 & \text{rd} & 0010011 & \text{ADDI} \\
\hline
\text{imm[11:0]} & \text{rs1} & 010 & \text{rd} & 0010011 & \text{SLTI} \\
\hline
\text{imm[11:0]} & \text{rs1} & 011 & \text{rd} & 0010011 & \text{SLTIU} \\
\hline
\text{imm[11:0]} & \text{rs1} & 000 & \text{rd} & 0000011 & \text{LB} \\
\hline
\text{imm[11:0]} & \text{rs1} & 001 & \text{rd} & 0000011 & \text{LH} \\
\hline
\text{imm[11:0]} & \text{rs1} & 010 & \text{rd} & 0000011 & \text{LW} \\
\hline
\text{imm[11:0]} & \text{rs1} & 100 & \text{rd} & 0000011 & \text{LBU} \\
\hline
\text{imm[11:0]} & \text{rs1} & 101 & \text{rd} & 0000011 & \text{LHU} \\
\hline
\end{array}
$$
##### andi rd,rs1,imm
Set register rd to the bitwise and of rs1 and imm.
imm is sign-extended.
>  if x17 = 0x55551111  
>  andi x12,x17,0x0ff => x12 = 0x00000011
##### ori rd,rs1,imm
Set the register rd to the bitwise or of rs1 and imm
 imm is sign-extended. 
 > if x17 = 0x55551111 
 > ori x12,x17,0x0ff => x12 =0x555511ff.
##### xori rd,rs1,imm
Set the register rd to the bitwise xor of rs1 and imm
 imm is sign-extended. 
 > if x17 = 0x55551111 
 > xori x12,x17,0x0ff => x12 to =0x555511ee 
##### addi rd,rs1,imm
Set register rd to rs1+imm. 
addi $x1,amnt,$0 is used as a pseudo instruction for mv
##### slti rd,rs1,imm*
If the signed integer value in 4s1 is less than imm, then set rd to 1, else 0
##### sltiu rd,rs1,imm
The same as above but unsigned


#### *Shift Immediate Instructions*
$$
\begin{array}{|c|c|c|c|c|c|l|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
0000000 & \text{shamt} & \text{rs1} & 001 & \text{rd} & 0010011 & \text{SLLI} \\
\hline
0000000 & \text{shamt} & \text{rs1} & 101 & \text{rd} & 0010011 & \text{SRLI} \\
\hline
0100000 & \text{shamt} & \text{rs1} & 101 & \text{rd} & 0010011 & \text{SRAI} \\
\hline
\end{array}
$$
These are excluded because we do not have a barrel shifter. 
#### *System Instructions*
$$
\begin{array}{|c|c|c|c|c|l|}
\hline
\textbf{31-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{fm, pred, succ} & \text{rs1} & 000 & \text{rd} & 0001111 & \text{FENCE} \\
\hline
000000000000 & 00000 & 000 & 00000 & 1110011 & \text{ECALL} \\
\hline
000000000001 & 00000 & 000 & 00000 & 1110011 & \text{EBREAK} \\
\hline
\end{array}
$$
ECALL and EBREAK will be implemented and linked to some line in the hardware interrupt. Fence will be excluded since there's only one 

---
### **S-Type Instructions**
$$
\begin{array}{|c|c|c|c|c|c|l|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{imm[11:5]} & \text{rs2} & \text{rs1} & 000 & \text{imm[4:0]} & 0100011 & \text{SB} \\
\hline
\text{imm[11:5]} & \text{rs2} & \text{rs1} & 001 & \text{imm[4:0]} & 0100011 & \text{SH} \\
\hline
\text{imm[11:5]} & \text{rs2} & \text{rs1} & 010 & \text{imm[4:0]} & 0100011 & \text{SW} \\
\hline
\end{array}
$$
##### sb rs2,imm(rs1)
Set byte (for assignment, this is halfword) at the address given by the sum of rs1 and imm to the 8 LSBs of rs2. 
##### sh rs2,imm(rs1)
Set half word (for assignment, this is word) at the address given by the sum of rs1 and imm to the 16 LSBs of rs2. 
##### sw rs2,imm(rs1)
Set word (for assignment, this is double word) at the address given by the sum of rs1 and imm to the 32 LSBs of rs2. 



---
### **U-Type Instructions**
$$
\begin{array}{|c|c|c|l|}
\hline
\textbf{31-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{imm[31:12]} & \text{rd} & \text{0110111} & \text{LUI} \\
\hline
\text{imm[31:12]} & \text{rd} & \text{0010111} & \text{AUIPC} \\
\hline
\end{array}
$$
##### lui rd,imm
Set rd to imm.
For exmaple lui x23,0x12345 will result in setting register x23 to the value 0x12345000
##### auipc rd,imm
Add the address of instruction to imm, and store in rd
For example, if the instruction auipc x22,0x10001 is executed from memory address 0x800012f4 then register x22 will be set to 0x900022f4.


### **B-Type Instructions**
$$
\begin{array}{|c|c|c|c|c|c|l|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 000 & \text{imm[4:1|11]} & 1100011 & \text{BEQ} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 001 & \text{imm[4:1|11]} & 1100011 & \text{BNE} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 100 & \text{imm[4:1|11]} & 1100011 & \text{BLT} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 101 & \text{imm[4:1|11]} & 1100011 & \text{BGE} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 110 & \text{imm[4:1|11]} & 1100011 & \text{BLTU} \\
\hline
\text{imm[12|10:5]} & \text{rs2} & \text{rs1} & 111 & \text{imm[4:1|11]} & 1100011 & \text{BGEU} \\
\hline
\end{array}
$$

imm is expressed as a target address that is converted to an even 13-bit value, representing a pc-relative offset to the target address. 
##### beq rs1, rs2, pcrel_13
if rs1 == rs2, then add imm to the pc register
##### bne rs1,rs2,pcrel_13
if the signed value in rs1 != rs2, then add imm to the pc register
##### bge rs1,rs2,pcrel_13
if the signed value in rs1 is >= rs2, then add imm to the pc register
##### bgeu rs1,rs2,pcrel_13
if the unsigned value in rs1 is >= rs2, then add imm to the pc register
##### blt rs1,rs2,pcrel_13
if the signed value in rs1 is <= rs2, then add imm to the pc register
##### bltu rs1,rs2,pcrel_13
if the unsigned value in rs1 is <= rs2, then add imm to the pc register


---
### **J-Type Instructions**
$$
\begin{array}{|c|c|c|l|}
\hline
\textbf{31-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
\text{imm[20|10:1|11|19:12]} & \text{rd} & \text{1101111} & \text{JAL} \\
\hline
\text{imm[11:0] | rs1 | 000 } & \text{rd} & \text{1101111} & \text{JALR} \\
\hline
\end{array}
$$
***Technically, JALR is an  I Type instruction, but it is in this section because it's confusing.***
##### jal rd,pcrel_21
Set register rd to the address of the next instruction (address(jal) + 4) and jump. 
]]
##### jalr rd,imm(rs1)
Set rd to the address of the next instrucion (address(jalr) + r) and jump to the address given by the sum of rs1 and imm
]]


---
## RV32M Standard Extension for Multiplication

$$
\begin{array}{|c|c|c|c|c|c|l|}
\hline
\textbf{31-25} & \textbf{24-20} & \textbf{19-15} & \textbf{14-12} & \textbf{11-7} & \textbf{6-0} & \textbf{alias} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 000 & \text{rd} & 0110011 & \text{MUL} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 001 & \text{rd} & 0110011 & \text{MULH} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 010 & \text{rd} & 0110011 & \text{MULHSU} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 011 & \text{rd} & 0110011 & \text{MULHU} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 100 & \text{rd} & 0110011 & \text{DIV} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 101 & \text{rd} & 0110011 & \text{DIVU} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 110 & \text{rd} & 0110011 & \text{REM} \\
\hline
0000001 & \text{rs2} & \text{rs1} & 111 & \text{rd} & 0110011 & \text{REMU} \\
\hline
\end{array}
$$
##### mul rd,rs1,rs2
Multiplies the signed value in rs1 by rs2 and places the lower XLEN(32) bits in the destination register.
##### mulh rd,rs1,rs2
Multiplies the signed value in rs1 by rs2 and returns the upper XLEN(32) bits of the full 64bit product. puts this in the destination register.
##### mulhsu rd,rs1,rs2
Multiplies the unsigned value in rs1 by the unsigned value in rs2 and places the lower XLEN(32) bits in the destination register.
##### mulh rd,rs1,rs2
Multiplies the signed value in rs1 by the unsigned rs2 and returns the upper XLEN(32) bits of the full 64bit product. puts this in the destination register.
> if both and high low bits of the same product are required, the recommmended sequence is 
> MULH[[S]U] rdh, rs1, rs2
> MUL rdl, rs1, rs2
   Source register specifiers must be in the same order, and rdh cannot be the same as rs1 or rs2.

##### div rd,rs1,rs2
Divides the signed value in rs1 by rsu and places the lower 32 bits in the destination register
##### divu rd,rs1,rs2
Divides the unsigned value in rs1 by rsu and places the lower 32 bits in the destination register
##### rem rd,rs1,rs2
Places the modulus of the the signed value in rs1 by rsu in the lower 32 bits in the destination register
##### remu rd,rs1,rs2
Places the modulus of the the unsigned value in rs1 by rsu in the lower 32 bits in the destination register



# Control and Sequencer States

### **Control Signals**

| **Control Signal**     | **Description**                                                                                                  | **Possible Values**                                               | **Usage/Application**                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **PCWrite**            | Enables updating the PC with a new value                                                                         | `0`, `1`                                                          | Asserted during Fetch, Branch Taken, Jump                                          |
| **PCSource**           | Selects the source for the next PC value                                                                         | `00`, `01`, `10`, `11`                                            | `00`: PC + 4; `01`: ALU Result; `10`: Jump Address; `11`: Others                   |
| **PCLoad**             | Controls loading a new value into the PC                                                                         | `0`, `1`                                                          | Combined with `PCWrite` to load PC                                                 |
| **IRWrite**            | Enables writing a new instruction into the Instruction Register (IR)                                             | `0`, `1`                                                          | Asserted during the instruction fetch cycle                                        |
| **RegWrite**           | Enables writing data to the register file                                                                        | `0`, `1`                                                          | Asserted during the write-back phase for R-Type, I-Type, Load                      |
| **RegDst**             | Selects the destination register for write operations                                                            | `0` , `1`                                                         | Determines which field specifies the destination register. `0` is None, `1` is rd  |
| **RegRead**            | Enables reading registers                                                                                        | `00`, `01`, `10`, `11`                                            | Selects which registers to read for operands                                       |
| **ALUOp**              | Specifies the operation the ALU should perform                                                                   | `00000` to `11111` (grey code table at bottom)                    | ALU and MAC Ops                                                                    |
| **ALUSrcA**            | Selects the first operand for the ALU                                                                            | `0`: Register; `1`: PC                                            | Chooses between using a register value or the PC as the first ALU operand          |
| **ALUSrcB**            | Selects the second operand for the ALU                                                                           | `00`: Register; `01`: Immediate; `10`: Shift amount; `11`: Others | Chooses the second ALU op                                                          |
| **ALUResultSrc**       | Selects where the ALU result is stored                                                                           | `0`: ALU Result Register; `1`: Memory Data Register               | Determines destination of ALU output                                               |
| **MemRead**            | Initiates a memory read operation                                                                                | `0`, `1`                                                          | Asserted during instruction fetch and load data phases (NOT PART OF MEMORY SUBSYS) |
| **MemWrite**           | Initiates a memory write operation                                                                               | `0`, `1`                                                          | Asserted during the store data phase (NOT PART OF MEMORY SUBSYS)                   |
| **ICacheMiss**         | Indicates an instruction cache miss                                                                              | `0`, `1`                                                          | Asserted when instruction is not found in the instruction cache                    |
| **DCacheMiss**         | Indicates a data cache miss                                                                                      | `0`, `1`                                                          | Asserted when data is not found in the data cache                                  |
| **CacheRead**          | Initiates a (successful) cache read operation                                                                    | `0`, `1`                                                          | Asserted when reading from cache                                                   |
| **CacheWrite**         | Initiates a cache write operation                                                                                | `0`, `1` (0 for i, 1 for d)                                       | Asserted when writing to cache                                                     |
| **CacheFlush**         | Flushe cache contents                                                                                            | `0`, `1`                                                          | Used during operations requiring cache coherence                                   |
| **ALUResultSelect**    | Selects the destination for the ALU result                                                                       | `0`, `1`                                                          | Chooses between writing the ALU result to a register or forwarding it elsewhere    |
| **PCMux**              | Selects the next PC value from multiple sources                                                                  | Encoded selection (similar to `PCSource`)                         | Determines the routing for the PC’s next value                                     |
| **RegFileMux**         | Selects data source for the register file                                                                        | Encoded selection                                                 | Determines whether data comes from the ALU, memory, or another source              |
| **ALUMuxA/B**          | Selects ALU operand sources                                                                                      | Encoded selection                                                 | Chooses between different operand sources for the ALU                              |
| **ShiftControl**       | Controls shifter operations (e.g., aligning branch offsets and every other instruction in this god forsaken isa) | Encoded selection                                                 | Set when shift operations are required                                             |
| **Halt**               | Stops processor operation                                                                                        | `0`, `1`                                                          |                                                                                    |
| **clk50mgz**           | the block                                                                                                        | `0`,`1`                                                           | The De2-115 clock                                                                  |
| **mem_rw**             | Specifies the memory operation type (read vs. write)                                                             | `0`: Read; `1`: Write                                             | Processor controls whether memory performs a read or write operation               |
| **mem_sixteenbit**     | Specifies whether the memory access is 8-bit (byte) or 16-bilt (half word)                                       | `0`: Byte (8-bit); `1`: Word (16-bit)                             | Determines the data width for memory accesses                                      |
| **mem_thirtytwobit**   | Specifies whether the memory access is 32-bit (word)                                                             | `0`: Byte/Word; `1`: Double Word (32-bit)                         | overrides `mem_sixteenbit` for 32-bit access                                       |
| **mem_addressready**   | not entirely sure but i think it indicates to the processor that the lines were set                              | `0`, `1`                                                          | Asserted when address and control lines are set for memory access                  |
| **mem_data_ready_inv** | Inverted signal from memory indicating data readiness                                                            | Active Low (`0` when ready)                                       | monitored to determine completion of memory operations                             |
| **mem_reset**          | Resets the memory controller to its initial state                                                                | `0`, `1`                                                          | Asserted during the Reset state. When active high it resets                        |
| **mem_suspend**        | stops the subsystem from responding to processor requests                                                        | `0`, `1`                                                          | Used to temporarily halt memory interactions                                       |
| **mem_data_write**     | Drives the data to be written to memory                                                                          | `31 downto 0` (internal data bus)                                 | Set with appropriate data during write operations                                  |
| **mem_data_read**      | Drives the input data lines to be read from memory                                                               | `31 downto 0` (internal data bus)                                 | Set with address data during read ops                                              |


---
# Sequencer Description


| **Leg** | **State Name**     | **Instruction Type**           | **Description**                                                                                                               | **Control Signals Asserted**                                                                                                                                                                                                                                           | **Next States**                                                                                                                                                        | **Conditions for Transitions**                                                           |
| ------- | ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0x0     | **Reset**          | ALL                            | PC = 0                                                                                                                        | `mem_reset = 1`, `PCLoad = 1`, `PCWrite = 1`, `RegWrite = 0`, `IRWrite = 0`                                                                                                                                                                                            | **Next State:** `Fetch`                                                                                                                                                | After reset signal is de-asserted (`MemReset = 0`)                                       |
| 0x1     | **Fetch**          | ALL                            | Fetch the next instruction from the PC.                                                                                       | `ALUSrcA = 1` ( if PC), `ALUSrcB = 0100`, `ALUOp = ADD`,                                                                                                                                                                                                               | **Next State:** `Wait_I_Cache`                                                                                                                                         | After setting address lines and initiating memory read                                   |
| 0x2     | **Wait_I_Cache**   | ALL                            | Wait for instruction cache to respond (handle cache hit/miss).                                                                | `MemAddressReady = 1`                                                                                                                                                                                                                                                  | **Next States:**  <br>- `ICacheMiss` (on cache hit)  <br>- `I_Cache_Miss` (on cache miss)                                                                              | **Cache Hit:** `ICacheMiss = 0`  <br>**Cache Miss:** `ICacheMiss = 1`                    |
| 0x2     | **Wait_D_Cache**   | ALL                            | If we missed in previous state we need to get the memory subsystem handshake ready by setting the lines (step 2 in handshale) | **Hit**:  `D_cache_miss = 0`, write data to memory_data_buffer<br>**Miss**: `mem_addressread = 1`, `mem_rw = 0 or 1` based on load/store, `mem read/write = 1`, `mem_data_read` is set                                                                                 | **Next State**:                                                                                                                                                        |                                                                                          |
| 0x3     | **I_Cache_Miss**   | ALL                            | If we missed in previous state we need to get the memory subsystem handshake ready by setting the lines (step 2 in handshale) | `MemRead = 1`,  `mem_address_ready = 1`, `mem_rw' = 0`, `MemSixteenBit = 1`, `MemThirtyTwoBit = 1`, `IRWrite = 1`                                                                                                                                                      | **Next State:** `Memory_Read_I`                                                                                                                                        | `mem_addr` input lines should be set                                                     |
| 0x3     | **D_Cache_Miss**   | ALL                            | Handle data cache miss by initiating memory read/write for data access.                                                       | `MemRead` or `MemWrite` based on load/store, `mem_addressready = 1`, `mem_thirtytwobit = 1`                                                                                                                                                                            | **Next State:** `Memory_Read_D` or `Memory_Write_D`                                                                                                                    | Depending on load/store instruction type                                                 |
| 0xF     | **Cache_Hit**      | ALL                            | Proceed to decode since instruction is available in the cache.                                                                | `mem_address_ready = 0`, capture instruction from cache to IR (`IRWrite = 1`)                                                                                                                                                                                          | **Next State:** `Decode`                                                                                                                                               | Cache hit confirmed                                                                      |
| 0x4     | **Memory_Read_I**  | Load Instruction               | Read the instruction from memory after cache miss and update the instruction cache.                                           | `mem_address_ready = 0`,  capture `mem_data_read` into IR (`IRWrite = 1`). set `CacheWrite to 1`                                                                                                                                                                       | **Next State:** `I_Cache_Write`                                                                                                                                        | After instrcution data is read from memory and latched into the register file            |
| 0xA     | **Memory_Read_D**  | Load Instruction               | Read data from memory after data cache miss and update the data cache.                                                        | `mem_addressready = 0`, wait for `mem_dataready_inv` to go low, capture `mem_data_read` into a the data buffer (`WriteData = mem_data_read`)                                                                                                                           | **Next State:** `Write_Back`                                                                                                                                           | After data is read from memory and latched                                               |
| 0x5     | **I_Cache_Write**  | Load Instruction on Cache Miss | After load an instruction from memory, we need to write it to the cache for next time                                         | Basically just load the instruction into the cache.                                                                                                                                                                                                                    | **Next State**: `Decode`                                                                                                                                               | After instruction data is written to cache                                               |
| 0xC     | **(d)Write_Back**  | R-Type, I-Type, Load           | Write the result of ALU operation or loaded data back to the destination register.                                            | `RegWrite = 1`, `WriteReg` set to destination register, `WriteData` set to `ALUResult` or `mem_data_read`. Also make sure `WriteReg` is onyl asserted for instructions that modify registers                                                                           | **Next State:** `Fetch`                                                                                                                                                | After data is successfully written to the register                                       |
| 0xB     | **Memory_Write_D** | Store Instruction              | Write data to memory after data cache miss and we have a eviction.                                                            | `mem_addressready = 0`, set `mem_data_write` with store data, wait for `mem_dataready_inv` to go high, `MemWrite = 1`                                                                                                                                                  | **Next State:** `Fetch`                                                                                                                                                | After data is written to memory                                                          |
| 0x6     | **Decode**         | R-Type, I-Type, All the types. | Decode the instruction in the IR                                                                                              | `RegWrite = 0`, `ALUSrcA = 0`, `ALUSrcB = 1` (for PC increment), `ALUOp = <check table>`, `RegDst` based on instruction type, `RegRead = 1`                                                                                                                            | **Next States:**  <br>- `Execute_R` for R-Type  <br>- `Execute_I` for I-Type  <br>- `Memory_Access` for Load/Store  <br>- `Branch` for B-Type  <br>- `Jump` for J-Type | Based on decoded instruction type                                                        |
| 0x7     | **Execute_R**      | R-Type                         | Perform arithmetic/logical operations  using the ALU or MAC.                                                                  | `ALUOp` set to specific R-Type operation, `ALUSrcA = Register1`, `ALUSrcB = Register2`                                                                                                                                                                                 | **Next State:** `Write_Back`                                                                                                                                           | After ALU operation completes                                                            |
| 0x8     | **Execute_I**      | I-Type                         | Perform operations involving immediate values (e.g., ADDI).                                                                   | `ALUOp` set to specific I-Type operation, `ALUSrcA = Register1`, `ALUSrcB = Immediate`                                                                                                                                                                                 | **Next State:** `Write_Back`                                                                                                                                           | After ALU operation completes                                                            |
| 0x9     | **Memory_Access**  | Load/Store                     | Access data memory for load or store instructions.                                                                            | - **Load:** `mem_addressready = 1`, `mem_rw = 0` (read),  or `mem_thirtytwobit = 1` based on data width, `MemRead = 1`  <br>- **Store:** `mem_addressready = 1`, `MemWrite = 1`, `mem_rw = 1` (write),  or `mem_thirtytwobit = 1` , `mem_data_write` set to store data | **Next States:**  <br>- `Memory_Read_D` for Load  <br>- `Memory_Write_D` for Store                                                                                     | **Load:** After data is read from memory  <br>**Store:** After data is written to memory |
| 0xD     | **Branch**         | B-Type                         | Evaluate branch condition using ALU and update PC if the branch is taken.                                                     | `ALUOp = SUB` (to compare), `ALUSrcA = Register1`, `ALUSrcB = Register2` (or immediate for branch offset), `PCWriteCond = (Branch Condition)`                                                                                                                          | **Next States:**  <br>- `Fetch` if branch not taken  <br>- `Fetch` with updated PC if branch taken                                                                     | Based on branch condition (e.g., zero flag)                                              |
| 0xE     | **Jump**           | J-Type                         | Update PC to the jump address.                                                                                                | `PCWrite = 1`, `PCSource = Jump Address`                                                                                                                                                                                                                               | **Next State:** `Fetch`                                                                                                                                                | After PC is updated                                                                      |
| 0xF     | **NOP**            | ALL                            | No Operation. Maintains current state or inserts stall.                                                                       | All control signals de-asserted or set to default                                                                                                                                                                                                                      | **Next State:** `Fetch` or remain in `NOP`                                                                                                                             | Based on specific conditions requiring a NOP                                             |
| 0xF     | **Halt**           | ALL                            | Stop processor operation.                                                                                                     | `Halt = 1`, all other control signals de-asserted                                                                                                                                                                                                                      | **Next State:** Remain in `Halt`                                                                                                                                       | When a halt instruction is executed or a critical error occurs                           |




Sources:
[1] - [RISC-V ISA manual ](https://drive.google.com/file/d/1uviu1nH-tScFfgrovvFCrj7Omv8tFtkp/view)
[2] - [RISC-V Spec](https://riscv.org/wp-content/uploads/2019/12/riscv-spec-20191213.pdf)
[3] - [RVALP: John Winans](https://github.com/johnwinans/rvalp)

*All Instruction descriptions and arguments were taken from either the RISC-V. Manual or RVALP Guide by John Winans. *