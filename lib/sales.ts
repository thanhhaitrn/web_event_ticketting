type Phase = { id: string; startTime: Date; endTime: Date };

// Half-open intervals avoid two adjacent phases being active at the same instant.
export function saleSummary<T extends Phase>(phases: T[], now = new Date()) {
  const sorted = [...phases].sort((a, b) => +a.startTime - +b.startTime);
  const active = sorted.find((p) => p.startTime <= now && now < p.endTime);
  const upcoming = sorted.find((p) => p.startTime > now);
  const last = [...sorted].sort((a, b) => +b.endTime - +a.endTime)[0];
  return {
    phase: active ?? upcoming ?? last,
    isSelling: !!active,
    isUpcoming: !active && !!upcoming,
    label: active ? "Đang mở bán" : upcoming ? "Sắp mở bán" : last ? "Đã kết thúc" : "Chưa công bố lịch bán",
  };
}
