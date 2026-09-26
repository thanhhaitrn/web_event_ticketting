export const EVENT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const OFFSET = 7 * 60 * 60 * 1000;

function dayStart(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00+07:00`);
  if (!Number.isFinite(+date)) return null;
  return new Date(+date + OFFSET).toISOString().slice(0, 10) === key ? date : null;
}

export function dateWindow(when: string, from: string, to: string, now = new Date()): [Date | null, Date | null] {
  const local = new Date(+now + OFFSET);
  const today = dayStart(local.toISOString().slice(0, 10))!;
  const day = 86400000;
  if (when === "today") return [today, new Date(+today + day - 1)];
  if (when === "week") return [today, new Date(+today + (((7 - local.getUTCDay()) % 7) + 1) * day - 1)];
  if (when === "month") return [today, new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - OFFSET - 1)];
  if (when === "range") {
    const start = dayStart(from);
    const end = dayStart(to);
    if ((from && !start) || (to && !end) || (start && end && start > end)) return [null, null];
    return [start, end ? new Date(+end + day - 1) : null];
  }
  return [null, null];
}

export function matchesDate(start: Date, from: Date | null, to: Date | null) {
  return (!from || start >= from) && (!to || start <= to);
}
