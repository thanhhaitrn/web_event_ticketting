import {
  demoScenarios, runWhatIf, simulateTimeline,
  type DemoConfig, type PolicyResult, type SimulationPoint,
} from "@/lib/pricing-copilot/what-if-simulator";

export type DemoRequest =
  | { mode: "timeline"; config: DemoConfig; scenario: number; purchases: Record<number, number> }
  | { mode: "compare"; config: DemoConfig };
export type DemoResponse =
  | { mode: "timeline"; points: SimulationPoint[] }
  | { mode: "compare"; rows: PolicyResult[] }
  | { mode: "error"; message: string };

self.onmessage = ({ data }: MessageEvent<DemoRequest>) => {
  let result: DemoResponse;
  try {
    const scenarios = demoScenarios(data.config);
    result = data.mode === "timeline"
      ? { mode: "timeline", points: simulateTimeline(data.config, scenarios[data.scenario], data.purchases) }
      : { mode: "compare", rows: runWhatIf({ ...data.config, scenarios, policies: ["fixed", "v1.1"], runs: 200 }) };
  } catch (error) {
    result = { mode: "error", message: error instanceof Error ? error.message : "Không thể chạy mô phỏng." };
  }
  self.postMessage(result);
};
