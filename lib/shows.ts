import { prisma } from "@/lib/prisma";
import { TimeRange } from "@/lib/domain";

/** the event's start/end always span its nights, so listings and date filters stay right */
export async function syncEventSpan(eventId: string) {
  const span = await prisma.show.aggregate({
    where: { eventId },
    _min: { startTime: true },
    _max: { endTime: true },
  });
  if (!span._min.startTime || !span._max.endTime) return;
  await prisma.event.update({
    where: { id: eventId },
    data: { startTime: span._min.startTime, endTime: span._max.endTime },
  });
}

/** parses a start/end pair into a TimeRange; null when either is missing or unparseable or end is not after start */
export function parseShowTimes(startTime: unknown, endTime: unknown): TimeRange | null {
  return TimeRange.tryParse(startTime, endTime);
}
