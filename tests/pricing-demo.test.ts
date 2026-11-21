import { test } from "node:test";
import assert from "node:assert/strict";
import { demoScenarios, DEFAULT_WHAT_IF, DEFAULT_SCENARIOS, simulateTimeline, runWhatIf, TICKS_PER_DAY } from "../lib/pricing-copilot/what-if-simulator";

const config = { ...DEFAULT_WHAT_IF, phaseDays: 2, seed: 33 };
const scenario = DEFAULT_SCENARIOS[0];

test("playback matches one Monte Carlo run with the same seed, including the closing boundary", () => {
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

test("custom hourly demand maps to the same demand for playback and comparisons", () => {
  assert.deepEqual(demoScenarios(config), DEFAULT_SCENARIOS);
  const custom = { ...config, hourlyDemand: 5 };
  const scenario = demoScenarios(custom)[DEFAULT_SCENARIOS.length];
  assert.equal(scenario.demandRatio, 5 * config.phaseDays * 24 / config.capacity);
  assert.equal(scenario.shape, "even");
  const quiet = demoScenarios({ ...config, hourlyDemand: 0 })[DEFAULT_SCENARIOS.length];
  assert.ok(simulateTimeline(config, quiet).every(p => p.sold === 0));
  assert.ok(runWhatIf({ ...config, scenarios: [quiet], runs: 1 }).every(r => r.fillRate === 0));
});
