'use strict';

const DEFAULT_ACCENT = '#2563eb';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeAccent(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT;
}

function safeLogo(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

function finiteOrNull(value) {
  if (value === null || value === '' || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = finiteOrNull(value);
  if (number === null) return 'n/a';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
}

function formatDelta(value) {
  const number = finiteOrNull(value);
  if (number === null) return 'n/a';
  return `${number > 0 ? '+' : ''}${(number * 100).toFixed(1)}%`;
}

function direction(value) {
  const number = finiteOrNull(value);
  if (number === null || Math.abs(number) < 1e-12) return { symbol: '–', color: '#64748b' };
  return number > 0
    ? { symbol: '▲', color: '#15803d' }
    : { symbol: '▼', color: '#b91c1c' };
}

function labelFor(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function metricRows(row) {
  return Object.keys(row)
    .filter((key) => key.endsWith('_current'))
    .map((currentKey) => currentKey.slice(0, -'_current'.length))
    .filter((key) => Object.hasOwn(row, `${key}_previous`))
    .slice(0, 3)
    .map((key) => ({
      key,
      label: labelFor(key),
      current: row[`${key}_current`],
      previous: row[`${key}_previous`],
      delta: row[`${key}_delta_pct`],
    }));
}

function dataNotes(value) {
  let notes = value;
  if (typeof notes === 'string') {
    try { notes = JSON.parse(notes); } catch { notes = [notes]; }
  }
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => {
    if (typeof note === 'string') return note.trim();
    if (note && typeof note === 'object') {
      return safeText(note.detail, safeText(note.code, 'Data quality note'));
    }
    return '';
  }).filter(Boolean);
}

function whatChanged(metrics) {
  const comparable = metrics
    .map((metric) => ({ ...metric, numericDelta: finiteOrNull(metric.delta) }))
    .filter((metric) => metric.numericDelta !== null)
    .sort((left, right) => Math.abs(right.numericDelta) - Math.abs(left.numericDelta) || left.key.localeCompare(right.key));
  if (!comparable.length) return 'No comparable percentage change is available for the displayed KPIs.';
  const lead = comparable[0];
  const verb = lead.numericDelta > 0 ? 'increased' : lead.numericDelta < 0 ? 'decreased' : 'was flat';
  return `${lead.label} ${verb} by ${formatDelta(Math.abs(lead.numericDelta))} versus the previous period.`;
}

function renderReport(row, client = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Report row must be an object.');
  const agency = safeText(client.agency, 'Agency');
  const reportName = safeText(client.report_name, 'Performance Report');
  const periodLabel = safeText(row.period_label, 'Current vs previous period');
  const accent = safeAccent(client.brand_color);
  const logo = safeLogo(client.logo_url);
  const metrics = metricRows(row);
  const notes = dataNotes(row.data_quality);
  const changed = whatChanged(metrics);
  const subject = `${agency} — ${reportName} — ${periodLabel}`;

  const tableRows = metrics.map((metric) => {
    const trend = direction(metric.delta);
    return `<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:600">${escapeHtml(metric.label)}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(formatNumber(metric.current))}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(formatNumber(metric.previous))}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;color:${trend.color};font-weight:700">${trend.symbol} ${escapeHtml(formatDelta(metric.delta))}</td></tr>`;
  }).join('');
  const notesHtml = notes.length
    ? `<h2 style="font-size:16px;margin:24px 0 8px">Data notes</h2><ul style="margin:0;padding-left:20px">${notes.map((note) => `<li style="margin:6px 0">${escapeHtml(note)}</li>`).join('')}</ul>`
    : '';
  const logoHtml = logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(agency)} logo" style="display:block;max-height:48px;max-width:180px;margin-bottom:16px">` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif"><div style="max-width:720px;margin:0 auto;padding:24px"><div style="background:#ffffff;border-top:6px solid ${accent};padding:28px;border-radius:8px">${logoHtml}<h1 style="margin:0 0 6px;font-size:24px">${escapeHtml(reportName)}</h1><p style="margin:0 0 24px;color:#475569">${escapeHtml(agency)} · ${escapeHtml(periodLabel)}</p><table role="presentation" style="width:100%;border-collapse:collapse"><thead><tr style="background:${accent};color:#ffffff"><th style="padding:10px;text-align:left">KPI</th><th style="padding:10px;text-align:right">Current</th><th style="padding:10px;text-align:right">Previous</th><th style="padding:10px;text-align:right">Δ</th></tr></thead><tbody>${tableRows}</tbody></table><h2 style="font-size:16px;margin:24px 0 8px">What changed</h2><p style="margin:0">${escapeHtml(changed)}</p>${notesHtml}</div></div></body></html>`;

  const textMetrics = metrics.map((metric) => {
    const trend = direction(metric.delta);
    return `${metric.label}: ${formatNumber(metric.current)} current | ${formatNumber(metric.previous)} previous | ${trend.symbol} ${formatDelta(metric.delta)}`;
  });
  const text = [
    subject,
    '',
    ...textMetrics,
    '',
    `What changed: ${changed}`,
    ...(notes.length ? ['', 'Data notes:', ...notes.map((note) => `- ${note}`)] : []),
  ].join('\n');

  return { subject, html, text };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { renderReport };
if (typeof $input !== 'undefined') {
  const row = $('Build Reports Row').first().json;
  const client = $('Prepare Client and Periods').first().json;
  return [{ json: { ...row, ...renderReport(row, client), report_pdf: null } }];
}
