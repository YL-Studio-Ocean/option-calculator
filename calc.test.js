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
  expirySpot: 4.65,
  triggerSpot: 4.55,
  rebuySpot: 4.55
};

// ── Carry calculation ──────────────────────────────────────────
(function testCarry() {
  const { scenarioAbove, scenarioMid, scenarioTrigger } = calcScenario(base);
  const expectedCarry = 5000000 * 0.0575 * (2 / 12); // 47916.67
  near(scenarioAbove.carryRMB, expectedCarry, 'S1 carry');
  near(scenarioMid.carryRMB, expectedCarry, 'S2 carry');
  near(scenarioTrigger.carryRMB, expectedCarry, 'S3 carry');
  console.log('PASS: carry calculation');
})();

(function testCarryZeroMonths() {
  const out = calcScenario({ ...base, months: 0 });
  near(out.scenarioAbove.carryRMB, 0, 'carry with 0 months');
  console.log('PASS: carry zero months');
})();

// ── Scenario 1: above forward ──────────────────────────────────
(function testScenario1() {
  const { scenarioAbove } = calcScenario(base);
  const initialAUD = 5000000 / 4.70;
  near(scenarioAbove.initialAUD, initialAUD, 'S1 initialAUD');
  assert.strictEqual(scenarioAbove.settleRate, 4.70);
  near(scenarioAbove.rmbFromInitialAUD, initialAUD * 4.70, 'S1 rmbFromInitialAUD');
  near(scenarioAbove.pnlVsPrincipalRMB, initialAUD * 4.70 - 5000000, 'S1 exchange pnl');

  // totalPnlRMB includes carry
  const expectedTotal = scenarioAbove.pnlVsPrincipalRMB + scenarioAbove.carryRMB;
  near(scenarioAbove.totalPnlRMB, expectedTotal, 'S1 totalPnlRMB');
  console.log('PASS: scenario 1 (above forward)');
})();

// ── Scenario 2: between barrier and forward ─────────────────────
(function testScenario2UsesExpirySpot() {
  const { scenarioMid } = calcScenario(base);
  assert.strictEqual(scenarioMid.settleRate, 4.65, 'S2 should use expirySpot, not midpoint');

  const initialAUD = 5000000 / 4.70;
  near(scenarioMid.rmbFromInitialAUD, initialAUD * 4.65, 'S2 rmbFromInitialAUD');
  near(scenarioMid.pnlVsPrincipalRMB, initialAUD * 4.65 - 5000000, 'S2 exchange pnl');

  const expectedTotal = scenarioMid.pnlVsPrincipalRMB + scenarioMid.carryRMB;
  near(scenarioMid.totalPnlRMB, expectedTotal, 'S2 totalPnlRMB');
  console.log('PASS: scenario 2 (uses expirySpot)');
})();

(function testScenario2DifferentExpirySpot() {
  const out = calcScenario({ ...base, expirySpot: 4.60 });
  assert.strictEqual(out.scenarioMid.settleRate, 4.60, 'S2 custom expirySpot');
  console.log('PASS: scenario 2 (custom expirySpot)');
})();

// ── Scenario 3: barrier triggered ───────────────────────────────
(function testScenario3Core() {
  const { scenarioTrigger } = calcScenario(base);
  const initialAUD = 5000000 / 4.70;

  // 2x rule is based on AUD (critical requirement from ai-context.md)
  near(scenarioTrigger.totalAUD, 2 * initialAUD, 'S3 totalAUD = 2x initialAUD');

  // Settle at forward
  near(scenarioTrigger.totalRMBReceived, 2 * initialAUD * 4.70, 'S3 totalRMBReceived');

  // Remaining RMB after paying original plan
  near(scenarioTrigger.remainingRMB, 2 * initialAUD * 4.70 - 5000000, 'S3 remainingRMB');

  // Rebuy AUD
  const expectedRebought = scenarioTrigger.remainingRMB / 4.55;
  near(scenarioTrigger.reboughtAUD, expectedRebought, 'S3 reboughtAUD');

  // Net AUD change
  const expectedNetAUD = expectedRebought - initialAUD;
  near(scenarioTrigger.netAUDChange, expectedNetAUD, 'S3 netAUDChange');

  // Exchange P&L = net AUD gain valued at rebuy rate (not the tautological remainingRMB - principal)
  near(scenarioTrigger.pnlVsPrincipalRMB, expectedNetAUD * 4.55, 'S3 exchangePnlRMB');

  // totalPnlRMB includes carry
  const expectedTotal = scenarioTrigger.pnlVsPrincipalRMB + scenarioTrigger.carryRMB;
  near(scenarioTrigger.totalPnlRMB, expectedTotal, 'S3 totalPnlRMB');

  console.log('PASS: scenario 3 (barrier triggered)');
})();

(function testScenario3WithDifferentForward() {
  const out = calcScenario({ ...base, forward: 4.80 });
  const initialAUD = 5000000 / 4.70;
  near(out.scenarioTrigger.totalRMBReceived, 2 * initialAUD * 4.80, 'S3 custom forward');
  console.log('PASS: scenario 3 (custom forward)');
})();

// ── Scenario 3: finalAUDValueInRMB renamed correctly ────────────
(function testFinalAUDValueInRMB() {
  const { scenarioTrigger } = calcScenario(base);
  near(
    scenarioTrigger.finalAUDValueInRMB,
    scenarioTrigger.finalTotalAUD * scenarioTrigger.rebuySpot,
    'finalAUDValueInRMB'
  );
  // Should NOT have old property name
  assert.strictEqual(scenarioTrigger.finalTotalRMBAtRebuySpot, undefined, 'old name removed');
  console.log('PASS: finalAUDValueInRMB naming');
})();

// ── No ratioType parameter ──────────────────────────────────────
(function testNoRatioType() {
  // Should work without ratioType
  const out = calcScenario(base);
  assert(out.scenarioTrigger.totalAUD > 0, 'works without ratioType');
  console.log('PASS: no ratioType needed');
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

  // S0 centered on 4.70: [4.60, 4.65, 4.70, 4.75, 4.80]
  near(s0Values[0], 4.60, 'grid S0 min');
  near(s0Values[2], 4.70, 'grid S0 center');
  near(s0Values[4], 4.80, 'grid S0 max');

  // S1 centered on 4.55: [4.60, 4.55, 4.50]
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
  // When S0 == F, scenario 1 exchange pnl should be 0
  near(out.scenarioAbove.pnlVsPrincipalRMB, 0, 'S0==F exchange pnl');
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
