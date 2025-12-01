// src/data/levels.ts
export type Step = {
  id: string;
  content: string;
};

export type LevelData = {
  id: string;
  title: string;
  correctOrder: Step[];
};

export const LEVELS: Record<string, LevelData> = {
  mckinsey: {
    id: "mckinsey",
    title: "McKinsey 7-Step Problem Solving",
    correctOrder: [
      { id: "m1", content: "Define problem" },
      { id: "m2", content: "Structure problem" },
      { id: "m3", content: "Prioritise issues" },
      { id: "m4", content: "Plan analysis and work" },
      { id: "m5", content: "Conduct analyses" },
      { id: "m6", content: "Synthesise findings" },
      { id: "m7", content: "Develop recommendation" },
    ],
  },
  design_thinking: {
    id: "design_thinking",
    title: "Design Thinking",
    correctOrder: [
      { id: "dt1", content: "Empathize" },
      { id: "dt2", content: "Define" },
      { id: "dt3", content: "Ideate" },
      { id: "dt4", content: "Prototype" },
      { id: "dt5", content: "Test" },
    ],
  },
  bpr: {
    id: "bpr",
    title: "Business Process Reengineering (BPR)",
    correctOrder: [
      { id: "bpr1", content: "Identify process" },
      { id: "bpr2", content: "Analyse As-Is" },
      { id: "bpr3", content: "Design To-Be" },
      { id: "bpr4", content: "Test & Implement To-Be" },
    ],
  },
  dmaic: {
    id: "dmaic",
    title: "DMAIC (Six Sigma)",
    correctOrder: [
      { id: "dm1", content: "Define" },
      { id: "dm2", content: "Measure" },
      { id: "dm3", content: "Analyze" },
      { id: "dm4", content: "Improve" },
      { id: "dm5", content: "Control" },
    ],
  },
  // 新增 8D 流程 (替代 TRIZ)
  eight_d: {
    id: "eight_d",
    title: "8D Problem Solving",
    correctOrder: [
      { id: "8d1", content: "Create team" },
      { id: "8d2", content: "Define problem" },
      { id: "8d3", content: "Implement interim solution" },
      { id: "8d4", content: "Identify root cause" },
      { id: "8d5", content: "Develop corrective actions" },
      { id: "8d6", content: "Implement corrective actions" },
      { id: "8d7", content: "Prevent recurrence" },
      { id: "8d8", content: "Recognise team" },
    ],
  },
};
