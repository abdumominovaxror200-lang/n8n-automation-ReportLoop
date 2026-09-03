'use strict';

const NUMBER_TOKEN = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const CURRENCY_METRICS = new Set(['spend', 'cpl', 'cpc', 'revenue']);
const META_METRICS = ['spend', 'cpl', 'roas', 'ctr', 'leads', 'impressions', 'clicks'];

function finite(value) {
  if (value === null || value === '' || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function label(key) {
  return key.split('_').filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function valueText(value) {
  const number = finite(value);
  if (number === null) return 'n/a';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
}

function deltaText(value) {
  const number = finite(value);
  if (number === null) return 'n/a';
  return `${number > 0 ? '+' : ''}${(number * 100).toFixed(1)}%`;
}

function displayValue(key, value) {
  const number = finite(value);
  if (number === null) return 'n/a';
  if (CURRENCY_METRICS.has(key)) return `$${valueText(number)}`;
  if (key === 'ctr') return `${(number * 100).toFixed(1)}%`;
  return valueText(number);
}

function parseQuality(value) {
  let quality = value;
  if (typeof quality === 'string') {
    try { quality = JSON.parse(quality); } catch { quality = [quality]; }
  }
  if (!Array.isArray(quality)) return [];
  return quality.map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') return String(entry.detail ?? entry.code ?? '').trim();
    return '';
  }).filter(Boolean);
}

function metric(row, key) {
  return {
    key,
    label: label(key),
    current: finite(row[`${key}_current`]),
    previous: finite(row[`${key}_previous`]),
    delta: finite(row[`${key}_delta_pct`]),
  };
}

function buildInsightBrief(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Reports row must be an object.');
  const metrics = Object.keys(row)
    .filter((key) => key.endsWith('_current'))
    .map((key) => key.slice(0, -'_current'.length))
    .filter((key) => Object.hasOwn(row, `${key}_previous`))
    .map((key) => metric(row, key));
  const byKey = Object.fromEntries(metrics.map((entry) => [entry.key, entry]));
  const movers = metrics
    .filter((entry) => entry.current !== null && entry.previous !== null && entry.delta !== null)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.key.localeCompare(right.key))
    .slice(0, 3)
    .map((entry) => ({
      metric: entry.key,
      label: entry.label,
      from: displayValue(entry.key, entry.previous),
      to: displayValue(entry.key, entry.current),
      delta_pct: deltaText(entry.delta),
      direction: entry.delta > 0 ? 'up' : entry.delta < 0 ? 'down' : 'flat',
    }));

  const flags = [];
  if (byKey.cpl?.delta > 0.20) flags.push({ code: 'cpl_up', message: 'Cost per lead rose materially.' });
  if (byKey.conversions?.delta < -0.15) flags.push({ code: 'conversions_down', message: 'Conversions fell materially.' });
  if (byKey.spend?.delta > 0.15 && byKey.leads?.delta !== null && Math.abs(byKey.leads.delta) < 0.05) {
    flags.push({ code: 'spend_up_leads_flat', message: 'Spend rose materially while leads were nearly flat.' });
  }
  if (byKey.sessions?.delta < -0.25) flags.push({ code: 'sessions_down', message: 'Sessions fell materially.' });
  for (const entry of metrics.filter((candidate) => candidate.previous === 0)) {
    flags.push({
      code: 'no_comparison',
      metric: entry.key,
      previous: displayValue(entry.key, entry.previous),
      message: `${entry.label} has a zero previous-period value, so percentage comparison is unavailable.`,
    });
  }

  const dataQuality = parseQuality(row.data_quality);
  const hasMeta = META_METRICS.some((key) =>
    byKey[key] && (byKey[key].current !== null || byKey[key].previous !== null));
  const brief = {
    period_label: String(row.period_label ?? ''),
    movers,
    flags,
    data_quality: dataQuality,
    has_meta: hasMeta,
  };
  brief.facts = [...new Set(JSON.stringify(brief).match(NUMBER_TOKEN) ?? [])].sort();
  return brief;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildInsightBrief };
if (typeof $input !== 'undefined') {
  const row = $input.first().json;
  return [{ json: { ...row, brief: buildInsightBrief(row) } }];
}
