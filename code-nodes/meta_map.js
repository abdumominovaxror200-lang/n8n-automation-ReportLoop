'use strict';

const PURCHASE_TYPES = new Set([
  'offsite_conversion.fc_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
]);

function numeric(value, field, rowIndex) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Meta insight ${rowIndex + 1} has a non-numeric ${field} value.`);
  }
  return number;
}

function dateValue(value, rowIndex) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new TypeError(`Meta insight ${rowIndex + 1} has an invalid date_start.`);
  }
  return date;
}

function actionTotal(entries, predicate, field, rowIndex) {
  if (entries == null) return 0;
  if (!Array.isArray(entries)) throw new TypeError(`Meta insight ${rowIndex + 1} ${field} must be an array.`);
  return entries
    .filter((entry) => predicate(String(entry?.action_type ?? '')))
    .reduce((sum, entry) => sum + numeric(entry.value, `${field}.${entry.action_type}`, rowIndex), 0);
}

function mapMetaInsights(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new TypeError('Meta insights response must be an object.');
  }
  if (!Array.isArray(response.data)) throw new TypeError('Meta insights response.data must be an array.');
  const rows = response.data.map((insight, rowIndex) => ({
    date: dateValue(insight.date_start, rowIndex),
    spend: numeric(insight.spend, 'spend', rowIndex),
    impressions: numeric(insight.impressions, 'impressions', rowIndex),
    clicks: numeric(insight.clicks, 'clicks', rowIndex),
    ctr: numeric(insight.ctr, 'ctr', rowIndex),
    cpc: numeric(insight.cpc, 'cpc', rowIndex),
    leads: actionTotal(insight.actions, (type) => type === 'lead', 'actions', rowIndex),
    purchases: actionTotal(insight.actions, (type) => PURCHASE_TYPES.has(type), 'actions', rowIndex),
    revenue: actionTotal(insight.action_values, (type) => PURCHASE_TYPES.has(type), 'action_values', rowIndex),
  }));
  rows.sort((left, right) => left.date.localeCompare(right.date));
  return { rows };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mapMetaInsights };
if (typeof $input !== 'undefined') {
  return [{ json: { meta: mapMetaInsights($input.first().json) } }];
}
