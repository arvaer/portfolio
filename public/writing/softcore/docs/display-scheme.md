![[Display Scheme 2024-12-12 12.14.57.excalidraw]]

### Program Counter Display
Program counter display bit is given by the lower 16 bits of the program counter as its 32 bits. 

| **FSM ** | **State Name**     | **Next States**                                                                                                                                                        |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0x0      | **Reset**          | **Next State:** `Fetch`                                                                                                                                                |
| 0x1      | **Fetch**          | **Next State:** `Wait_I_Cache`                                                                                                                                         |
| 0x2      | **Wait_I_Cache**   | **Next States:**  <br>- `ICacheMiss` (on cache hit)  <br>- `I_Cache_Miss` (on cache miss)                                                                              |
| 0x2      | **Wait_D_Cache**   | **Next State**:                                                                                                                                                        |
| 0x3      | **I_Cache_Miss**   | **Next State:** `Memory_Read_I`                                                                                                                                        |
| 0x3      | **D_Cache_Miss**   | **Next State:** `Memory_Read_D` or `Memory_Write_D`                                                                                                                    |
| 0xF      | **Cache_Hit**      | **Next State:** `Decode`                                                                                                                                               |
| 0x4      | **Memory_Read_I**  | **Next State:** `I_Cache_Write`                                                                                                                                        |
| 0xA      | **Memory_Read_D**  | **Next State:** `Write_Back`                                                                                                                                           |
| 0x5      | **I_Cache_Write**  | **Next State**: `Decode`                                                                                                                                               |
| 0xC      | **(d)Write_Back**  | **Next State:** `Fetch`                                                                                                                                                |
| 0xB      | **Memory_Write_D** | **Next State:** `Fetch`                                                                                                                                                |
| 0x6      | **Decode**         | **Next States:**  <br>- `Execute_R` for R-Type  <br>- `Execute_I` for I-Type  <br>- `Memory_Access` for Load/Store  <br>- `Branch` for B-Type  <br>- `Jump` for J-Type |
| 0x7      | **Execute_R**      | **Next State:** `Write_Back`                                                                                                                                           |
| 0x8      | **Execute_I**      | **Next State:** `Write_Back`                                                                                                                                           |
| 0x9      | **Memory_Access**  | **Next States:**  <br>- `Memory_Read_D` for Load  <br>- `Memory_Write_D` for Store                                                                                     |
| 0xD      | **Branch**         | **Next States:**  <br>- `Fetch` if branch not taken  <br>- `Fetch` with updated PC if branch taken                                                                     |
| 0xE      | **Jump**           | **Next State:** `Fetch`                                                                                                                                                |
| 0xF      | **NOP**            | **Next State:** `Fetch` or remain in `NOP`                                                                                                                             |
| 0xF      | **Halt**           | **Next State:** Remain in `Halt`                                                                                                                                       |


| **ALU Char** | bin   | alias                                |
| ------------ | ----- | ------------------------------------ |
| 0x0          | 00000 | Addition (Add, Addi)                 |
| 0x1          | 00001 | Subtraction (Sub)                    |
| 0x2          | 00010 | Bitwise AND (And, Andi)              |
| 0x3          | 00011 | Bitwise OR (Or, Ori)                 |
| 0x4          | 00100 | Bitwise XOR (Xor, Xori)              |
| 0x5          | 00101 | Shift Left Logical (SLL, SLLI)       |
| 0x6          | 00110 | Shift Right Logical (SRL, SRLI)      |
| 0x7          | 00111 | Shift Right Arithmetic (SRA, SRAI)   |
| 0x8          | 01000 | Set Less Than (SLT, SLTI)            |
| 0x9          | 01001 | Set Less Than Unsigned (SLTU, SLTUI) |
| 0xA          | 01010 | Equality (Beq, Bne)                  |
| 0xB          | 01011 | LT Comparisons (BLT, BGE, etc)       |
| 0xC          | 01100 | Multiplication(MUL)                  |
| 0xD          | 01101 | Division (DIV)                       |
| 0xE          | 01110 | Remainder (REM)                      |
| 0xF          | 01111 | No OP (NOP)                          |
