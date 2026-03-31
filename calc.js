/**
 * Forward Extra Scenario Calculator - Pure Calculation Module
 * No side effects, no UI, no state.
 */

function calcScenario({
  principalRMB,
  spotOpen,
  forward,
  barrier,
  annualYield,
  months,
  expirySpot,
  triggerSpot,
  rebuySpot
}) {
  const T = months / 12;
  const initialAUD = principalRMB / spotOpen;
  const carryRMB = principalRMB * annualYield * T;

  // Scenario 1: ST > F
  const s1_rmbFromInitialAUD = initialAUD * forward;
  const s1_pnlVsPrincipalRMB = s1_rmbFromInitialAUD - principalRMB;
  const scenarioAbove = {
    name: "情境 1：高于 Forward",
    trigger: `到期市场 > ${forward}`,
    settleRate: forward,
    initialAUD,
    rmbFromInitialAUD: s1_rmbFromInitialAUD,
    pnlVsPrincipalRMB: s1_pnlVsPrincipalRMB,
    carryRMB,
    totalPnlRMB: s1_pnlVsPrincipalRMB + carryRMB,
    summary: `你放弃更高的市场价，按 ${forward} 结算。`
  };

  // Scenario 2: B <= ST <= F, settle at user-specified expirySpot
  const s2_rmbFromInitialAUD = initialAUD * expirySpot;
  const s2_pnlVsPrincipalRMB = s2_rmbFromInitialAUD - principalRMB;
  const scenarioMid = {
    name: "情境 2：Barrier 与 Forward 之间",
    trigger: `${barrier} ≤ 到期市场 ≤ ${forward}`,
    settleRate: expirySpot,
    initialAUD,
    rmbFromInitialAUD: s2_rmbFromInitialAUD,
    pnlVsPrincipalRMB: s2_pnlVsPrincipalRMB,
    carryRMB,
    totalPnlRMB: s2_pnlVsPrincipalRMB + carryRMB,
    summary: "按到期市场价结算，不触发 2 倍金额。"
  };

  // Scenario 3: barrier triggered
  const totalAUD = 2 * initialAUD;
  const totalRMBReceived = totalAUD * forward;
  const payOriginalPlanRMB = principalRMB;
  const remainingRMB = totalRMBReceived - payOriginalPlanRMB;
  const reboughtAUD = remainingRMB / rebuySpot;
  const netAUDChange = reboughtAUD - initialAUD;
  const finalTotalAUD = reboughtAUD;
  const finalAUDValueInRMB = finalTotalAUD * rebuySpot;
  const s3_pnlVsPrincipalRMB = netAUDChange * rebuySpot;

  const scenarioTrigger = {
    name: "情境 3：触发 Barrier",
    trigger: `观察期内任意时点触及 < ${barrier}`,
    triggerSpot,
    settleRate: forward,
    initialAUD,
    totalAUD,
    totalRMBReceived,
    payOriginalPlanRMB,
    remainingRMB,
    rebuySpot,
    reboughtAUD,
    netAUDChange,
    finalTotalAUD,
    finalAUDValueInRMB,
    carryRMB,
    pnlVsPrincipalRMB: s3_pnlVsPrincipalRMB,
    totalPnlRMB: s3_pnlVsPrincipalRMB + carryRMB,
    summary: `按 ${forward} 结算，但金额固定为初始 AUD 的 2 倍；剩余人民币再按设定赎回汇率买回 AUD。`
  };

  return { scenarioAbove, scenarioMid, scenarioTrigger };
}

function buildGrid(principalRMB, forward, annualYield, months, spotOpen, rebuySpot) {
  const T = months / 12;
  const carryRMB = principalRMB * annualYield * T;

  // Dynamic ranges centered on user inputs
  const openSpots = [-2, -1, 0, 1, 2].map(i =>
    Math.round((spotOpen + i * 0.05) * 10000) / 10000
  );
  const rebuySpots = [1, 0, -1].map(i =>
    Math.round((rebuySpot + i * 0.05) * 10000) / 10000
  );

  const rows = [];
  openSpots.forEach(s0 => {
    rebuySpots.forEach(s1 => {
      const initialAUD = principalRMB / s0;
      const totalAUD = initialAUD * 2;
      const totalRMBReceived = totalAUD * forward;
      const remainingRMB = totalRMBReceived - principalRMB;
      const reboughtAUD = remainingRMB / s1;
      const netAUDChange = reboughtAUD - initialAUD;
      const pnlVsPrincipalRMB = netAUDChange * s1;
      const totalPnlRMB = pnlVsPrincipalRMB + carryRMB;
      rows.push({
        s0, s1, initialAUD, totalAUD, totalRMBReceived,
        remainingRMB, reboughtAUD, netAUDChange,
        carryRMB, pnlVsPrincipalRMB, totalPnlRMB
      });
    });
  });
  return rows;
}

// UMD export for Node.js (tests) and browser (global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcScenario, buildGrid };
}
