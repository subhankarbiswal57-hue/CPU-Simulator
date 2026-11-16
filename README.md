# ⚡ Inside the CPU: An Interactive Instruction Execution and Datapath Simulator

An interactive, educational single-page web application designed for students and educators in **Computer Organization & Architecture (COA - Unit 4)**. 

This simulator visually demonstrates how a modern single-bus CPU executes instructions cycle-by-cycle, how data propagates through tri-state gates onto the internal common bus, and how the control unit issues micro-operation control signals during the Fetch, Decode, and Execute phases.

---

## 🌟 Key Features

1. **Interactive Single-Bus Datapath Visualization**:
   - Visualizes all core registers: Program Counter (**PC**), Instruction Register (**IR**), Memory Address Register (**MAR**), Memory Data Register (**MDR**), General Purpose Registers (**R0–R7**), and Temporary Registers **Y** and **Z**.
   - Includes the Arithmetic Logic Unit (**ALU**) with its input Multiplexer (**MUX: SelectY / Select4**).
   - Real-time animated bus data packets travelling along the internal common bus.
   - Dynamic highlighting of active source registers (with yellow glowing `Rout` gates) and active destination registers (with cyan glowing `Rin` gates).

2. **Complete Unit 4 Instruction Coverage**:
   - `ADD R1, R2, R3` (R3 = R1 + R2 using Temp Registers Y and Z)
   - `SUB R1, R2, R3` (R3 = R1 - R2 using ALU subtraction)
   - `LOAD R2, [R1]` (Memory read via MAR, MDR, and WMFC signal)
   - `STORE [R1], R2` (Memory write via MAR, MDR, and RAM commit)
   - `MOV R1, R2` (Direct single-cycle bus transfer)
   - `BRANCH target` (Target address load into PC)

3. **Authentic Fetch-Decode-Execute Cycles**:
   - **Fetch Phase (Steps 1–3)**: `PCout, MARin, Read, Select4, Add, Zin` ➔ `Zout, PCin, WMFC` ➔ `MDRout, IRin`.
   - **Decode Phase (Step 4)**: Control unit decodes opcode and prepares execution sequencer.
   - **Execute Phase (Steps 5+)**: Micro-operations specific to each instruction with arithmetic/memory mutations.

4. **Multi-Speed Execution Controls**:
   - **Next Micro-Step**: Step forward exactly one clock cycle.
   - **Run / Pause**: Continuous automated clock execution with variable speed control slider (0.3s – 2.5s).
   - **Full Instruction**: Instant execution of all remaining micro-steps.
   - **Reset**: Restores CPU registers, memory, and datapath state to factory baseline.

5. **Educational Explanation & Control Signal Monitors**:
   - Beginner-friendly explanations for each micro-step explaining *What is happening?*, *Which register is providing data?*, *Where is it going?*, and *Why this step is necessary*.
   - Active control signals matrix (`PCout`, `MARin`, `Read`, `SelectY`, `Add`, `Zin`, `WMFC`, etc.) lighting up dynamically.
   - Interactive memory inspector allowing live modification of memory contents.

6. **"Learn the Concepts" Deep-Dive**:
   - Dedicated masterclass on Single-Bus Organization, Why Temp Registers Y and Z are required, Memory Interfacing, and a comparison table between Hardwired and Microprogrammed Control Units.

7. **Practice & Quiz Mode**:
   - 5 interactive university-level practice questions testing datapath bottlenecks, register transfers, and WMFC with immediate feedback and scoring.

---

## 🚀 How to Run the Project Locally

No dependencies, Node.js, build tools, or servers are required!

1. Clone or download this repository:
   ```bash
   git clone https://github.com/subhankarbiswal57-hue/CPU-Simulator.git
   cd CPU-Simulator
   ```
2. Open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari, or Brave):
   - **Windows**: Double-click `index.html` or run:
     ```powershell
     start index.html
     ```
   - **macOS**:
     ```bash
     open index.html
     ```
   - **Linux**:
     ```bash
     xdg-open index.html
     ```

---

## 📂 Project Organization

```text
CPU-Simulator/
├── index.html       # Clean semantic layout, CPU datapath SVG/DOM grid, and monitor cards
├── style.css        # Professional dark navy engineering theme with glowing bus animations
├── script.js        # Simulation logic, register transfers, micro-operation sequencing & quiz
└── README.md        # Comprehensive documentation and viva presentation guide
```

---

## 🎓 Demonstrating in a College Evaluation / Viva

When demonstrating this project to a professor or evaluator, follow these steps:

1. **Demonstrate ADD (Single-Bus Dilemma)**:
   - Select `ADD R1, R2, R3`. Click **Next Micro-Step**.
   - Show how the first 3 cycles perform the universal **Instruction Fetch** (PC copies to MAR, memory reads the instruction, and PC is incremented to 104 via ALU Select4).
   - Show Step 5: Explain to the examiner that because of single-bus constraints, two registers cannot drive data at the same time. Hence, `R1` is first buffered into **Register Y** (`R1out, Yin`).
   - Show Step 6: `R2` is placed on the bus (`R2out`), the ALU adds Register Y (`SelectY, Add`), and the result is latched into **Register Z** (`Zin`) because the bus is already occupied by R2.
   - Show Step 7: `Z` is copied into destination `R3` (`Zout, R3in`).

2. **Demonstrate LOAD / STORE & Memory Interfacing**:
   - Select `LOAD R2, [R1]`.
   - Point out the `WMFC` (Wait for Memory Function Completed) control signal and explain how MDR has two sets of gates (`MDRin/MDRout` for the internal CPU bus, and `MDRinE/MDRoutE` for the external memory bus).

3. **Demonstrate Dynamic Customization**:
   - Change memory values in the Data Memory Inspector table and observe how the LOAD instruction fetches the updated value into the CPU registers.

4. **Navigate to "Learn Concepts" and "Practice & Quiz"**:
   - Show the interactive quiz and the comparison between Hardwired and Microprogrammed Control Units.
