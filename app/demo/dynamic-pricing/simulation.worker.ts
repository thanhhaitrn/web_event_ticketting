import {
  comparePolicyDetails, dailyDemandScenario, demandSensitivity, simulateTimeline,
  type DailyDemandConfig, type PolicyDetail, type SensitivityPoint, type SimulationPoint,
} from "@/lib/pricing-copilot/what-if-simulator";

export type DemoRequest = { mode: "timeline" | "compare" | "sensitivity"; config: DailyDemandConfig };
export type DemoResponse =
  | { mode: "timeline"; points: SimulationPoint[] }
  | { mode: "compare"; details: { fixed: PolicyDetail; dynamic: PolicyDetail } }
  | { mode: "sensitivity"; points: SensitivityPoint[] }
  | { mode: "error"; message: string };

/** Ít lần chạy hơn cho đợt dài để biểu đồ độ nhạy vẫn có trong khoảng một giây. */
export function sensitivityRuns(config: DailyDemandConfig) {
  return Math.max(10, Math.min(config.runs ?? 200, Math.round(400 / Math.max(1, config.phaseDays))));
}

export function handle({ mode, config }: DemoRequest): DemoResponse {
  try {
    if (mode === "timeline") return { mode, points: simulateTimeline(config, dailyDemandScenario(config)) };
    if (mode === "compare") return { mode, details: comparePolicyDetails(config) };
    return { mode, points: demandSensitivity(config, sensitivityRuns(config)) };
  } catch (error) {
    return { mode: "error", message: error instanceof Error ? error.message : "Không thể chạy mô phỏng." };
  }
}

if (typeof self !== "undefined" && typeof (self as { postMessage?: unknown }).postMessage === "function" && typeof window === "undefined") {
  self.onmessage = ({ data }: MessageEvent<DemoRequest>) => self.postMessage(handle(data));
}
