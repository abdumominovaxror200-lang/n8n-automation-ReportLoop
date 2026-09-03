'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { efficiencyCheck } = require('./efficiency_check.js');

const period = {
  previous: { start: '2026-06-01', end: '2026-06-30' },
  current: { start: '2026-07-01', end: '2026-07-30' },
  days: 30,
  elapsed_days: 12,
};

const meta = {
  rows: [
    { date: '2026-06-02', spend: 600, leads: 60 },
    { date: '2026-07-02', spend: 900, leads: 60 },
  ],
};

test('finds campaign waste and sums only zero-conversion spend above the threshold', () => {
  const result = efficiencyCheck({
    meta_campaigns: [
      { campaign_name: 'No Leads', spend: '250', actions: [] },
      { campaign_name: 'Small Test', spend: 199, conversions: 0 },
      { campaign_name: 'Working', spend: 500, actions: [{ action_type: 'lead', value: '4' }] },
      { campaign_name: 'No Purchases', spend: 300, conversions: 0 },
    ],
    meta,
    period,
  });
  assert.deepEqual(result.wasted, [
    { campaign_name: 'No Purchases', spend: 300 },
    { campaign_name: 'No Leads', spend: 250 },
  ]);
  assert.equal(result.wasted_total, 550);
});

test('reports a greater-than-30-percent CPL increase and annualized extra cost', () => {
  const result = efficiencyCheck({ meta_campaigns: [], meta, period });
  assert.equal(result.cpl_trend.from, 10);
  assert.equal(result.cpl_trend.to, 15);
  assert.equal(result.cpl_trend.delta_pct, 0.5);
  assert.equal(result.cpl_trend.projected_annual_extra, 3600);
});

test('calculates budget pacing and positive projected overspend', () => {
  const result = efficiencyCheck({
    meta_campaigns: [{ campaign_name: 'Current', spend: 780 }],
    meta,
    monthly_budget: 1000,
    period,
  });
  assert.equal(result.pacing.spent_pct, 0.78);
  assert.equal(result.pacing.month_elapsed_pct, 0.4);
  assert.equal(result.pacing.projected_month_end_spend, 1950);
  assert.equal(result.pacing.projected_overspend, 950);
});

test('returns null sections when no check applies', () => {
  const result = efficiencyCheck({
    meta_campaigns: [{ campaign_name: 'Healthy', spend: 50, conversions: 2 }],
    meta: { rows: [] },
    monthly_budget: '',
    period,
  });
  assert.deepEqual(result, { wasted: null, wasted_total: null, cpl_trend: null, pacing: null });
});

test('missing Meta data cannot create a zero-spend pacing result', () => {
  const result = efficiencyCheck({ meta: null, meta_campaigns: null, monthly_budget: 1000, period });
  assert.deepEqual(result, { wasted: null, wasted_total: null, cpl_trend: null, pacing: null });
});
