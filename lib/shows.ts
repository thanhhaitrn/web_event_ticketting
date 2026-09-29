import { TimeRange } from "@/lib/domain";

/** parses a start/end pair into a TimeRange; null when either is missing or unparseable or end is not after start */
export function parseShowTimes(startTime: unknown, endTime: unknown): TimeRange | null {
  return TimeRange.tryParse(startTime, endTime);
}
