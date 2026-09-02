'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { mapGa4RunReport } = require('./ga4_map.js');
const { buildKpiReport } = require('./kpi.js');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample_ga4_runreport.json'), 'utf8'),
);

const period = {
  current: { start: '2026-08-01', end: '2026-08-30' },
  previous: { start: '2026-07-02', end: '2026-07-31' },
};

test('GA4 runReport mapper emits the kpi.js row contract', () => {
  const mapped = mapGa4RunReport(fixture);
  assert.equal(mapped.rows.length, 60);
  assert.deepEqual(mapped.rows[0], {
    date: '2026-07-02',
    sessions: 95,
    users: 70,
    new_users: 18,
    conversions: 4,
  });
  assert.deepEqual(Object.keys(mapped.rows[0]), [
    'date', 'sessions', 'users', 'new_users', 'conversions',
  ]);
});

test('existing KPI core computes hand-checked GA4 period deltas', () => {
  const report = buildKpiReport({
    period,
    ga4: mapGa4RunReport(fixture),
    meta: null,
    gads: null,
    extra: null,
    kpis: ['sessions', 'users', 'new_users', 'conversions'],
  });
  const metrics = Object.fromEntries(report.metrics.map((metric) => [metric.key, metric]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, [value.current, value.previous]])),
    {
      sessions: [3360, 2910],
      users: [2400, 2160],
      new_users: [690, 570],
      conversions: [165, 135],
    },
  );
  assert.equal(metrics.sessions.delta_abs, 450);
  assert.equal(metrics.sessions.delta_pct, 450 / 2910);
  assert.equal(metrics.users.delta_pct, 240 / 2160);
  assert.equal(metrics.new_users.delta_pct, 120 / 570);
  assert.equal(metrics.conversions.delta_pct, 30 / 135);
});

test('mapper rejects malformed metric values instead of silently coercing them', () => {
  const malformed = structuredClone(fixture);
  malformed.rows[0].metricValues[0].value = 'not-a-number';
  assert.throws(() => mapGa4RunReport(malformed), /non-numeric sessions/);
});
