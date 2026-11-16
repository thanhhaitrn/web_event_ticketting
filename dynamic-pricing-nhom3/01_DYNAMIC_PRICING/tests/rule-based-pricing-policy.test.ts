/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  S2-10 Kiểm thử định giá v1.1 (mục 9.5 "Kiểm thử")
 * Chạy: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  RuleBasedPricingPolicy,
  applyChangeLimits,
  demandAdjustment,
} from "../lib/pricing/rule-based-pricing-policy";
import { DEFAULT_PRICING_RULES as R, cumulativeExpected } from "../lib/pricing/rules";
import type { DemandSnapshot, PriceBounds } from "../lib/pricing/types";

const policy = new RuleBasedPricingPolicy();
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function snap(p: Partial<DemandSnapshot>): DemandSnapshot {
  return {
    capacity: 1000, sold: 0, held: 0, phaseProgress: 0, hoursToShow: 1000,
    expectedPrev: 0, expectedEnd: 0.9, currentPrice: 0, price24hAgo: 0, ...p,
  };
}

/** Chạy liên tiếp các chu kỳ cho tới khi giá đứng yên; trả chuỗi giá. */
function chain(b: PriceBounds, d: DemandSnapshot, p24Follows = false, max = 20): number[] {
  const out: number[] = [];
  let P0 = d.currentPrice;
  for (let i = 0; i < max; i++) {
    const q = policy.quote(b, { ...d, currentPrice: P0, price24hAgo: p24Follows ? P0 : d.price24hAgo });
    if (!q.changed) break;
    out.push(q.newPrice);
    P0 = q.newPrice;
  }
  return out;
}

describe("a_cầu — từng nhánh (Bảng 11)", () => {
  const cases: [number, number][] = [
    [0.2, 0.15], [0.15, 0.1], [0.1, 0.05], [0.05, 0], [0, 0], [-0.05, 0],
    [-0.1, -0.05 * (2 / 3)], [-0.15, -0.1 * (2 / 3)], [-0.2, -0.1], [-0.6, -0.1], [0.6, 0.15],
  ];
  for (const [D, a] of cases) test(`D = ${D} → a_cầu = ${a.toFixed(4)}`, () => near(demandAdjustment(D, 500, 1000, R), a));

  test("D > 0,05 nhưng S < max(5, 2% × C) → a_cầu = 0", () => {
    assert.equal(demandAdjustment(0.3, 19, 1000, R), 0); // cần ≥ 20
    near(demandAdjustment(0.3, 20, 1000, R), 0.15);
    assert.equal(demandAdjustment(0.3, 4, 100, R), 0); // cần ≥ 5
  });
});

