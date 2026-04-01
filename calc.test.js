const assert = require('assert');
const { calcScenario, buildGrid } = require('./calc');

const EPSILON = 0.01;
function near(actual, expected, msg) {
  assert(
    Math.abs(actual - expected) < EPSILON,
    `${msg}: expected ~${expected}, got ${actual}`
  );
}

// Default test inputs
const base = {
  principalRMB: 5000000,
  spotOpen: 4.70,
  forward: 4.70,
  barrier: 4.59,
  annualYield: 0.0575,
  months: 2,
  triggerSpot: 4.55,
  rebuySpot: 4.55
};

// ── Carry calculation ──────────────────────────────────────────
(function testCarry() {
  const { scenarioNoTrigger, scenarioTrigger } = calcScenario(base);
  const expectedCarry = 5000000 * 0.0575 * (2 / 12); // 47916.67
  near(scenarioNoTrigger.carryRMB, expectedCarry, 'S1 carry');
  near(scenarioTrigger.carryRMB, expectedCarry, 'S2 carry');
  console.log('PASS: carry calculation');
})();

(function testCarryZeroMonths() {
  const out = calcScenario({ ...base, months: 0 });
  near(out.scenarioNoTrigger.carryRMB, 0, 'carry with 0 months');
  console.log('PASS: carry zero months');
})();

// ── Scenario 1: no trigger — settle at forward ─────────────────
(function testScenarioNoTrigger() {
  const { scenarioNoTrigger } = calcScenario(base);
  const initialAUD = 5000000 / 4.70;
  near(scenarioNoTrigger.initialAUD, initialAUD, 'S1 initialAUD');
  assert.strictEqual(scenarioNoTrigger.settleRate, 4.70);
  near(scenarioNoTrigger.rmbFromInitialAUD, initialAUD * 4.70, 'S1 rmbFromInitialAUD');
  near(scenarioNoTrigger.pnlVsPrincipalRMB, initialAUD * 4.70 - 5000000, 'S1 exchange pnl');

  // totalPnlRMB includes carry
  const expectedTotal = scenarioNoTrigger.pnlVsPrincipalRMB + scenarioNoTrigger.carryRMB;
  near(scenarioNoTrigger.totalPnlRMB, expectedTotal, 'S1 totalPnlRMB');
  console.log('PASS: scenario 1 (no trigger)');
})();

(function testNoTriggerAlwaysSettlesAtForward() {
  // Even when spotOpen != forward, settlement is always at F
  const out = calcScenario({ ...base, spotOpen: 4.50, forward: 4.70 });
  assert.strictEqual(out.scenarioNoTrigger.settleRate, 4.70, 'always settles at F');
  const initialAUD = 5000000 / 4.50;
  near(out.scenarioNoTrigger.rmbFromInitialAUD, initialAUD * 4.70, 'settle at F not S0');
  console.log('PASS: no trigger always settles at forward');
})();

// ── Scenario 2: barrier triggered ───────────────────────────────
(function testScenarioTriggerCore() {
  const { scenarioTrigger } = calcScenario(base);
  const initialAUD = 5000000 / 4.70;

  // 2x rule is based on AUD (critical requirement from ai-context.md)
  near(scenarioTrigger.totalAUD, 2 * initialAUD, 'S2 totalAUD = 2x initialAUD');

  // Settle at forward
  near(scenarioTrigger.totalRMBReceived, 2 * initialAUD * 4.70, 'S2 totalRMBReceived');

  // Remaining RMB after paying original plan
  near(scenarioTrigger.remainingRMB, 2 * initialAUD * 4.70 - 5000000, 'S2 remainingRMB');

  // Rebuy AUD
  const expectedRebought = scenarioTrigger.remainingRMB / 4.55;
  near(scenarioTrigger.reboughtAUD, expectedRebought, 'S2 reboughtAUD');

  // Net AUD change
  const expectedNetAUD = expectedRebought - initialAUD;
  near(scenarioTrigger.netAUDChange, expectedNetAUD, 'S2 netAUDChange');

  // Exchange P&L = net AUD gain valued at rebuy rate
  near(scenarioTrigger.pnlVsPrincipalRMB, expectedNetAUD * 4.55, 'S2 exchangePnlRMB');

  // totalPnlRMB includes carry
  const expectedTotal = scenarioTrigger.pnlVsPrincipalRMB + scenarioTrigger.carryRMB;
  near(scenarioTrigger.totalPnlRMB, expectedTotal, 'S2 totalPnlRMB');

  console.log('PASS: scenario 2 (barrier triggered)');
})();

