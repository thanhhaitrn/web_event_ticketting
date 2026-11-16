/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 3 — DỰ BÁO BÁN THAM KHẢO  (mục 9.6, S2-17)
 *
 * Cập nhật Bayes kiểu Gamma–Poisson theo từng chu kỳ 15 phút, có giảm dần theo thời gian:
 *
 *   n_eff = Σ w_i · Δn_i,   τ_eff = Σ w_i · Δt_i,   w_i = 0,5^((now − t_i) / chu kỳ bán rã)
 *   λ̂  = (α0 + n_eff) / (β0 + τ_eff)
 *   F̂  = min(C, S + λ̂ · R)
 *   α0 = 12 · λ0,  β0 = 12,  λ0 = k · C / T
 *
 *   R: số giờ còn lại của đợt; T: thời lượng đợt (giờ); λ0: tốc độ bán kỳ vọng ban đầu.
 *
 * QUYẾT ĐỊNH THIẾT KẾ (từ số đo trong hồ sơ):
 *   - Chỉ hiển thị cho BTC, chỉ từ mốc 50% đợt.
 *   - Hiển thị dạng mức Thấp / Vừa / Cao, KHÔNG hiển thị xác suất %.
 *   - Gắn nhãn "tham khảo".
 *   - KHÔNG nằm trong công thức giá (phần 01 không import file này).
 */

export interface DemandLogPoint {
  at: Date;
  sold: number;
}

export interface ForecastInput {
  capacity: number; // C
  sold: number; // S hiện tại
  logs: DemandLogPoint[]; // DemandLog của (khu vực, đêm, đợt), thứ tự bất kỳ
  phaseStart: Date;
  phaseEnd: Date;
  now: Date;
  k?: number; // 0,9
  halfLifeHours?: number; // 12
  priorHours?: number; // β0 = 12
  minProgressToShow?: number; // 0,5
}

export type ForecastLevel = "low" | "medium" | "high";

export const LEVEL_LABEL_VI: Record<ForecastLevel, string> = {
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
};

/**
 * Ngưỡng mức theo tỷ lệ lấp đầy dự báo F̂ / C.
 * Hồ sơ chưa chốt ngưỡng; nhóm đề xuất: < 60% Thấp, < 90% Vừa, ≥ 90% Cao
 * (90% ≈ đường kỳ vọng k). Cần hiệu chuẩn lại trên DemandLog thật ở Sprint sau.
 */
export const LEVEL_THRESHOLDS = { medium: 0.6, high: 0.9 };

export interface ForecastResult {
  visible: boolean; // false khi chưa tới mốc 50% đợt
  reason?: string;
  progress: number;
  lambdaPerHour: number; // λ̂
  forecastSold: number; // F̂ (đã làm tròn)
  forecastFill: number; // F̂ / C
  level: ForecastLevel;
  levelLabel: string;
  label: "tham khảo";
}

const HOUR = 3_600_000;

export function forecastSellThrough(input: ForecastInput): ForecastResult {
  const C = input.capacity;
  const k = input.k ?? 0.9;
  const halfLife = input.halfLifeHours ?? 12;
  const beta0 = input.priorHours ?? 12;
  const minProgress = input.minProgressToShow ?? 0.5;

  const T = Math.max(1e-9, (input.phaseEnd.getTime() - input.phaseStart.getTime()) / HOUR);
  const nowH = input.now.getTime();
  const progress = Math.min(1, Math.max(0, (nowH - input.phaseStart.getTime()) / HOUR / T));
  const R = Math.max(0, (input.phaseEnd.getTime() - nowH) / HOUR);

  const lambda0 = (k * C) / T;
  const alpha0 = beta0 * lambda0;

  // Bắt đầu từ mốc mở đợt với S = 0, rồi các điểm DemandLog trước `now`.
  const pts = [{ at: input.phaseStart, sold: 0 }, ...input.logs]
    .filter((p) => p.at.getTime() >= input.phaseStart.getTime() && p.at.getTime() <= nowH)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let nEff = 0;
  let tauEff = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].at.getTime() - pts[i - 1].at.getTime()) / HOUR;
    if (dt <= 0) continue;
    const dn = Math.max(0, pts[i].sold - pts[i - 1].sold);
    const ageH = (nowH - pts[i].at.getTime()) / HOUR;
    const w = Math.pow(0.5, ageH / halfLife);
    nEff += w * dn;
    tauEff += w * dt;
  }

  const lambda = (alpha0 + nEff) / (beta0 + tauEff);
  const F = Math.min(C, input.sold + lambda * R);
  const fill = C > 0 ? F / C : 0;
  const level: ForecastLevel = fill >= LEVEL_THRESHOLDS.high ? "high" : fill >= LEVEL_THRESHOLDS.medium ? "medium" : "low";
  const visible = progress >= minProgress;

  return {
    visible,
    reason: visible ? undefined : "Dự báo chỉ đáng tin từ giữa đợt (mốc 50%).",
    progress,
    lambdaPerHour: lambda,
    forecastSold: Math.round(F),
    forecastFill: fill,
    level,
    levelLabel: LEVEL_LABEL_VI[level],
    label: "tham khảo",
  };
}
