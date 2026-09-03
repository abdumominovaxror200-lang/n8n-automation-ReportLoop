'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildInsightBrief } = require('./insight_brief.js');

test('brief selects the largest movers and emits threshold flags and facts', () => {
  const brief = buildInsightBrief({
    period_label: 'August 2026 vs July 2026',
    sessions_current: 700,
    sessions_previous: 1000,
    sessions_delta_pct: -0.30,
    conversions_current: 80,
    conversions_previous: 100,
    conversions_delta_pct: -0.20,
    cpl_current: 13,
    cpl_previous: 10,
    cpl_delta_pct: 0.30,
    spend_current: 1200,
    spend_previous: 1000,
    spend_delta_pct: 0.20,
    leads_current: 103,
    leads_previous: 100,
    leads_delta_pct: 0.03,
    data_quality: JSON.stringify([{ detail: 'One source supplied 30 daily rows.' }]),
  });
  assert.deepEqual(brief.movers.map((mover) => mover.metric), ['cpl', 'sessions', 'conversions']);
  assert.deepEqual(brief.movers.map((mover) => mover.direction), ['up', 'down', 'down']);
  assert.deepEqual(brief.flags.map((flag) => flag.code), [
    'cpl_up', 'conversions_down', 'spend_up_leads_flat', 'sessions_down',
  ]);
  assert.equal(brief.has_meta, true);
  for (const fact of ['2026', '$10', '$13', '30.0%']) assert.ok(brief.facts.includes(fact));
});

test('brief handles missing Meta and flags zero previous values', () => {
  const empty = buildInsightBrief({ period_label: '', data_quality: [] });
  assert.deepEqual(empty.movers, []);
  assert.deepEqual(empty.flags, []);
  assert.deepEqual(empty.facts, []);
  assert.equal(empty.has_meta, false);

  const zero = buildInsightBrief({
    period_label: 'Current vs previous',
    leads_current: 0,
    leads_previous: 0,
    leads_delta_pct: null,
    data_quality: '[]',
  });
  assert.deepEqual(zero.movers, []);
  assert.equal(zero.has_meta, true);
  assert.deepEqual(zero.flags.map((flag) => flag.code), ['no_comparison']);
  assert.equal(zero.flags[0].metric, 'leads');
  assert.equal(zero.flags[0].previous, '0');
  assert.ok(zero.facts.includes('0'));
});
