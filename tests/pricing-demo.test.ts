import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyDemandScenario, DEFAULT_WHAT_IF, DEFAULT_SCENARIOS, simulateEventTier, simulateTimeline, runWhatIf, TICKS_PER_DAY } from "../lib/pricing-copilot/what-if-simulator";

const config = { ...DEFAULT_WHAT_IF, phaseDays: 2, seed: 33 };
const scenario = DEFAULT_SCENARIOS[0];

test("playback matches one Monte Carlo run with the same seed, including the closing boundary", () => {
  const scenario = DEFAULT_SCENARIOS[2];
  const points = simulateTimeline(config, scenario);
  assert.deepEqual(points, simulateTimeline(config, scenario));
  assert.equal(points.length, config.phaseDays * TICKS_PER_DAY + 1);
  const final = points[points.length - 1];
  assert.equal(final.decision, null);
  let revenue = 0;
  for (const [i, point] of points.entries()) {
    if (i > 0) revenue += (point.sold - points[i - 1].sold) * points[i - 1].price;
    assert.ok(point.price >= config.bounds.floor && point.price <= config.bounds.ceiling);
    assert.ok(point.sold <= config.capacity);
    if (point.decision) assert.equal(point.decision.newPrice, point.price);
  }
  const [aggregate] = runWhatIf({ ...config, runs: 1, policies: ["v1.1"], scenarios: [scenario] });
  assert.equal(aggregate.revenue, revenue);
  assert.equal(aggregate.fillRate, final.sold / config.capacity);
});

test("a demand spike is capped by inventory and affects the following quote only", () => {
  const points = simulateTimeline(config, scenario, { 0: 600, 1: 10000 });
  assert.equal(points[0].price, config.bounds.base);
  assert.equal(points[0].soldAtQuote, 0);
  assert.equal(points[0].sold, 600);
  assert.equal(points[1].price, 2200000);
  assert.ok(points[1].decision?.limitedBy.includes("step10"));
  assert.equal(points[1].added, config.capacity - points[1].soldAtQuote);
  assert.equal(points[1].sold, config.capacity);
  assert.ok(points.every(p => p.sold <= config.capacity));
});

test("replaying a purchase at a later tick preserves the preceding history", () => {
  const before = simulateTimeline(config, DEFAULT_SCENARIOS[2]);
  const after = simulateTimeline(config, DEFAULT_SCENARIOS[2], { 19: 100 });
  assert.deepEqual(before.slice(0, 19), after.slice(0, 19));
  assert.equal(after[19].price, before[19].price);
  assert.equal(after[19].sold, before[19].sold + 100);
});

test("daily sales forecasts use the same demand for playback and revenue comparisons", () => {
  const forecast = dailyDemandScenario({ ...config, dailyDemand: 120.5 });
  assert.equal(forecast.demandRatio, 120.5 * config.phaseDays / config.capacity);
  assert.equal(forecast.shape, "even");
  const quiet = dailyDemandScenario({ ...config, dailyDemand: 0 });
  assert.ok(simulateTimeline(config, quiet).every(p => p.sold === 0));
  assert.ok(runWhatIf({ ...config, scenarios: [quiet], runs: 1 }).every(r => r.fillRate === 0));
});

test("event tier uses its own quota, prices and time until the show for both policies and its chart", () => {
  const tier = { ...config, zoneId: "vip", dailyDemand: 45, capacity: 120, phaseDays: 1.5, showAfterPhaseHours: 0 };
  const actual = simulateEventTier(tier);
  const sc = dailyDemandScenario(tier);
  const [fixed, dynamic] = runWhatIf({ ...tier, scenarios: [sc], policies: ["fixed", "v1.1"], runs: 200 });
  assert.equal(actual.fixed, Math.round(fixed.revenue));
  assert.equal(actual.dynamic, Math.round(dynamic.revenue));
  assert.deepEqual(actual.points, simulateTimeline(tier, sc).map(({ tick, price, sold, expected }) => ({ tick, price, sold, expected })));
});

test("saved events can exceed the manual form limits, and short phases have a closing point", () => {
  const tier = { ...config, zoneId: "standing", dailyDemand: 0, capacity: 55_000, phaseDays: 61, showAfterPhaseHours: 12 };
  const long = simulateEventTier(tier);
  assert.equal(long.points.length, 61 * TICKS_PER_DAY + 1);
  assert.equal(long.dynamic, 0);
  assert.equal(simulateEventTier({ ...tier, phaseDays: 1 / 1440 }).points.length, 2);
});

test("sold-out charts end at the first full interval with the last sale price", () => {
  const tier = { ...config, zoneId: "vip", capacity: 10, dailyDemand: 5000, showAfterPhaseHours: 24 };
  const points = simulateTimeline(tier, dailyDemandScenario(tier));
  assert.deepEqual(points.map(p => p.sold), [0, 10]);
  assert.equal(points[1].price, points[0].price);
  assert.equal(points[1].decision, null);
  assert.equal(points[1].expected, config.k / (config.phaseDays * TICKS_PER_DAY));
  const row = simulateEventTier(tier);
  assert.equal(row.points.at(-1)?.tick, 1);
  assert.equal(row.dynamic, tier.capacity * points[0].price);
  assert.equal(simulateTimeline(tier, scenario, { 0: 10 }).length, 1);
});
