import { prisma } from "@/lib/prisma";

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

/** parses a start/end pair; null when either is missing or unparseable or end is not after start */
export function parseShowTimes(startTime: unknown, endTime: unknown) {
  if (typeof startTime !== "string" || typeof endTime !== "string") return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;
  return { start, end };
}