describe("Bảng 12 — bốn ví dụ", () => {
  test("Ví dụ A — VIP bán nhanh", () => {
    const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };
    const d = snap({ capacity: 1000, sold: 600, held: 50, phaseProgress: 0.4, currentPrice: 2_000_000, price24hAgo: 2_000_000 });
    const q = policy.quote(b, d);
    near(q.occupancy, 0.6); near(q.expected, 0.36); near(q.deviation, 0.24);
    near(q.adjustments.demand, 0.15); assert.equal(q.adjustments.lastMinute, 0); assert.equal(q.adjustments.hold, 0);
    near(q.u, 0.75);
    assert.equal(q.target, 2_750_000);
    // Chuỗi giá theo Bảng 12 khi mỗi bước cách nhau ≥ 24 giờ (P24 theo kịp):
    assert.deepEqual(chain(b, d, true), [2_200_000, 2_400_000, 2_600_000, 2_750_000]);
  });

  test("Ví dụ A — nếu cả chuỗi xảy ra trong 24 giờ thì dừng ở P24 + 30% × B = 2.600.000", () => {
    const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };
    const d = snap({ capacity: 1000, sold: 600, held: 50, phaseProgress: 0.4, currentPrice: 2_000_000, price24hAgo: 2_000_000 });
    assert.deepEqual(chain(b, d, false), [2_200_000, 2_400_000, 2_600_000]);
  });

  test("Ví dụ B — GA bán chậm, gần ngày diễn", () => {
    const b = { floor: 600_000, base: 800_000, ceiling: 1_000_000 };
    const d = snap({ capacity: 5000, sold: 900, held: 20, phaseProgress: 0.9, hoursToShow: 48, currentPrice: 800_000, price24hAgo: 800_000 });
    const q = policy.quote(b, d);
    near(q.occupancy, 0.18); near(q.expected, 0.81); near(q.deviation, -0.63);
    near(q.adjustments.demand, -0.1); near(q.adjustments.lastMinute, -0.1); assert.equal(q.adjustments.hold, 0);
    near(q.u, -1);
    assert.equal(q.target, 600_000);
    assert.deepEqual(chain(b, d), [720_000, 640_000, 600_000]);
  });

  test("Ví dụ C — chạm trần", () => {
    const b = { floor: 1_200_000, base: 1_500_000, ceiling: 1_650_000 };
    const d = snap({ capacity: 500, sold: 480, held: 10, phaseProgress: 0.3, currentPrice: 1_600_000, price24hAgo: 1_500_000 });
    const q = policy.quote(b, d);
    near(q.occupancy, 0.96); near(q.expected, 0.27); near(q.deviation, 0.69);
    near(q.adjustments.demand, 0.15); near(q.adjustments.hold, 0.05);
    near(q.u, 1);
    assert.equal(q.target, 1_650_000);
    assert.deepEqual(chain(b, d), [1_650_000]);
  });

  test("Ví dụ D — sang đợt 2: K cộng dồn giữ giá ở B", () => {
    const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };
    const d = snap({ capacity: 1000, sold: 600, held: 0, phaseProgress: 0, expectedPrev: 0.6, expectedEnd: 0.9, currentPrice: 2_000_000, price24hAgo: 2_000_000 });
    const q = policy.quote(b, d);
    near(q.occupancy, 0.6); near(q.expected, 0.6); near(q.deviation, 0);
    assert.equal(q.u, 0);
    assert.equal(q.target, 2_000_000);
    assert.equal(q.changed, false);
  });

  test("Ví dụ D — lỗi của v1 cũ (E không cộng dồn, K_trước = 0) làm giá tăng sai lên 2.200.000", () => {
    const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };
    const d = snap({ capacity: 1000, sold: 600, phaseProgress: 0, expectedPrev: 0, expectedEnd: 0.3, currentPrice: 2_000_000, price24hAgo: 2_000_000 });
    assert.equal(policy.quote(b, d).newPrice, 2_200_000);
  });
});

describe("Giới hạn thay đổi", () => {
  const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };

  test("ngưỡng đổi tối thiểu 2% × B = 40.000", () => {
    assert.equal(applyChangeLimits(2_000_000, 2_039_000, 2_000_000, b, R).price, 2_000_000);
    assert.deepEqual(applyChangeLimits(2_000_000, 2_039_000, 2_000_000, b, R).limitedBy, ["deadband"]);
    assert.equal(applyChangeLimits(2_000_000, 2_040_000, 2_000_000, b, R).price, 2_040_000);
  });

  test("bước tối đa 10% × B", () => {
    const r = applyChangeLimits(2_000_000, 3_000_000, 2_000_000, b, R);
    assert.equal(r.price, 2_200_000);
    assert.ok(r.limitedBy.includes("step10"));
    assert.equal(applyChangeLimits(2_000_000, 1_600_000, 2_000_000, b, R).price, 1_800_000);
  });

  test("bước 10% làm tròn xuống 1.000 đ (B = 1.234.500 → bước 123.000)", () => {
    const bb = { floor: 1_000_000, base: 1_234_500, ceiling: 2_000_000 };
    assert.equal(applyChangeLimits(1_234_000, 2_000_000, 1_234_000, bb, R).price, 1_357_000);
  });

  test("giới hạn 24 giờ: không quá P24 ± 30% × B", () => {
    const r = applyChangeLimits(2_550_000, 3_000_000, 2_000_000, b, R);
    assert.equal(r.price, 2_600_000);
    assert.ok(r.limitedBy.includes("cap24h"));
  });

  test("giới hạn 24 giờ không kéo giá ngược chiều mục tiêu", () => {
    // P0 đã ở ngoài cửa sổ (P24 + 600k = 2.400k) — chỉ đứng yên, không giảm.
    assert.equal(applyChangeLimits(2_500_000, 2_900_000, 1_800_000, b, R).price, 2_500_000);
  });

  test("luôn trong [sàn, trần] kể cả khi BTC vừa hạ trần", () => {
    const nb = { floor: 1_600_000, base: 2_000_000, ceiling: 2_300_000 };
    assert.equal(applyChangeLimits(2_600_000, 2_300_000, 2_600_000, nb, R).price, 2_300_000);
  });
});

