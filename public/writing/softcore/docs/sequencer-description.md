
### **Description of the Clocking Scheme**

1. **Clock Edges:**
    - **Rising Edge:** Registers are updated, destructive actions (e.g., writing to registers or memory) occur.
    - **Falling Edge:** FSM transitions to the next state.
2. **Clock High Time:**
    - Combinational logic evaluates signals to prepare for the next state.
3. **Clock Low Time:**
    - Signals propagate through combinational logic.

### **Control Signals**
Table of the control signals referred to in the Sequencer Spreadsheet

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
#### alu controls

| bin   | alias                                | **Leg** |
| ----- | ------------------------------------ | ------- |
| 00000 | Addition (Add, Addi)                 | 0x0     |
| 00001 | Subtraction (Sub)                    | 0x1     |
| 00010 | Bitwise AND (And, Andi)              | 0x2     |
| 00011 | Bitwise OR (Or, Ori)                 | 0x3     |
| 00100 | Bitwise XOR (Xor, Xori)              | 0x4     |
| 00101 | Shift Left Logical (SLL, SLLI)       | 0x5     |
| 00110 | Shift Right Logical (SRL, SRLI)      | 0x6     |
| 00111 | Shift Right Arithmetic (SRA, SRAI)   | 0x7     |
| 01000 | Set Less Than (SLT, SLTI)            | 0x8     |
| 01001 | Set Less Than Unsigned (SLTU, SLTUI) | 0x9     |
| 01010 | Equality (Beq, Bne)                  | 0xA     |
| 01011 | LT Comparisons (BLT, BGE, etc)       | 0xB     |
| 01100 | Multiplication(MUL)                  | 0xC     |
| 01101 | Division (DIV)                       | 0xD     |
| 01110 | Remainder (REM)                      | 0xE     |
| 01111 | No OP (NOP)                          | 0xF     |

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


# Memory Subsystem FSM
```vhdl
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

library cscie93;

entity memory_fsm is
    port (
        sysclk1           : in std_ulogic;
        mem_reset         : in std_ulogic;    -- Key3
        mem_suspend       : in std_ulogic;    -- sw7
        mem_dataready_inv : in std_ulogic;
        mem_data_read      : in std_ulogic_vector(31 downto 0); -- this is going from the subsys TO the processor so its in. 
        mem_addr          : out std_ulogic_vector(20 downto 0);
        mem_data_write	   : out std_ulogic_vector(31 downto 0); -- this is going to the subsys from the processor so its out
        mem_rw            : out std_ulogic; -- this is going to the subsys ? 
        mem_sixteenbit    : out std_ulogic;
        mem_thirtytwobit  : out std_ulogic;
        mem_addressready  : out std_ulogic
    );
end;

architecture default of memory_fsm is
	type state is (memsuspend, idle, reset, setlines, setreadaddr, setwriteaddr, startread, r_unstable, readdata, startwrite, w_unstable, back);
	signal current_state, next_state : state;
	signal internal_bus : std_ulogic_vector(15 downto 0);
	signal mem_rw_int : std_ulogic;
	
begin
	
	transitioner: process(sysclk1, mem_reset, mem_suspend)
	begin
		if mem_suspend = '1' then
			current_state <= memsuspend;
		else
		if mem_reset = '1' then
			current_state <= reset;
		elsif rising_edge(sysclk1) then
			current_state <= next_state;
		end if;
	end if;
	end process;
	-- It should read a word from location 0x1dea and then write the value that was read into location 0x0b0e.
	fsm: process(current_state, mem_dataready_inv) 
	begin
		case current_state is 
			when memsuspend => 
				next_state <= memsuspend;
				
			when reset => -- when in reset, we just go to idle 
				mem_addressready <= '0';
				next_state <= idle;
				mem_rw_int	<= '0'; -- just start in read to kick everything off
			
			when idle => 
			-- first check data ready. if ytes then go to set read lines
				if mem_dataready_inv = '1' then
					next_state <= setlines;
				else
					next_state <= idle;
				end if;
				
			when setlines => 
				--  Set the address lines (mem_addr), mem_rw line, mem_sixteenbit line,and mem_thirtytwobit line.
		
				-- mem_rw <= '0'; -- for read
				mem_sixteenbit <= '1';
				mem_thirtytwobit <= '0'; -- REMEMBER TO SET THIS to 1 LATER
				next_state <= startread;
				if mem_rw_int = '0' then
					next_state <= setreadaddr;  --read 
				else
					next_state <= setwriteaddr; --write
				end if;
				
			-- maybe additoinal state here for handshake 6
			when setreadaddr =>
					mem_addr <= x"1dea";
					next_state <= startread;
					
			when setwriteaddr =>
					mem_addr <= x"0b0e";
					next_state <=startwrite;
					
			-- read logic
			when startread => -- set mem address ready high
				mem_addressready <= '1';
				next_state <= r_unstable;
				
			when r_unstable => 
				if mem_dataready_inv = '0' then
					next_state <= readdata;
				else
					next_state <= r_unstable;
				end if;
			
			when readdata => 
				internal_bus <=mem_data_read(15 downto 0); -- REMEMBER !!! also not sure if we just assign the full 31 bits?
				mem_addressready <= '0';
				next_state <= back;
			
			-- write logic
			when startwrite =>
				mem_data_write(15 downto 0) <= internal_bus; -- REMEMBER only 16 bits. we are 32
				mem_addressready <= '1';
				next_state <= w_unstable;
			
			when w_unstable => 
				if mem_dataready_inv = '1' then
					mem_addressready <= '0';
					next_state <= back;
				else
					next_state <= w_unstable;
				end if;
			when back =>
				next_state <= idle;
				mem_rw<=mem_rw_int; -- publish rw signal
				if mem_rw_int = '0' then
					-- mem_data_read <= internal_bus;
					mem_rw_int <= '1'; -- go to write
				else --
					mem_rw_int <= '0'; -- go to read
				end if;
			when others => 
				next_state <= reset;
			end case;
	end process;
end;                   
```


