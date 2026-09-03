'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyInsight, deterministicInsight, MAX_NARRATIVE_LENGTH } = require('./insight_apply.js');

const brief = {
  period_label: 'August 2026 vs July 2026',
  movers: [
    { metric: 'sessions', label: 'Sessions', from: '1,000', to: '800', delta_pct: '-20.0%', direction: 'down' },
    { metric: 'cpl', label: 'Cpl', from: '$10', to: '$12.50', delta_pct: '+25.0%', direction: 'up' },
  ],
  flags: [{ code: 'cpl_up', message: 'Cost per lead rose materially.' }],
  data_quality: [],
  has_meta: true,
  facts: ['2026', '1,000', '800', '20.0%', '$10', '$12.50', '25.0%'],
};

test('clean LLM narrative passes and is split into summary and recommendations', () => {
  const result = applyInsight({ choices: [{ message: { content:
    'Summary:\nSessions moved from 1,000 to 800 (-20.0%), while CPL moved from $10 to $12.50 (+25.0%).\nReview campaign targeting.' } }] }, brief);
  assert.match(result.insight_summary, /1,000 to 800/);
  assert.deepEqual(result.recommendations, ['Review campaign targeting.']);
  assert.equal(result.insight_source, 'llm');
});

test('any invented numeric token rejects the entire narrative', () => {
  const result = applyInsight({ choices: [{ message: { content:
    'Sessions moved from 1,000 to 777 (-20.0%).\nReview campaign targeting.' } }] }, brief);
  assert.deepEqual(result, deterministicInsight(brief));
  assert.doesNotMatch(result.insight_summary, /777/);
});

test('JSON punctuation is not treated as part of an allowed number token', () => {
  const result = applyInsight('Spend moved from $1,000 to $1,200.', {
    movers: [], flags: [], facts: ['$1,000', '$1,200'],
  });
  assert.equal(result.insight_source, 'llm');
});

test('null, empty, and failed provider responses use deterministic fallback', () => {
  assert.deepEqual(applyInsight(null, brief), deterministicInsight(brief));
  assert.deepEqual(applyInsight({}, brief), deterministicInsight(brief));
  assert.deepEqual(applyInsight({ error: { message: 'timeout' } }, brief), deterministicInsight(brief));
});

test('accepted narrative is cleaned and length-bounded', () => {
  const result = applyInsight({ choices: [{ message: { content: `## Summary: **Change noted.** [Details](https://example.test) ${'word '.repeat(500)}` } }] }, { facts: [] });
  assert.ok(result.insight_summary.length <= MAX_NARRATIVE_LENGTH);
  assert.doesNotMatch(result.insight_summary, /\*|#|Summary:|https:\/\//);
});

test('fallback output is sane and identifies its source', () => {
  const result = applyInsight(null, brief);
  assert.equal(result.insight_source, 'fallback');
  assert.doesNotMatch(JSON.stringify(result), /undefined|NaN/);
  assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 2);
  assert.match(result.insight_summary, /Cost per lead rose materially/);
});
