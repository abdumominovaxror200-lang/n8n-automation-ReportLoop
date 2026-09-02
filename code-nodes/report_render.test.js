'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReport } = require('./report_render.js');

const row = {
  period_label: 'August 2026 vs July 2026',
  sessions_current: 1234,
  sessions_previous: 1100,
  sessions_delta_pct: 0.1218,
  users_current: 980,
  users_previous: 1032,
  users_delta_pct: -0.0504,
  conversions_current: 40,
  conversions_previous: 0,
  conversions_delta_pct: null,
  data_quality: JSON.stringify([{ code: 'zero_previous', detail: 'Conversion percentage change is unavailable because the previous value is zero.' }]),
};

const client = {
  agency: 'North Star Agency',
  report_name: 'Growth Pulse',
  logo_url: 'https://example.test/logo.png',
  brand_color: '#6d28d9',
};

test('renderer produces deterministic branded HTML and plain text', () => {
  const report = renderReport(row, client);
  assert.equal(report.subject, 'North Star Agency — Growth Pulse — August 2026 vs July 2026');
  for (const expected of ['1,234', '1,100', '+12.2%', '980', '1,032', '-5.0%', '40']) {
    assert.ok(report.html.includes(expected), `HTML must contain ${expected}`);
  }
  assert.match(report.html, /#6d28d9/i);
  assert.match(report.html, /<img[^>]+https:\/\/example\.test\/logo\.png/);
  assert.match(report.text, /Sessions: 1,234 current/);
});

test('null deltas and data-quality notes are rendered safely', () => {
  const report = renderReport(row, client);
  assert.match(report.html, />– n\/a</);
  assert.match(report.html, /Data notes/);
  assert.match(report.html, /Conversion percentage change is unavailable/);
  assert.match(report.text, /Conversions: 40 current \| 0 previous \| – n\/a/);
  for (const output of [report.subject, report.html, report.text]) {
    assert.doesNotMatch(output, /undefined|NaN/);
  }
});

test('invalid optional branding and malformed notes fall back without leaking unsafe markup', () => {
  const report = renderReport({ ...row, data_quality: 'plain note' }, {
    agency: '<Agency>',
    report_name: '',
    logo_url: 'javascript:alert(1)',
    brand_color: 'red; background:url(x)',
  });
  assert.match(report.html, /#2563eb/);
  assert.doesNotMatch(report.html, /javascript:|background:url/);
  assert.match(report.html, /&lt;Agency&gt;/);
  assert.match(report.text, /plain note/);
});
