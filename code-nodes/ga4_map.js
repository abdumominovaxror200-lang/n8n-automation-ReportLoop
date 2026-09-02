'use strict';

const METRIC_NAMES = Object.freeze({
  sessions: 'sessions',
  totalUsers: 'users',
  newUsers: 'new_users',
  conversions: 'conversions',
});

function isoDate(value) {
  const text = String(value ?? '');
  if (!/^\d{8}$/.test(text)) throw new TypeError(`Invalid GA4 date '${text}'; expected YYYYMMDD.`);
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) throw new TypeError(`Invalid GA4 date '${text}'.`);
  return iso;
}

function numberValue(value, metric, rowIndex) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`GA4 row ${rowIndex + 1} has a non-numeric ${metric} value.`);
  }
  return parsed;
}

function mapGa4RunReport(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new TypeError('GA4 runReport response must be an object.');
  }
  const dimensionHeaders = (response.dimensionHeaders ?? []).map((header) => header.name);
  const dateIndex = dimensionHeaders.indexOf('date');
  if (dateIndex < 0) throw new TypeError("GA4 response is missing the 'date' dimension.");

  const metricHeaders = (response.metricHeaders ?? []).map((header) => header.name);
  for (const required of Object.keys(METRIC_NAMES)) {
    if (!metricHeaders.includes(required)) throw new TypeError(`GA4 response is missing metric '${required}'.`);
  }

  const rows = (response.rows ?? []).map((row, rowIndex) => {
    const mapped = { date: isoDate(row.dimensionValues?.[dateIndex]?.value) };
    metricHeaders.forEach((metric, metricIndex) => {
      const target = METRIC_NAMES[metric];
      if (target) mapped[target] = numberValue(row.metricValues?.[metricIndex]?.value, metric, rowIndex);
    });
    return mapped;
  });
  rows.sort((left, right) => left.date.localeCompare(right.date));
  return { rows };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mapGa4RunReport };
if (typeof $input !== 'undefined') {
  const client = $('Prepare Client and Periods').first().json;
  return [{ json: { ...client, ga4: mapGa4RunReport($input.first().json), meta: null, gads: null, extra: null } }];
}