describe("Các trường hợp biên", () => {
  test("a_giờ_chót chỉ khi ≤ 72 giờ VÀ O < 50%", () => {
    const b = { floor: 600_000, base: 800_000, ceiling: 1_000_000 };
    const base = { capacity: 1000, phaseProgress: 0.5, expectedEnd: 0.9, currentPrice: 800_000, price24hAgo: 800_000 };
    assert.equal(policy.quote(b, snap({ ...base, sold: 450, hoursToShow: 72 })).adjustments.lastMinute, -0.1);
    assert.equal(policy.quote(b, snap({ ...base, sold: 450, hoursToShow: 73 })).adjustments.lastMinute, 0);
    assert.equal(policy.quote(b, snap({ ...base, sold: 500, hoursToShow: 10 })).adjustments.lastMinute, 0);
  });

  test("a_giữ: H ≥ max(5, 15% × (C − S))", () => {
    const b = { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 };
    const d = { capacity: 1000, sold: 600, phaseProgress: 0.4, currentPrice: 2_000_000, price24hAgo: 2_000_000 };
    assert.equal(policy.quote(b, snap({ ...d, held: 59 })).adjustments.hold, 0);
    assert.equal(policy.quote(b, snap({ ...d, held: 60 })).adjustments.hold, 0.05);
  });

  test("K_j cộng dồn theo thời lượng đợt (k = 0,9)", () => {
    const day = 86_400_000;
    const K = cumulativeExpected(
      [
        { start: new Date(0), end: new Date(2 * day) },
        { start: new Date(2 * day), end: new Date(5 * day) },
      ],
      0.9,
    );
    near(K[0], 0); near(K[1], 0.36); near(K[2], 0.9);
  });
});

describe("Kiểm thử thuộc tính (ngẫu nhiên, BẬT cả ngưỡng 2% và giới hạn 24 giờ)", () => {
  test("20.000 ca: 0 vi phạm biên, 0 giá lẻ nghìn, bước ≤ 10% × B, |P − P24| ≤ 30% × B", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    for (let i = 0; i < 20_000; i++) {
      const base = ri(100, 5000) * 1000;
      const floor = base - ri(0, Math.floor(base / 2000)) * 1000;
      const ceiling = base + ri(0, base / 1000) * 1000;
      const b = { floor, base, ceiling };
      const P24 = ri(floor / 1000, ceiling / 1000) * 1000;
      const cap = Math.floor((0.3 * base) / 1000) * 1000;
      const P0 = Math.min(ceiling, Math.max(floor, P24 + ri(-cap / 1000, cap / 1000) * 1000));
      const C = ri(1, 5000);
      const S = ri(0, C);
      const d = snap({
        capacity: C, sold: S, held: ri(0, C - S), phaseProgress: rnd(), hoursToShow: ri(0, 500),
        expectedPrev: 0, expectedEnd: 0.9, currentPrice: P0, price24hAgo: P24,
      });
      const q = policy.quote(b, d);
      assert.ok(q.newPrice >= floor && q.newPrice <= ceiling, "ngoài biên");
      assert.equal(q.newPrice % 1000, 0, "giá lẻ nghìn");
      assert.ok(Math.abs(q.newPrice - P0) <= 0.1 * base + 1e-9, "bước > 10%");
      assert.ok(Math.abs(q.newPrice - P24) <= 0.3 * base + 1e-9, "vượt giới hạn 24 giờ");
      if (q.changed) assert.ok(Math.abs(q.newPrice - P0) >= Math.floor((0.02 * base) / 1000) * 1000, "đổi dưới ngưỡng 2%");
    }
  });
});