(function testTriggerWithDifferentForward() {
  const out = calcScenario({ ...base, forward: 4.80 });
  const initialAUD = 5000000 / 4.70;
  near(out.scenarioTrigger.totalRMBReceived, 2 * initialAUD * 4.80, 'S2 custom forward');
  console.log('PASS: scenario 2 (custom forward)');
})();

// ── finalAUDValueInRMB ─────────────────────────────────────────
(function testFinalAUDValueInRMB() {
  const { scenarioTrigger } = calcScenario(base);
  near(
    scenarioTrigger.finalAUDValueInRMB,
    scenarioTrigger.finalTotalAUD * scenarioTrigger.rebuySpot,
    'finalAUDValueInRMB'
  );
  console.log('PASS: finalAUDValueInRMB');
})();

// ── Return shape ────────────────────────────────────────────────
(function testReturnShape() {
  const out = calcScenario(base);
  assert(out.scenarioNoTrigger, 'has scenarioNoTrigger');
  assert(out.scenarioTrigger, 'has scenarioTrigger');
  assert.strictEqual(out.scenarioAbove, undefined, 'old scenarioAbove removed');
  assert.strictEqual(out.scenarioMid, undefined, 'old scenarioMid removed');
  console.log('PASS: return shape');
})();

// ── buildGrid ───────────────────────────────────────────────────
(function testBuildGridRowCount() {
  const rows = buildGrid(5000000, 4.70, 0.0575, 2, 4.70, 4.55);
  // 5 openSpots × 3 rebuySpots = 15
  assert.strictEqual(rows.length, 15, 'grid row count');
  console.log('PASS: buildGrid row count');
})();

(function testBuildGridDynamicRanges() {
  const rows = buildGrid(5000000, 4.70, 0.0575, 2, 4.70, 4.55);
  const s0Values = [...new Set(rows.map(r => r.s0))];
  const s1Values = [...new Set(rows.map(r => r.s1))];

  near(s0Values[0], 4.60, 'grid S0 min');
  near(s0Values[2], 4.70, 'grid S0 center');
  near(s0Values[4], 4.80, 'grid S0 max');

  near(s1Values[0], 4.60, 'grid S1 high');
  near(s1Values[1], 4.55, 'grid S1 center');
  near(s1Values[2], 4.50, 'grid S1 low');

  console.log('PASS: buildGrid dynamic ranges');
})();

(function testBuildGridCarryAndTotalPnl() {
  const rows = buildGrid(5000000, 4.70, 0.0575, 2, 4.70, 4.55);
  const expectedCarry = 5000000 * 0.0575 * (2 / 12);
  rows.forEach((r, i) => {
    near(r.carryRMB, expectedCarry, `grid row ${i} carryRMB`);
    near(r.totalPnlRMB, r.pnlVsPrincipalRMB + r.carryRMB, `grid row ${i} totalPnlRMB`);
  });
  console.log('PASS: buildGrid carry and totalPnlRMB');
})();

// ── Edge cases ──────────────────────────────────────────────────
(function testSpotEqualsForward() {
  const out = calcScenario({ ...base, spotOpen: 4.70, forward: 4.70 });
  near(out.scenarioNoTrigger.pnlVsPrincipalRMB, 0, 'S0==F exchange pnl');
  console.log('PASS: edge case S0 == F');
})();

(function testRebuySpotEqualsBarrier() {
  const out = calcScenario({ ...base, rebuySpot: 4.59 });
  const initialAUD = 5000000 / 4.70;
  const remaining = 2 * initialAUD * 4.70 - 5000000;
  near(out.scenarioTrigger.reboughtAUD, remaining / 4.59, 'rebuy at barrier');
  console.log('PASS: edge case rebuySpot == barrier');
})();

(function testLargePrincipal() {
  const out = calcScenario({ ...base, principalRMB: 100000000 });
  const initialAUD = 100000000 / 4.70;
  near(out.scenarioTrigger.totalAUD, 2 * initialAUD, 'large principal 2x');
  console.log('PASS: edge case large principal');
})();

console.log('\n✅ All tests passed.');
