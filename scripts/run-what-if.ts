/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 2 — chạy mô phỏng what-if từ dòng lệnh
 *
 *   npm run what-if                         # tham số mặc định (giống hồ sơ)
 *   npm run what-if -- --floor 1500000 --ceiling 2800000 --k 0.85 --runs 300
 */
import { DEFAULT_WHAT_IF, formatTable, runWhatIf } from "@/lib/pricing-copilot/what-if-simulator";

const args = process.argv.slice(2);
const num = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

const d = DEFAULT_WHAT_IF;
const rows = runWhatIf({
  capacity: num("capacity", d.capacity),
  bounds: {
    floor: num("floor", d.bounds.floor),
    base: num("base", d.bounds.base),
    ceiling: num("ceiling", d.bounds.ceiling),
  },
  phaseDays: num("days", d.phaseDays),
  showAfterPhaseHours: num("show-after-hours", d.showAfterPhaseHours),
  k: num("k", d.k),
  runs: num("runs", d.runs),
  seed: num("seed", d.seed),
});

console.log(formatTable(rows));
console.log("\nLưu ý: mô hình cầu là giả định — chỉ dùng để so sánh chính sách, không phải dự báo doanh thu thật.");
