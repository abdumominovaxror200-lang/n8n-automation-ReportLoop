'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildKpiReport } = require('./kpi.js');
const { mapMetaInsights } = require('./meta_map.js');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'sample_meta_insights.json'),
  'utf8',
));

test('Meta mapper produces daily rows with hand-checked actions and values', () => {
  const mapped = mapMetaInsights(fixture);
  assert.equal(mapped.rows.length, 4);
  assert.deepEqual(mapped.rows[1], {
    date: '2026-07-02',
    spend: 120,
    impressions: 12000,
    clicks: 300,
    ctr: 2.5,
    cpc: 0.4,
    leads: 12,
    purchases: 3,
    revenue: 450,
  });
});

test('existing KPI core computes hand-checked Meta spend, leads, CPL, and ROAS', () => {
  const report = buildKpiReport({
    period: {
      previous: { start: '2026-07-01', end: '2026-07-31' },
      current: { start: '2026-08-01', end: '2026-08-31' },
    },
    ga4: null,
    meta: mapMetaInsights(fixture),
    gads: null,
    extra: null,
    kpis: ['spend', 'leads', 'cpl', 'revenue', 'roas'],
  });
  assert.equal(report.totals.previous.spend, 220);
  assert.equal(report.totals.current.spend, 320);
  assert.equal(report.totals.previous.leads, 22);
  assert.equal(report.totals.current.leads, 32);
  assert.equal(report.metrics.find((metric) => metric.key === 'cpl').previous, 10);
  assert.equal(report.metrics.find((metric) => metric.key === 'cpl').current, 10);
  assert.equal(report.metrics.find((metric) => metric.key === 'roas').previous, 750 / 220);
  assert.equal(report.metrics.find((metric) => metric.key === 'roas').current, 5);
});

test('Meta mapper rejects malformed numeric fields', () => {
  const malformed = structuredClone(fixture);
  malformed.data[0].spend = 'not-a-number';
  assert.throws(() => mapMetaInsights(malformed), /non-numeric spend/);
});
