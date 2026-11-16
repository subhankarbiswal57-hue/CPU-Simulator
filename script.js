/**
 * ============================================================================
 * Inside the CPU: An Interactive Instruction Execution and Datapath Simulator
 * Core Simulation Engine, Datapath Controller, and UI Interaction Handler
 * Based on Unit 4 of Computer Organization and Architecture (COA)
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. STATE DEFINITIONS
  // --------------------------------------------------------------------------

  // Default CPU Register contents
  const INITIAL_REGISTERS = {
    PC: 100,
    IR: 'ADD R1, R2, R3',
    MAR: 100,
    MDR: 0,
    R0: 5,
    R1: 10,
    R2: 20,
    R3: 0,
    R4: 15,
    R5: 25,
    R6: 0,
    R7: 0,
    Y: 0,
    Z: 0
  };

  // Default Instruction Memory (PC 100 to 112)
  const INITIAL_INSTR_MEMORY = [
    { addr: 100, instr: 'ADD R1, R2, R3' },
    { addr: 104, instr: 'SUB R2, R1, R4' },
    { addr: 108, instr: 'LOAD R2, [R1]' },
    { addr: 112, instr: 'STORE [R1], R2' },
  ];

  // Default Data Memory (Addresses 200 to 216)
  const INITIAL_DATA_MEMORY = [
    { addr: 10,  label: 'Ptr Target', val: 42 },
    { addr: 200, label: 'Data A',     val: 99 },
    { addr: 204, label: 'Data B',     val: 150 },
    { addr: 208, label: 'Data C',     val: 7 },
    { addr: 212, label: 'Data D',     val: 64 },
    { addr: 216, label: 'Buffer',     val: 0 },
  ];

  // Application Simulation State
  const state = {
    registers: { ...INITIAL_REGISTERS },
    instrMemory: JSON.parse(JSON.stringify(INITIAL_INSTR_MEMORY)),
    dataMemory: JSON.parse(JSON.stringify(INITIAL_DATA_MEMORY)),

    currentInstructionObj: {
      type: 'ADD',
      dest: 'R3',
      src1: 'R1',
      src2: 'R2',
      addrReg: 'R1',
      srcReg: 'R2',
      destReg: 'R2',
      targetAddr: 108
    },

    microSteps: [],       // Array of generated micro-operations for currently loaded instruction
    currentStepIndex: 0,  // Index of active micro-step
    clockCycleCount: 1,   // Global clock counter
    isRunning: false,     // Automatic stepping active flag
    runIntervalTimer: null,
    stepDelayMs: 1200,
  };

  // --------------------------------------------------------------------------
  // 2. MICRO-OPERATION GENERATOR FOR UNIT 4 COA INSTRUCTIONS
  // --------------------------------------------------------------------------

  /**
   * Constructs the authentic micro-operation sequence conforming to single-bus datapath rules:
   * 1. Common Fetch Routine (Steps 1 to 3)
   * 2. Decode Phase (Step 4)
   * 3. Execution Routine tailored to the specific instruction (Steps 5+)
   */
  function generateMicroSteps(config) {
    const steps = [];

    // --- PHASE 1: INSTRUCTION FETCH (Standard COA 3-Step Routine) ---
    // Fetch Step 1: PC address to MAR, Memory Read started, ALU increments PC by 4
    steps.push({
      phase: 'FETCH',
      title: 'Fetch Step 1: Memory Address Setup & PC Increment',
      signals: ['PCout', 'MARin', 'Read', 'Select4', 'Add', 'Zin'],
      sourceUnit: 'unit-PC',
      destUnit: 'unit-MAR',
      aluActive: true,
      aluOp: 'PC + 4',
      busPacketVal: state.registers.PC,
      explanation: {
        op: 'Address of current instruction transferred from PC to MAR; Read initiated.',
        source: 'Program Counter (PC)',
        dest: 'Memory Address Register (MAR) & ALU via Bus',
        signals: 'PCout, MARin, Read, Select4, Add, Zin',
        why: 'In single-bus architecture, PC drives the bus so MAR latches the instruction address. Concurrently, the ALU adds 4 using the built-in MUX constant.'
      },
      action: (regs) => {
        regs.MAR = regs.PC;
        regs.Z = regs.PC + 4;
      }
    });

    // Fetch Step 2: Z copied back to PC; Wait for Memory Function Completed
    steps.push({
      phase: 'FETCH',
      title: 'Fetch Step 2: Update PC & Wait for Memory (WMFC)',
      signals: ['Zout', 'PCin', 'WMFC'],
      sourceUnit: 'unit-Z',
      destUnit: 'unit-PC',
      aluActive: false,
      aluOp: 'IDLE',
      busPacketVal: state.registers.PC + 4,
      explanation: {
        op: 'ALU incremented address latched into PC; CPU awaits memory acknowledge.',
        source: 'Temp Register Z',
        dest: 'Program Counter (PC)',
        signals: 'Zout, PCin, WMFC',
        why: 'Zout updates PC so it points to the next sequential instruction. WMFC ensures the CPU waits until the memory controller signals data is ready.'
      },
      action: (regs) => {
        regs.PC = regs.Z;
        // Fetch instruction string from instruction memory based on MAR
        const found = state.instrMemory.find(m => m.addr === regs.MAR);
        regs.MDR = found ? found.instr : configToString(config);
      }
    });

    // Fetch Step 3: MDR copies fetched instruction word into Instruction Register (IR)
    steps.push({
      phase: 'FETCH',
      title: 'Fetch Step 3: Latch Instruction into IR',
      signals: ['MDRout', 'IRin'],
      sourceUnit: 'unit-MDR',
      destUnit: 'unit-IR',
      aluActive: false,
      aluOp: 'IDLE',
      busPacketVal: 'INST',
      explanation: {
        op: 'The machine instruction from MDR is loaded into the Instruction Register (IR).',
        source: 'Memory Data Register (MDR)',
        dest: 'Instruction Register (IR)',
        signals: 'MDRout, IRin',
        why: 'The IR holds the instruction bit pattern throughout execution so the Control Unit can decode opcode and operands.'
      },
      action: (regs) => {
        regs.IR = configToString(config);
      }
    });

    // --- PHASE 2: DECODE ---
    steps.push({
      phase: 'DECODE',
      title: 'Decode Phase: Opcode Inspection & Micro-Sequence Dispatch',
      signals: [],
      sourceUnit: 'unit-CU',
      destUnit: 'unit-CU',
      aluActive: false,
      aluOp: 'DECODE',
      busPacketVal: null,
      explanation: {
        op: `Control Unit decodes opcode '${config.type}'.`,
        source: 'Instruction Register (IR)',
        dest: 'Control Unit Decoder Logic',
        signals: 'Internal CU Decoder Active',
        why: 'The instruction decoder activates control step generators and sets up bus routing paths for the execution phase.'
      },
      action: () => {}
    });

    // --- PHASE 3: EXECUTION PHASE (Instruction Specific) ---
    switch (config.type) {
      case 'ADD': {
        const { src1, src2, dest } = config;

        // Step 1: src1 -> Y
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Latch First Operand (${src1} -> Y)`,
          signals: [`${src1}out`, 'Yin'],
          sourceUnit: `gpr-${src1}`,
          destUnit: 'unit-Y',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[src1],
          explanation: {
            op: `Move value of ${src1} to temporary Register Y.`,
            source: `${src1} (General Purpose Register)`,
            dest: 'Register Y (ALU Buffer)',
            signals: `${src1}out, Yin`,
            why: 'Because the single bus can carry only one operand at a time, the first operand must be held in Y while the second is placed on the bus.'
          },
          action: (regs) => {
            regs.Y = regs[src1];
          }
        });

        // Step 2: src2 onto bus, ALU computes Y + Bus, result -> Z
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 2: ALU Addition (${src2} + Y -> Z)`,
          signals: [`${src2}out`, 'SelectY', 'Add', 'Zin'],
          sourceUnit: `gpr-${src2}`,
          destUnit: 'unit-Z',
          aluActive: true,
          aluOp: 'ADD',
          busPacketVal: state.registers[src2],
          explanation: {
            op: `ALU adds ${src2} (from common bus) and Register Y, storing sum in Z.`,
            source: `${src2} on bus & Register Y`,
            dest: 'Register Z (ALU Output Latch)',
            signals: `${src2}out, SelectY, Add, Zin`,
            why: 'SelectY directs MUX to choose register Y; Add activates adder logic; Zin catches the output. Z is necessary so bus is not jammed.'
          },
          action: (regs) => {
            regs.Z = regs.Y + regs[src2];
          }
        });

        // Step 3: Z -> dest, End
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 3: Write Result (Z -> ${dest})`,
          signals: ['Zout', `${dest}in`, 'End'],
          sourceUnit: 'unit-Z',
          destUnit: `gpr-${dest}`,
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[src1] + state.registers[src2],
          explanation: {
            op: `Transfer computed sum from Register Z to destination register ${dest}.`,
            source: 'Register Z',
            dest: `${dest} (Destination Register)`,
            signals: `Zout, ${dest}in, End`,
            why: 'Final result is committed to the architecturally visible register. Signal "End" resets cycle counter for the next instruction.'
          },
          action: (regs) => {
            regs[dest] = regs.Z;
          }
        });
        break;
      }

      case 'SUB': {
        const { src1, src2, dest } = config;

        // Step 1: src2 -> Y (we compute src1 - src2, or in COA convention src1 -> Y then src2 subtracted)
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Latch Subtrahend (${src2} -> Y)`,
          signals: [`${src2}out`, 'Yin'],
          sourceUnit: `gpr-${src2}`,
          destUnit: 'unit-Y',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[src2],
          explanation: {
            op: `Move subtrahend ${src2} to temporary Register Y.`,
            source: `${src2}`,
            dest: 'Register Y',
            signals: `${src2}out, Yin`,
            why: 'Pre-buffers the second operand in Y before driving the minuend on the common bus.'
          },
          action: (regs) => {
            regs.Y = regs[src2];
          }
        });

        // Step 2: src1 on bus, ALU Subtract (Bus - Y), result -> Z
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 2: ALU Subtraction (${src1} - Y -> Z)`,
          signals: [`${src1}out`, 'SelectY', 'Subtract', 'Zin'],
          sourceUnit: `gpr-${src1}`,
          destUnit: 'unit-Z',
          aluActive: true,
          aluOp: 'SUB',
          busPacketVal: state.registers[src1],
          explanation: {
            op: `ALU subtracts Register Y from ${src1}, latching difference in Z.`,
            source: `${src1} on bus & Y`,
            dest: 'Register Z',
            signals: `${src1}out, SelectY, Subtract, Zin`,
            why: 'ALU performs 2s complement subtraction and stores the result safely in register Z.'
          },
          action: (regs) => {
            regs.Z = regs[src1] - regs.Y;
          }
        });

        // Step 3: Z -> dest, End
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 3: Store Difference (Z -> ${dest})`,
          signals: ['Zout', `${dest}in`, 'End'],
          sourceUnit: 'unit-Z',
          destUnit: `gpr-${dest}`,
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[src1] - state.registers[src2],
          explanation: {
            op: `Transfer difference from Register Z to destination register ${dest}.`,
            source: 'Register Z',
            dest: `${dest}`,
            signals: `Zout, ${dest}in, End`,
            why: 'The final evaluated subtraction result updates destination register.'
          },
          action: (regs) => {
            regs[dest] = regs.Z;
          }
        });
        break;
      }

      case 'LOAD': {
        const { destReg, addrReg } = config;

        // Step 1: addrReg -> MAR, Read
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Send Target Address (${addrReg} -> MAR, Read)`,
          signals: [`${addrReg}out`, 'MARin', 'Read'],
          sourceUnit: `gpr-${addrReg}`,
          destUnit: 'unit-MAR',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[addrReg],
          explanation: {
            op: `Transfer pointer address from ${addrReg} to MAR; issue memory Read.`,
            source: `${addrReg}`,
            dest: 'MAR & Memory Bus',
            signals: `${addrReg}out, MARin, Read`,
            why: 'MAR holds address for external memory read cycle.'
          },
          action: (regs) => {
            regs.MAR = regs[addrReg];
          }
        });

        // Step 2: WMFC, MDRinE
        steps.push({
          phase: 'EXECUTE',
          title: 'Execute Step 2: Wait for Memory & Latch to MDR (WMFC, MDRinE)',
          signals: ['MDRinE', 'WMFC'],
          sourceUnit: 'unit-Memory',
          destUnit: 'unit-MDR',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: null,
          explanation: {
            op: 'CPU waits for memory acknowledge (MFC) and latches external data into MDR.',
            source: 'External Main Memory (RAM)',
            dest: 'Memory Data Register (MDR)',
            signals: 'MDRinE, WMFC',
            why: 'MDRinE (Memory Data Register In External) opens gate connecting external data bus to MDR.'
          },
          action: (regs) => {
            const memItem = state.dataMemory.find(m => m.addr === regs.MAR);
            regs.MDR = memItem ? memItem.val : 42;
          }
        });

        // Step 3: MDR -> destReg, End
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 3: Transfer Loaded Data (MDR -> ${destReg})`,
          signals: ['MDRout', `${destReg}in`, 'End'],
          sourceUnit: 'unit-MDR',
          destUnit: `gpr-${destReg}`,
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: (state.dataMemory.find(m => m.addr === state.registers[addrReg]) || { val: 42 }).val,
          explanation: {
            op: `Transfer loaded value from MDR via internal bus into ${destReg}.`,
            source: 'MDR',
            dest: `${destReg}`,
            signals: `MDRout, ${destReg}in, End`,
            why: 'Completes LOAD instruction by placing memory value into general purpose register.'
          },
          action: (regs) => {
            regs[destReg] = regs.MDR;
          }
        });
        break;
      }

      case 'STORE': {
        const { addrReg, srcReg } = config;

        // Step 1: addrReg -> MAR
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Set Memory Address (${addrReg} -> MAR)`,
          signals: [`${addrReg}out`, 'MARin'],
          sourceUnit: `gpr-${addrReg}`,
          destUnit: 'unit-MAR',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[addrReg],
          explanation: {
            op: `Address in ${addrReg} is driven to MAR to identify write destination.`,
            source: `${addrReg}`,
            dest: 'MAR',
            signals: `${addrReg}out, MARin`,
            why: 'MAR must latch target address before memory write strobe is triggered.'
          },
          action: (regs) => {
            regs.MAR = regs[addrReg];
          }
        });

        // Step 2: srcReg -> MDR, Write
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 2: Load Data to MDR & Issue Write (${srcReg} -> MDR, Write)`,
          signals: [`${srcReg}out`, 'MDRin', 'Write'],
          sourceUnit: `gpr-${srcReg}`,
          destUnit: 'unit-MDR',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[srcReg],
          explanation: {
            op: `Move data from ${srcReg} to MDR; assert Write command line.`,
            source: `${srcReg}`,
            dest: 'MDR',
            signals: `${srcReg}out, MDRin, Write`,
            why: 'MDR holds data to be written into the external memory location indicated by MAR.'
          },
          action: (regs) => {
            regs.MDR = regs[srcReg];
          }
        });

        // Step 3: MDRoutE, WMFC, End (Commit to Memory)
        steps.push({
          phase: 'EXECUTE',
          title: 'Execute Step 3: Write to RAM & Wait for MFC (MDRoutE, WMFC, End)',
          signals: ['MDRoutE', 'WMFC', 'End'],
          sourceUnit: 'unit-MDR',
          destUnit: 'unit-Memory',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: null,
          explanation: {
            op: 'MDR drives external memory data bus until memory completes write operation.',
            source: 'MDR via external memory bus',
            dest: 'Main Memory (RAM)',
            signals: 'MDRoutE, WMFC, End',
            why: 'MDRoutE transfers data to RAM chips; WMFC ensures memory write timing requirements are fulfilled.'
          },
          action: (regs) => {
            // Update data memory item
            const memItem = state.dataMemory.find(m => m.addr === regs.MAR);
            if (memItem) {
              memItem.val = regs.MDR;
            } else {
              state.dataMemory.push({ addr: regs.MAR, label: 'Written Val', val: regs.MDR });
            }
          }
        });
        break;
      }

      case 'MOV': {
        const { srcReg, destReg } = config;

        // Step 1: srcReg -> destReg directly over the common bus
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Direct Register Transfer (${srcReg} -> ${destReg})`,
          signals: [`${srcReg}out`, `${destReg}in`, 'End'],
          sourceUnit: `gpr-${srcReg}`,
          destUnit: `gpr-${destReg}`,
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: state.registers[srcReg],
          explanation: {
            op: `Direct single-cycle register transfer from ${srcReg} to ${destReg}.`,
            source: `${srcReg}`,
            dest: `${destReg}`,
            signals: `${srcReg}out, ${destReg}in, End`,
            why: 'In a single-bus datapath, transferring between two registers requires only one cycle because one asserts Rout and the other asserts Rin.'
          },
          action: (regs) => {
            regs[destReg] = regs[srcReg];
          }
        });
        break;
      }

      case 'BRANCH': {
        const { targetAddr } = config;

        // Step 1: Immediate address in IR is transferred to PC
        steps.push({
          phase: 'EXECUTE',
          title: `Execute Step 1: Update PC with Branch Target (Offset/Address -> PC)`,
          signals: ['IRout', 'PCin', 'End'],
          sourceUnit: 'unit-IR',
          destUnit: 'unit-PC',
          aluActive: false,
          aluOp: 'IDLE',
          busPacketVal: targetAddr,
          explanation: {
            op: `Branch target address ${targetAddr} loaded directly into Program Counter (PC).`,
            source: 'Instruction Register (IR address field)',
            dest: 'Program Counter (PC)',
            signals: 'IRout, PCin, End',
            why: 'Modifying the PC alters the sequential execution flow, redirecting subsequent fetch cycles to the target address.'
          },
          action: (regs) => {
            regs.PC = targetAddr;
          }
        });
        break;
      }
    }

    return steps;
  }

  function configToString(cfg) {
    switch (cfg.type) {
      case 'ADD': return `ADD ${cfg.src1}, ${cfg.src2}, ${cfg.dest}`;
      case 'SUB': return `SUB ${cfg.src1}, ${cfg.src2}, ${cfg.dest}`;
      case 'LOAD': return `LOAD ${cfg.destReg}, [${cfg.addrReg}]`;
      case 'STORE': return `STORE [${cfg.addrReg}], ${cfg.srcReg}`;
      case 'MOV': return `MOV ${cfg.srcReg}, ${cfg.destReg}`;
      case 'BRANCH': return `BRANCH ${cfg.targetAddr}`;
      default: return 'NOP';
    }
  }

  // --------------------------------------------------------------------------
  // 3. UI INITIALIZATION & DOM CACHE
  // --------------------------------------------------------------------------

  const DOM = {};

  function cacheDom() {
    // Navigation
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    DOM.tabPanes = document.querySelectorAll('.tab-pane');

    // Controls
    DOM.instructionSelect = document.getElementById('instructionSelect');
    DOM.dynamicParams = document.getElementById('dynamicParams');
    DOM.btnLoadProgram = document.getElementById('btnLoadProgram');
    DOM.btnNextStep = document.getElementById('btnNextStep');
    DOM.btnRun = document.getElementById('btnRun');
    DOM.btnPause = document.getElementById('btnPause');
    DOM.btnExecFull = document.getElementById('btnExecFull');
    DOM.btnReset = document.getElementById('btnReset');
    DOM.speedRange = document.getElementById('speedRange');
    DOM.speedValue = document.getElementById('speedValue');

    // KPI Bar
    DOM.kpiPhaseBadge = document.getElementById('kpiPhaseBadge');
    DOM.kpiInstruction = document.getElementById('kpiInstruction');
    DOM.kpiMicroOp = document.getElementById('kpiMicroOp');
    DOM.kpiClock = document.getElementById('kpiClock');
    DOM.kpiStepNum = document.getElementById('kpiStepNum');
    DOM.kpiStepTotal = document.getElementById('kpiStepTotal');
    DOM.kpiProgressBar = document.getElementById('kpiProgressBar');

    // Datapath Components
    DOM.internalBus = document.getElementById('internalBus');
    DOM.busPacket = document.getElementById('busPacket');
    DOM.gprBank = document.getElementById('gprBank');

    DOM.valPC = document.getElementById('val-PC');
    DOM.valIR = document.getElementById('val-IR');
    DOM.valMAR = document.getElementById('val-MAR');
    DOM.valMDR = document.getElementById('val-MDR');
    DOM.valY = document.getElementById('val-Y');
    DOM.valZ = document.getElementById('val-Z');

    DOM.cuStepName = document.getElementById('cuStepName');
    DOM.cuSignalsSnippet = document.getElementById('cuSignalsSnippet');
    DOM.aluOpDisplay = document.getElementById('aluOpDisplay');
    DOM.tagMux = document.getElementById('tagMux');
    DOM.mfcStatus = document.getElementById('mfcStatus');
    DOM.memActivity = document.getElementById('memActivity');

    // Side Panels
    DOM.explStepBadge = document.getElementById('explStepBadge');
    DOM.explOp = document.getElementById('explOp');
    DOM.explSource = document.getElementById('explSource');
    DOM.explDest = document.getElementById('explDest');
    DOM.explSignals = document.getElementById('explSignals');
    DOM.explWhy = document.getElementById('explWhy');
    DOM.controlClockBadge = document.getElementById('controlClockBadge');
    DOM.timelineList = document.getElementById('timelineList');
    DOM.timelineCount = document.getElementById('timelineCount');

    // Inspectors
    DOM.regTableBody = document.getElementById('regTableBody');
    DOM.memInstrTableBody = document.getElementById('memInstrTableBody');
    DOM.memDataTableBody = document.getElementById('memDataTableBody');
    DOM.btnResetMemory = document.getElementById('btnResetMemory');

    // Practice
    DOM.quizCardsContainer = document.getElementById('quizCardsContainer');
    DOM.quizScore = document.getElementById('quizScore');
    DOM.toast = document.getElementById('toastNotification');
  }

  // --------------------------------------------------------------------------
  // 4. RENDERING & VISUALIZATION LOGIC
  // --------------------------------------------------------------------------

  // Render General Purpose Registers in the Datapath Row
  function renderGPRBank() {
    DOM.gprBank.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const regName = `R${i}`;
      const val = state.registers[regName];

      const item = document.createElement('div');
      item.className = 'gpr-item';
      item.id = `gpr-${regName}`;
      item.setAttribute('data-tooltip', `General Purpose Register ${regName}`);

      item.innerHTML = `
        <span class="gpr-name">${regName}</span>
        <span class="gpr-value code-font" id="val-${regName}">${val}</span>
        <div class="gpr-gates">
          <span class="control-gate gate-out" id="gate-${regName}out">${regName}o</span>
          <span class="control-gate gate-in" id="gate-${regName}in">${regName}i</span>
        </div>
      `;
      DOM.gprBank.appendChild(item);
    }
  }

  // Render Dynamic Parameters Input Controls based on Opcode Selection
  function renderDynamicParamInputs() {
    const type = DOM.instructionSelect.value;
    let html = '';

    const regOptions = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']
      .map(r => `<option value="${r}">${r}</option>`).join('');

    switch (type) {
      case 'ADD':
      case 'SUB':
        html = `
          <div class="field-item">
            <label>Src 1</label>
            <select id="paramSrc1" class="form-control">${regOptions}</select>
          </div>
          <div class="field-item">
            <label>Src 2</label>
            <select id="paramSrc2" class="form-control">${regOptions}</select>
          </div>
          <div class="field-item">
            <label>Dest</label>
            <select id="paramDest" class="form-control">${regOptions}</select>
          </div>
        `;
        break;

      case 'LOAD':
        html = `
          <div class="field-item">
            <label>Dest Register</label>
            <select id="paramDestReg" class="form-control">${regOptions}</select>
          </div>
          <div class="field-item">
            <label>Address Pointer Reg</label>
            <select id="paramAddrReg" class="form-control">${regOptions}</select>
          </div>
        `;
        break;

      case 'STORE':
        html = `
          <div class="field-item">
            <label>Address Pointer Reg</label>
            <select id="paramAddrReg" class="form-control">${regOptions}</select>
          </div>
          <div class="field-item">
            <label>Source Data Reg</label>
            <select id="paramSrcReg" class="form-control">${regOptions}</select>
          </div>
        `;
        break;

      case 'MOV':
        html = `
          <div class="field-item">
            <label>Source Reg</label>
            <select id="paramSrcReg" class="form-control">${regOptions}</select>
          </div>
          <div class="field-item">
            <label>Destination Reg</label>
            <select id="paramDestReg" class="form-control">${regOptions}</select>
          </div>
        `;
        break;

      case 'BRANCH':
        html = `
          <div class="field-item">
            <label>Target Address</label>
            <input type="number" id="paramTargetAddr" class="form-control" value="108" min="0" max="999" style="width: 90px;">
          </div>
        `;
        break;
    }

    DOM.dynamicParams.innerHTML = html;

    // Set sensible defaults
    if (type === 'ADD' || type === 'SUB') {
      document.getElementById('paramSrc1').value = 'R1';
      document.getElementById('paramSrc2').value = 'R2';
      document.getElementById('paramDest').value = 'R3';
    } else if (type === 'LOAD') {
      document.getElementById('paramDestReg').value = 'R2';
      document.getElementById('paramAddrReg').value = 'R1';
    } else if (type === 'STORE') {
      document.getElementById('paramAddrReg').value = 'R1';
      document.getElementById('paramSrcReg').value = 'R2';
    } else if (type === 'MOV') {
      document.getElementById('paramSrcReg').value = 'R1';
      document.getElementById('paramDestReg').value = 'R2';
    }
  }

  // Update Dynamic Register Display in Datapath
  function updateDatapathValues() {
    DOM.valPC.textContent = state.registers.PC;
    DOM.valIR.textContent = state.registers.IR;
    DOM.valMAR.textContent = state.registers.MAR;
    DOM.valMDR.textContent = state.registers.MDR;
    DOM.valY.textContent = state.registers.Y;
    DOM.valZ.textContent = state.registers.Z;

    for (let i = 0; i < 8; i++) {
      const el = document.getElementById(`val-R${i}`);
      if (el) el.textContent = state.registers[`R${i}`];
    }
  }

  // Update Lower Inspector Tables (Registers & Memory)
  function renderRegisterTable() {
    const descriptions = {
      PC: 'Program Counter (holds address of next instruction)',
      IR: 'Instruction Register (holds current machine instruction)',
      MAR: 'Memory Address Register (directly drives address bus)',
      MDR: 'Memory Data Register (buffers data to/from RAM)',
      R0: 'General Purpose Register 0',
      R1: 'General Purpose Register 1',
      R2: 'General Purpose Register 2',
      R3: 'General Purpose Register 3',
      R4: 'General Purpose Register 4',
      R5: 'General Purpose Register 5',
      R6: 'General Purpose Register 6',
      R7: 'General Purpose Register 7',
      Y: 'ALU Temp Register Y (buffers first operand)',
      Z: 'ALU Temp Register Z (latches computation result)'
    };

    let html = '';
    for (const [reg, val] of Object.entries(state.registers)) {
      const isNum = typeof val === 'number';
      const hexVal = isNum ? '0x' + (val >= 0 ? val.toString(16).toUpperCase().padStart(4, '0') : 'NEG') : '-';
      const role = descriptions[reg] || 'Internal Register';

      html += `
        <tr id="reg-row-${reg}">
          <td><span class="reg-badge-tag">${reg}</span></td>
          <td>${role}</td>
          <td class="code-font text-cyan">${val}</td>
          <td class="code-font text-muted">${hexVal}</td>
          <td><span class="badge-dot pulse-blue"></span> Active</td>
        </tr>
      `;
    }
    DOM.regTableBody.innerHTML = html;
  }

  function renderMemoryTables() {
    // Instruction Memory Table
    let instrHtml = '';
    state.instrMemory.forEach(m => {
      const isCurrent = m.addr === state.registers.PC;
      instrHtml += `
        <tr class="${isCurrent ? 'active-mem-row' : ''}">
          <td class="code-font text-yellow">${m.addr}</td>
          <td class="code-font">${m.instr}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="window.CPU.loadInstructionFromMem(${m.addr})">Load</button>
          </td>
        </tr>
      `;
    });
    DOM.memInstrTableBody.innerHTML = instrHtml;

    // Data Memory Table
    let dataHtml = '';
    state.dataMemory.forEach((m, idx) => {
      const isTarget = m.addr === state.registers.MAR;
      dataHtml += `
        <tr class="${isTarget ? 'active-mem-row' : ''}">
          <td class="code-font text-cyan">${m.addr}</td>
          <td>${m.label}</td>
          <td class="code-font font-bold text-yellow">${m.val}</td>
          <td>
            <input type="number" class="mem-edit-input" value="${m.val}" onchange="window.CPU.editDataMemory(${idx}, this.value)">
          </td>
        </tr>
      `;
    });
    DOM.memDataTableBody.innerHTML = dataHtml;
  }

  // Render Sidebar Timeline of Micro-steps
  function renderTimeline() {
    DOM.timelineList.innerHTML = '';
    DOM.timelineCount.textContent = `${state.microSteps.length} Micro-Steps`;

    state.microSteps.forEach((step, idx) => {
      let statusClass = 'tl-upcoming';
      if (idx < state.currentStepIndex) statusClass = 'tl-completed';
      else if (idx === state.currentStepIndex) statusClass = 'tl-active';

      const item = document.createElement('div');
      item.className = `timeline-item ${statusClass}`;
      item.innerHTML = `
        <span class="tl-step-badge">T${idx + 1}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <strong>[${step.phase}]</strong> ${step.title}
        </div>
      `;
      DOM.timelineList.appendChild(item);
    });

    // Auto-scroll timeline to active item
    const activeItem = DOM.timelineList.querySelector('.tl-active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // --------------------------------------------------------------------------
  // 5. STEP EXECUTION & DATAPATH ANIMATION
  // --------------------------------------------------------------------------

  function clearActiveHighlights() {
    // Clear energized bus
    DOM.internalBus.classList.remove('bus-energized');
    DOM.busPacket.classList.remove('visible');

    // Clear unit active classes
    document.querySelectorAll('.unit-box, .gpr-item').forEach(el => {
      el.classList.remove('active-source', 'active-destination', 'active-alu');
    });

    // Clear gates
    document.querySelectorAll('.control-gate').forEach(el => el.classList.remove('gate-active'));

    // Clear taps
    document.querySelectorAll('.bus-tap').forEach(el => el.classList.remove('tap-active-out', 'tap-active-in'));

    // Clear signal badges
    document.querySelectorAll('.sig-badge').forEach(el => el.classList.remove('sig-active'));
  }

  function applyStepVisuals(step) {
    clearActiveHighlights();

    // 1. Highlight Active Signals in Control Signal Monitor
    step.signals.forEach(sig => {
      const badge = document.getElementById(`sig-${sig}`);
      if (badge) badge.classList.add('sig-active');

      // Highlight physical gates on components
      const gate = document.getElementById(`gate-${sig}`);
      if (gate) gate.classList.add('gate-active');
    });

    // 2. Highlight Source & Destination Units
    if (step.sourceUnit) {
      const srcEl = document.getElementById(step.sourceUnit);
      if (srcEl) {
        srcEl.classList.add('active-source');
        const tap = srcEl.querySelector('.bus-tap') || document.getElementById(`tap-${step.sourceUnit.replace('unit-', '')}`);
        if (tap) tap.classList.add('tap-active-out');
      }
    }

    if (step.destUnit && step.destUnit !== step.sourceUnit) {
      const destEl = document.getElementById(step.destUnit);
      if (destEl) {
        destEl.classList.add('active-destination');
        const tap = destEl.querySelector('.bus-tap') || document.getElementById(`tap-${step.destUnit.replace('unit-', '')}`);
        if (tap) tap.classList.add('tap-active-in');
      }
    }

    // 3. Highlight ALU when active
    if (step.aluActive) {
      const aluEl = document.getElementById('unit-ALU');
      if (aluEl) aluEl.classList.add('active-alu');
      DOM.aluOpDisplay.textContent = step.aluOp;
    } else {
      DOM.aluOpDisplay.textContent = 'IDLE';
    }

    // 4. Energize Bus & Show Data Packet
    if (step.busPacketVal !== null && step.busPacketVal !== undefined) {
      DOM.internalBus.classList.add('bus-energized');
      DOM.busPacket.textContent = `BUS: ${step.busPacketVal}`;
      DOM.busPacket.classList.add('visible');

      // Animate packet position depending on source/destination
      DOM.busPacket.style.left = step.phase === 'FETCH' ? '30%' : '55%';
    }

    // 5. Update KPI Bar
    DOM.kpiPhaseBadge.textContent = step.phase;
    DOM.kpiPhaseBadge.className = `phase-badge phase-${step.phase.toLowerCase()}`;
    DOM.kpiMicroOp.textContent = step.title;
    DOM.kpiClock.textContent = `T${state.currentStepIndex + 1} (Cycle #${state.clockCycleCount})`;

    const stepNum = state.currentStepIndex + 1;
    const stepTotal = state.microSteps.length;
    DOM.kpiStepNum.textContent = stepNum;
    DOM.kpiStepTotal.textContent = stepTotal;
    DOM.kpiProgressBar.style.width = `${(stepNum / stepTotal) * 100}%`;

    // 6. Update Control Unit snippets
    DOM.cuStepName.textContent = `Step ${stepNum} of ${stepTotal}`;
    DOM.cuSignalsSnippet.textContent = step.signals.length ? `Active: ${step.signals.join(', ')}` : 'Internal Decode';

    // 7. Update Explanation Panel
    DOM.explStepBadge.textContent = `Micro-Step ${stepNum} (T${stepNum})`;
    DOM.explOp.textContent = step.explanation.op;
    DOM.explSource.textContent = step.explanation.source;
    DOM.explDest.textContent = step.explanation.dest;
    DOM.explSignals.textContent = step.explanation.signals;
    DOM.explWhy.textContent = step.explanation.why;
    DOM.controlClockBadge.textContent = `Cycle T${stepNum}`;

    // 8. Memory status text
    if (step.signals.includes('Read')) {
      DOM.memActivity.textContent = `Memory Read initiated from MAR (Addr ${state.registers.MAR})`;
      DOM.mfcStatus.textContent = 'MFC: Strobe Read';
    } else if (step.signals.includes('Write')) {
      DOM.memActivity.textContent = `Memory Write into Addr ${state.registers.MAR}`;
      DOM.mfcStatus.textContent = 'MFC: Strobe Write';
    } else {
      DOM.memActivity.textContent = 'Status: Idle';
      DOM.mfcStatus.textContent = 'MFC: Ready';
    }
  }

  // Execute Exactly One Micro-Step
  function stepForward() {
    if (state.currentStepIndex >= state.microSteps.length) {
      showToast('Instruction execution completed! Reset or load a new instruction.');
      pauseExecution();
      return false;
    }

    const currentStep = state.microSteps[state.currentStepIndex];

    // Apply simulation data mutation
    currentStep.action(state.registers);

    // Update visuals & datapath highlights
    applyStepVisuals(currentStep);
    updateDatapathValues();
    renderRegisterTable();
    renderMemoryTables();

    // Advance pointers
    state.currentStepIndex++;
    state.clockCycleCount++;

    renderTimeline();

    // Check if instruction finished
    if (state.currentStepIndex >= state.microSteps.length) {
      DOM.btnNextStep.disabled = true;
      DOM.btnRun.disabled = true;
      DOM.btnExecFull.disabled = true;
      pauseExecution();
      showToast(`🎉 Instruction ${configToString(state.currentInstructionObj)} executed successfully!`);
      return false;
    }

    return true;
  }

  // Run automatically through clock cycles
  function runAuto() {
    if (state.isRunning) return;
    state.isRunning = true;
    DOM.btnRun.disabled = true;
    DOM.btnPause.disabled = false;
    DOM.btnNextStep.disabled = true;

    state.runIntervalTimer = setInterval(() => {
      const hasMore = stepForward();
      if (!hasMore) {
        pauseExecution();
      }
    }, state.stepDelayMs);
  }

  function pauseExecution() {
    state.isRunning = false;
    if (state.runIntervalTimer) {
      clearInterval(state.runIntervalTimer);
      state.runIntervalTimer = null;
    }
    DOM.btnRun.disabled = state.currentStepIndex >= state.microSteps.length;
    DOM.btnPause.disabled = true;
    DOM.btnNextStep.disabled = state.currentStepIndex >= state.microSteps.length;
  }

  function executeFull() {
    pauseExecution();
    while (state.currentStepIndex < state.microSteps.length) {
      stepForward();
    }
  }

  // Load configured program into simulation datapath
  function loadProgram() {
    pauseExecution();

    const type = DOM.instructionSelect.value;
    const cfg = { type };

    if (type === 'ADD' || type === 'SUB') {
      cfg.src1 = document.getElementById('paramSrc1').value;
      cfg.src2 = document.getElementById('paramSrc2').value;
      cfg.dest = document.getElementById('paramDest').value;
    } else if (type === 'LOAD') {
      cfg.destReg = document.getElementById('paramDestReg').value;
      cfg.addrReg = document.getElementById('paramAddrReg').value;
    } else if (type === 'STORE') {
      cfg.addrReg = document.getElementById('paramAddrReg').value;
      cfg.srcReg = document.getElementById('paramSrcReg').value;
    } else if (type === 'MOV') {
      cfg.srcReg = document.getElementById('paramSrcReg').value;
      cfg.destReg = document.getElementById('paramDestReg').value;
    } else if (type === 'BRANCH') {
      cfg.targetAddr = parseInt(document.getElementById('paramTargetAddr').value, 10) || 108;
    }

    state.currentInstructionObj = cfg;
    state.registers.IR = configToString(cfg);
    DOM.kpiInstruction.textContent = configToString(cfg);

    // Generate fresh micro-steps
    state.microSteps = generateMicroSteps(cfg);
    state.currentStepIndex = 0;

    DOM.btnNextStep.disabled = false;
    DOM.btnRun.disabled = false;
    DOM.btnExecFull.disabled = false;

    clearActiveHighlights();
    updateDatapathValues();
    renderTimeline();
    renderRegisterTable();
    renderMemoryTables();

    // Prepare initial step preview
    if (state.microSteps.length > 0) {
      applyStepVisuals(state.microSteps[0]);
    }

    showToast(`Loaded instruction: ${configToString(cfg)}`);
  }

  // Full reset back to initial factory baseline
  function resetSimulation() {
    pauseExecution();

    state.registers = { ...INITIAL_REGISTERS };
    state.instrMemory = JSON.parse(JSON.stringify(INITIAL_INSTR_MEMORY));
    state.dataMemory = JSON.parse(JSON.stringify(INITIAL_DATA_MEMORY));
    state.clockCycleCount = 1;

    loadProgram();
    showToast('Simulation state restored to baseline.');
  }

  function showToast(msg) {
    if (!DOM.toast) return;
    DOM.toast.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => {
      DOM.toast.classList.add('hidden');
    }, 2800);
  }

  // --------------------------------------------------------------------------
  // 6. PRACTICE QUIZ ENGINE
  // --------------------------------------------------------------------------

  const QUIZ_QUESTIONS = [
    {
      id: 1,
      title: 'Question 1: Single-Bus Bottleneck',
      prompt: 'In a single-bus CPU architecture, why cannot the instruction "ADD R1, R2, R3" be executed in a single clock cycle?',
      options: [
        { text: 'A) The ALU requires microcode which takes multiple cycles to decipher.', correct: false },
        { text: 'B) The single common bus can carry only one operand simultaneously; two operands cannot be placed on the bus at once.', correct: true },
        { text: 'C) Register R3 has a hardware delay that blocks immediate write-back.', correct: false },
        { text: 'D) Tri-state buffers can only drive negative integers on odd cycles.', correct: false },
      ],
      explanation: 'Correct! A single common bus can only hold one value at any moment. Hence, R1 must first be latched into Temp Register Y, and in the next cycle R2 is driven on the bus while Y is added to it.'
    },
    {
      id: 2,
      title: 'Question 2: Role of Temporary Register Z',
      prompt: 'During the micro-operation "R2out, SelectY, Add, Zin", why is the adder output stored in Register Z instead of directly into destination register R3?',
      options: [
        { text: 'A) The common bus is already occupied by R2 (R2out), so the result cannot be routed over the bus to R3 in the same cycle.', correct: true },
        { text: 'B) Register Z inverts the sum to convert it to two’s complement.', correct: false },
        { text: 'C) Writing to R3 requires permission from the Operating System kernel.', correct: false },
        { text: 'D) Register Z contains the hardware parity check circuit.', correct: false },
      ],
      explanation: 'Spot on! Because R2 is actively driving the single bus during this cycle, the bus cannot simultaneously carry the ALU’s output to R3. Register Z latches the output, and in the subsequent cycle, Zout drives the bus into R3.'
    },
    {
      id: 3,
      title: 'Question 3: Memory Access & WMFC',
      prompt: 'What does the control signal WMFC signify during a LOAD or instruction fetch cycle?',
      options: [
        { text: 'A) Write Memory Frequency Clock', correct: false },
        { text: 'B) Wait for Memory Function Completed – pauses the CPU control sequence until memory acknowledges data is ready.', correct: true },
        { text: 'C) Wipe Memory Fast Clear', correct: false },
        { text: 'D) Wideband Modulator Forward Carrier', correct: false },
      ],
      explanation: 'Exactly! External memory (RAM) is significantly slower than CPU clock cycles. WMFC stalls the micro-operation sequencer until the memory controller asserts the MFC signal.'
    },
    {
      id: 4,
      title: 'Question 4: Instruction Fetch Micro-operations',
      prompt: 'Which control signals are typically activated together in the very first step of instruction fetch?',
      options: [
        { text: 'A) PCout, MARin, Read, Select4, Add, Zin', correct: true },
        { text: 'B) Zout, PCin, End', correct: false },
        { text: 'C) MDRout, IRin, Write', correct: false },
        { text: 'D) R1out, R2in, Subtract', correct: false },
      ],
      explanation: 'Correct! In Step 1 of Fetch, PC drives the bus to MAR (PCout, MARin) and initiates Read. Simultaneously, the ALU uses the bus and constant 4 (Select4) to compute the next PC value in Z (Add, Zin).'
    },
    {
      id: 5,
      title: 'Question 5: Hardwired vs Microprogrammed Control',
      prompt: 'What is the primary advantage of a Hardwired Control Unit over a Microprogrammed Control Unit?',
      options: [
        { text: 'A) It is much easier to modify instructions after the chip is fabricated.', correct: false },
        { text: 'B) It is faster in operation because control signals are generated directly by combinational logic gates without ROM read latency.', correct: true },
        { text: 'C) It requires fewer transistors for complex CISC architectures.', correct: false },
        { text: 'D) It eliminates the need for an Arithmetic Logic Unit.', correct: false },
      ],
      explanation: 'Right! Hardwired control units utilize combinational logic and counters, eliminating memory read latency and making them extremely fast (widely used in RISC architectures).'
    }
  ];

  function renderQuiz() {
    DOM.quizCardsContainer.innerHTML = '';
    let answeredCount = 0;
    let correctCount = 0;

    QUIZ_QUESTIONS.forEach(q => {
      const card = document.createElement('div');
      card.className = 'quiz-card card';
      card.id = `quiz-card-${q.id}`;

      let optionsHtml = '';
      q.options.forEach((opt, oIdx) => {
        optionsHtml += `
          <label class="quiz-option-label">
            <input type="radio" name="quiz-q-${q.id}" value="${oIdx}">
            <span>${opt.text}</span>
          </label>
        `;
      });

      card.innerHTML = `
        <h3 class="quiz-question-title">${q.title}</h3>
        <p style="font-size: 0.9rem; color: var(--text-primary); margin-bottom: 1rem;">${q.prompt}</p>
        <div class="quiz-options">
          ${optionsHtml}
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.CPU.checkQuiz(${q.id})">Submit Answer</button>
        <div class="quiz-feedback" id="feedback-q-${q.id}"></div>
      `;
      DOM.quizCardsContainer.appendChild(card);
    });

    DOM.quizScore.textContent = '0';
  }

  function checkQuizAnswer(questionId) {
    const q = QUIZ_QUESTIONS.find(item => item.id === questionId);
    if (!q) return;

    const selectedRadio = document.querySelector(`input[name="quiz-q-${questionId}"]:checked`);
    const feedbackEl = document.getElementById(`feedback-q-${questionId}`);

    if (!selectedRadio) {
      alert('Please select an option first!');
      return;
    }

    const selectedIdx = parseInt(selectedRadio.value, 10);
    const isCorrect = q.options[selectedIdx].correct;

    feedbackEl.className = `quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    feedbackEl.innerHTML = `
      <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect!'}</strong>
      <p style="margin-top: 0.4rem;">${q.explanation}</p>
    `;

    // Recalculate score
    let score = 0;
    QUIZ_QUESTIONS.forEach(item => {
      const sel = document.querySelector(`input[name="quiz-q-${item.id}"]:checked`);
      if (sel && item.options[parseInt(sel.value, 10)].correct) {
        score++;
      }
    });
    DOM.quizScore.textContent = score;
  }

  // --------------------------------------------------------------------------
  // 7. EVENT BINDING & GLOBAL EXPOSURE
  // --------------------------------------------------------------------------

  function bindEvents() {
    // Navigation Tabs
    DOM.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');

        DOM.navTabs.forEach(t => t.classList.remove('active'));
        DOM.tabPanes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Opcode dropdown change
    DOM.instructionSelect.addEventListener('change', () => {
      renderDynamicParamInputs();
    });

    // Control Buttons
    DOM.btnLoadProgram.addEventListener('click', loadProgram);
    DOM.btnNextStep.addEventListener('click', stepForward);
    DOM.btnRun.addEventListener('click', runAuto);
    DOM.btnPause.addEventListener('click', pauseExecution);
    DOM.btnExecFull.addEventListener('click', executeFull);
    DOM.btnReset.addEventListener('click', resetSimulation);

    // Speed Slider
    DOM.speedRange.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.stepDelayMs = val;
      DOM.speedValue.textContent = (val / 1000).toFixed(1) + 's';

      if (state.isRunning) {
        pauseExecution();
        runAuto();
      }
    });

    // Reset Memory button
    DOM.btnResetMemory.addEventListener('click', () => {
      state.dataMemory = JSON.parse(JSON.stringify(INITIAL_DATA_MEMORY));
      renderMemoryTables();
      showToast('Data memory restored to default values.');
    });
  }

  // Expose methods for inline handlers (e.g., table edit or memory load)
  window.CPU = {
    loadInstructionFromMem: (addr) => {
      const m = state.instrMemory.find(item => item.addr === addr);
      if (!m) return;

      // Parse instruction string to populate form
      const parts = m.instr.replace(/,/g, '').split(' ');
      const op = parts[0];

      DOM.instructionSelect.value = op;
      renderDynamicParamInputs();

      if (op === 'ADD' || op === 'SUB') {
        if (document.getElementById('paramSrc1')) document.getElementById('paramSrc1').value = parts[1];
        if (document.getElementById('paramSrc2')) document.getElementById('paramSrc2').value = parts[2];
        if (document.getElementById('paramDest')) document.getElementById('paramDest').value = parts[3];
      } else if (op === 'LOAD') {
        if (document.getElementById('paramDestReg')) document.getElementById('paramDestReg').value = parts[1];
        if (document.getElementById('paramAddrReg')) document.getElementById('paramAddrReg').value = parts[2].replace('[', '').replace(']', '');
      } else if (op === 'STORE') {
        if (document.getElementById('paramAddrReg')) document.getElementById('paramAddrReg').value = parts[1].replace('[', '').replace(']', '');
        if (document.getElementById('paramSrcReg')) document.getElementById('paramSrcReg').value = parts[2];
      }

      state.registers.PC = addr;
      loadProgram();
    },

    editDataMemory: (index, newVal) => {
      const valNum = parseInt(newVal, 10);
      if (!isNaN(valNum)) {
        state.dataMemory[index].val = valNum;
        showToast(`Memory address ${state.dataMemory[index].addr} updated to ${valNum}`);
      }
    },

    checkQuiz: checkQuizAnswer
  };

  // --------------------------------------------------------------------------
  // 8. BOOTSTRAP APPLICATION
  // --------------------------------------------------------------------------

  function init() {
    cacheDom();
    renderGPRBank();
    renderDynamicParamInputs();
    bindEvents();
    renderQuiz();
    loadProgram();
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
