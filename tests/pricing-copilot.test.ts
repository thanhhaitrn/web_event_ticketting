/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Kiểm thử 3 thành phần
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { trend24h, buildPublicPriceView, buildHistorySeries, priceAt } from "@/lib/pricing-copilot/transparency";
import { runWhatIf } from "@/lib/pricing-copilot/what-if-simulator";
import { forecastSellThrough } from "@/lib/pricing-copilot/demand-forecast";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 1);
const at = (h: number) => new Date(T0 + h * H);

describe("TP1 — Giá minh bạch", () => {
  test("nhãn xu hướng: chênh < 2% × B là ổn định", () => {
    assert.equal(trend24h(2_030_000, 2_000_000, 2_000_000), "stable");
    assert.equal(trend24h(2_040_000, 2_000_000, 2_000_000), "up");
    assert.equal(trend24h(1_800_000, 2_000_000, 2_000_000), "down");
  });

  test("chuỗi bậc thang và P24", () => {
    const s = buildHistorySeries(
      [{ createdAt: at(10), newPrice: 2_200_000 }, { createdAt: at(30), newPrice: 2_400_000 }],
      2_000_000, at(0), at(40),
    );
    assert.deepEqual(s.map((p) => p.price), [2_000_000, 2_200_000, 2_400_000, 2_400_000]);
    assert.equal(priceAt(s, at(16)), 2_200_000);
  });

  test("view công khai: không lộ O/E/rule, có nhãn 'Giá thay đổi theo nhu cầu'", () => {
    const v = buildPublicPriceView({
      zoneId: "VIP", base: 2_000_000, dynamic: true, phaseStart: at(0), now: at(40),
      capacity: 1000, sold: 600, held: 50,
      changes: [{ createdAt: at(10), newPrice: 2_200_000 }, { createdAt: at(30), newPrice: 2_400_000 }],
    });
    assert.equal(v.currentPrice, 2_400_000);
    assert.equal(v.trend, "up"); // P24 (giờ 16) = 2.200k
    assert.equal(v.seatsLeft, 350);
    assert.equal(v.notice, "Giá thay đổi theo nhu cầu");
    for (const key of ["occupancy", "expected", "rule", "forecast"]) assert.ok(!(key in v));
  });

  test("view công khai so sánh với giá gốc: % chênh, biến động 24 giờ, thấp nhất / cao nhất", () => {
    const v = buildPublicPriceView({
      zoneId: "VIP", base: 2_000_000, dynamic: true,
      bounds: { floor: 1_600_000, ceiling: 3_000_000 },
      phaseStart: at(0), now: at(48), capacity: 100, sold: 40, held: 0,
      changes: [
        { createdAt: at(10), newPrice: 1_800_000 },
        { createdAt: at(30), newPrice: 2_200_000 },
      ],
    });
    assert.equal(v.basePrice, 2_000_000);
    assert.ok(Math.abs(v.changeFromBase - 0.1) < 1e-9);
    assert.equal(v.change24h, 400_000); // 24 giờ trước (giờ 24) giá là 1,8 tr
    assert.equal(v.lowest, 1_800_000);
    assert.equal(v.highest, 2_200_000);
  });

  test("tắt định giá động → giá cơ bản, không nhãn", () => {
    const v = buildPublicPriceView({
      zoneId: "GA", base: 800_000, dynamic: false, phaseStart: at(0), now: at(40),
      capacity: 100, sold: 0, held: 0, changes: [{ createdAt: at(10), newPrice: 900_000 }],
    });
    assert.equal(v.currentPrice, 800_000);
    assert.equal(v.notice, null);
  });
});

describe("TP2 — Mô phỏng what-if", () => {
  const rows = runWhatIf({ runs: 40 });
  const get = (sc: string, p: string) => rows.find((r) => r.scenario.startsWith(sc) && r.policy === p)!;

  test("0 vi phạm biên ở mọi kịch bản (NFR-03)", () => {
    assert.ok(rows.every((r) => r.boundViolations === 0));
  });

  test("bán nhanh: giá động tăng doanh thu rõ so với giá cố định", () => {
    assert.ok(get("Bán nhanh", "v1.1").revenue > get("Bán nhanh", "fixed").revenue * 1.2);
  });

  test("deadband 2% × B giảm mạnh số lần đổi giá ở kịch bản bán đều", () => {
    assert.ok(get("Bán đều", "v1.1").changesPerDay < get("Bán đều", "v1.1-no-deadband").changesPerDay / 10);
  });

  test("tái lập được với cùng seed", () => {
    assert.deepEqual(runWhatIf({ runs: 5, seed: 7 }), runWhatIf({ runs: 5, seed: 7 }));
  });

  test("từ chối biên giá sai thứ tự", () => {
    assert.throws(() => runWhatIf({ bounds: { floor: 2_100_000, base: 2_000_000, ceiling: 3_000_000 } }), /giá sàn/);
  });
});

describe("TP3 — Dự báo bán tham khảo (Gamma–Poisson)", () => {
  const phase = { phaseStart: at(0), phaseEnd: at(240) };

  test("đầu đợt, chưa có dữ liệu → dự báo ≈ kế hoạch k × C và bị ẩn", () => {
    const f = forecastSellThrough({ capacity: 1000, sold: 0, logs: [], ...phase, now: at(0) });
    assert.equal(f.forecastSold, 900);
    assert.equal(f.visible, false);
  });

  test("giữa đợt bán nhanh gấp đôi kế hoạch → mức Cao, hiển thị, nhãn 'tham khảo'", () => {
    const logs = Array.from({ length: 120 * 4 }, (_, i) => ({ at: new Date(T0 + (i + 1) * 15 * 60_000), sold: Math.round((i + 1) * 0.25 * 7.5) }));
    const sold = logs[logs.length - 1].sold;
    const f = forecastSellThrough({ capacity: 1000, sold, logs, ...phase, now: at(120) });
    assert.equal(f.visible, true);
    assert.equal(f.level, "high");
    assert.equal(f.label, "tham khảo");
    assert.ok(f.forecastSold <= 1000);
  });

  test("bán chậm (1/3 kế hoạch) → mức Thấp; λ̂ bám dữ liệu thật hơn prior", () => {
    const rate = (0.9 * 1000) / 240 / 3; // ghế/giờ
    const logs = Array.from({ length: 120 }, (_, i) => ({ at: at(i + 1), sold: Math.round((i + 1) * rate) }));
    const f = forecastSellThrough({ capacity: 1000, sold: logs[119].sold, logs, ...phase, now: at(120) });
    assert.equal(f.level, "low");
    assert.ok(Math.abs(f.lambdaPerHour - rate) < Math.abs(f.lambdaPerHour - 3.75));
  });
});
