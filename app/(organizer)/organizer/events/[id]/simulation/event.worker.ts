import { simulateEventTier, type EventTierInput } from "@/lib/pricing-copilot/what-if-simulator";

export type TierResult = ReturnType<typeof simulateEventTier>;
export type EventResult = { rows: TierResult[] } | { error: string };

self.onmessage = ({ data }: MessageEvent<EventTierInput[]>) => {
  let result: EventResult;
  try {
    result = { rows: data.map(simulateEventTier) };
  } catch (error) {
    result = { error: error instanceof Error ? error.message : "Chưa chạy được mô phỏng. Bạn thử lại nhé." };
  }
  self.postMessage(result);
};
