/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Test tích hợp PricingService (mục 9.5 "Test tích hợp")
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PricingService } from "../lib/pricing/pricing-service";
import { InMemoryPricingRepository } from "../lib/pricing/in-memory-pricing-repository";
import { resolveHoldPrice } from "../lib/seat-service.hold.patch";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 1);
const at = (h: number) => new Date(T0 + h * H);

function setup(dynamicEnabled = true) {
  const repo = new InMemoryPricingRepository();
  repo.addShow({
    showId: "show1",
    showStart: at(24 * 30),
    phases: [
      { id: "ph1", start: at(0), end: at(240) }, // 10 ngày
      { id: "ph2", start: at(240), end: at(480) },
    ],
    zones: [
      {
        zoneId: "VIP",
        capacity: 1000,
        prices: {
          ph1: { bounds: { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 }, dynamicEnabled },
          ph2: { bounds: { floor: 1_800_000, base: 2_200_000, ceiling: 3_000_000 }, dynamicEnabled },
        },
      },
      { zoneId: "EMPTY", capacity: 0, prices: { ph1: { bounds: { floor: 1, base: 1, ceiling: 1 }, dynamicEnabled: true } } },
    ],
  });
  return { repo, svc: new PricingService(repo) };
}

describe("PricingService", () => {
  test("bán nhanh → tăng 10% × B, ghi một PriceChange có rule", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 600, held: 0 });
    const out = await svc.recompute("show1", at(96)); // p = 0,4
    assert.equal(out.length, 1);
    assert.equal(out[0].oldPrice, 2_000_000);
    assert.equal(out[0].newPrice, 2_200_000);
    assert.match(out[0].rule, /a_cau=\+15\.0%/);
    assert.equal(await svc.currentPrice("show1", "VIP", at(96)), 2_200_000);
  });

  test("recompute gọi hai lần cùng chu kỳ (kể cả song song) chỉ ghi một dòng", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 600, held: 0 });
    const now = at(96);
    await Promise.all([svc.recompute("show1", now), svc.recompute("show1", now)]);
    await svc.recompute("show1", new Date(now.getTime() + 60_000));
    assert.equal(repo.changes.length, 1);
  });

  test("giá khoá khi giữ ghế: giá đổi sau khi giữ không ảnh hưởng giá đã giữ", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 600, held: 0 });
    const lockedPrice = await resolveHoldPrice(svc, "show1", "VIP", at(95.9)); // giá lúc giữ
    await svc.recompute("show1", at(96)); // giá đổi trong 5 phút giữ
    assert.equal(lockedPrice, 2_000_000);
    assert.equal(await svc.currentPrice("show1", "VIP", at(96)), 2_200_000);
  });

  test("tắt dynamicEnabled → luôn basePrice, không ghi PriceChange", async () => {
    const { repo, svc } = setup(false);
    repo.setSeats("show1", "VIP", { sold: 900, held: 0 });
    assert.equal((await svc.recompute("show1", at(96))).length, 0);
    assert.equal(await svc.currentPrice("show1", "VIP", at(96)), 2_000_000);
  });

  test("ngoài thời gian đợt và C = 0 → bỏ qua", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 900, held: 0 });
    assert.equal((await svc.recompute("show1", at(-1))).length, 0);
    assert.equal(await svc.currentPrice("show1", "VIP", at(-1)), null);
    assert.ok(repo.changes.every((c) => c.zoneId !== "EMPTY"));
  });

  test("sang đợt 2 bắt đầu ở giá cơ bản của đợt 2 (không mang giá đợt 1 sang)", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 600, held: 0 });
    await svc.recompute("show1", at(96));
    assert.equal(await svc.currentPrice("show1", "VIP", at(240)), 2_200_000); // base đợt 2
    // O = 0,6; K_1 = 0,45 nên E đầu đợt 2 = 0,45; D = +0,15 → tăng tiếp từ base đợt 2
    const out = await svc.recompute("show1", at(240));
    assert.equal(out[0].oldPrice, 2_200_000);
    assert.equal(out[0].phaseId, "ph2");
  });

  test("giới hạn 24 giờ áp dụng qua nhiều chu kỳ thật", async () => {
    const { repo, svc } = setup();
    repo.setSeats("show1", "VIP", { sold: 900, held: 200 }); // muốn lên trần
    for (let i = 0; i < 8; i++) await svc.recompute("show1", new Date(at(24).getTime() + i * 15 * 60_000));
    assert.equal(await svc.currentPrice("show1", "VIP", at(27)), 2_600_000); // 2.000k + 30% × B
    await svc.recompute("show1", at(24 + 24.5)); // sau 24 giờ P24 = 2.600k → được tăng tiếp
    assert.equal(await svc.currentPrice("show1", "VIP", at(49)), 2_800_000);
  });

  test("hook onSnapshot được gọi cho mọi khu vực có C > 0", async () => {
    const repo = setup().repo;
    const seen: string[] = [];
    const svc = new PricingService(repo, { onSnapshot: (e) => void seen.push(e.zoneId) });
    await svc.recompute("show1", at(10));
    assert.deepEqual(seen, ["VIP"]);
  });

  test("lazyRecompute: currentPrice tự tính lại khi lần tính gần nhất quá 15 phút", async () => {
    const { repo } = setup();
    repo.setSeats("show1", "VIP", { sold: 600, held: 0 });
    const svc = new PricingService(repo, { lazyRecompute: true });
    assert.equal(await svc.currentPrice("show1", "VIP", at(96)), 2_200_000);
  });
});
