'use strict';

const DEFAULT_WASTE_MIN_SPEND = 200;
const PURCHASE_TYPES = new Set([
  'offsite_conversion.fc_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
]);

function finite(value) {
  if (value === null || value === '' || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumActions(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, action) => {
    const type = String(action?.action_type ?? '');
    if (type !== 'lead' && !PURCHASE_TYPES.has(type)) return total;
    return total + (finite(action?.value) ?? 0);
  }, 0);
}

function campaignConversions(campaign) {
  const explicit = finite(campaign?.conversions);
  return explicit === null ? sumActions(campaign?.actions) : explicit;
}

function dateInRange(date, range) {
  return typeof date === 'string' && range && date >= range.start && date <= range.end;
}

function accountTotals(meta, range) {
  const rows = Array.isArray(meta?.rows) ? meta.rows : [];
  return rows.filter((row) => dateInRange(row.date, range)).reduce((totals, row) => ({
    spend: totals.spend + (finite(row.spend) ?? 0),
    leads: totals.leads + (finite(row.leads) ?? 0),
  }), { spend: 0, leads: 0 });
}

function normalizePeriod(period) {
  if (!period || typeof period !== 'object') return null;
  const days = finite(period.days ?? period.days_in_month);
  const elapsed = finite(period.elapsed_days);
  if (days === null || elapsed === null || days <= 0 || elapsed <= 0 || elapsed > days) return null;
  return { days, elapsed };
}

function efficiencyCheck({
  meta_campaigns: metaCampaigns,
  meta,
  monthly_budget: monthlyBudget,
  period,
  waste_min_spend: wasteMinSpend = DEFAULT_WASTE_MIN_SPEND,
} = {}) {
  if (!meta || typeof meta !== 'object') {
    return { wasted: null, wasted_total: null, cpl_trend: null, pacing: null };
  }
  const campaignsAvailable = Array.isArray(metaCampaigns);
  const campaigns = campaignsAvailable ? metaCampaigns : [];
  const threshold = finite(wasteMinSpend);
  if (threshold === null || threshold < 0) throw new TypeError('waste_min_spend must be a non-negative number.');

  const wasted = campaigns
    .map((campaign) => ({
      campaign_name: String(campaign?.campaign_name ?? '').trim() || 'Unnamed campaign',
      spend: finite(campaign?.spend),
      conversions: campaignConversions(campaign),
    }))
    .filter((campaign) => campaign.spend !== null && campaign.spend >= threshold && campaign.conversions === 0)
    .sort((left, right) => right.spend - left.spend || left.campaign_name.localeCompare(right.campaign_name))
    .map(({ campaign_name, spend }) => ({ campaign_name, spend }));
  const wastedResult = campaignsAvailable && wasted.length ? wasted : null;
  const wastedTotal = wastedResult
    ? wastedResult.reduce((total, campaign) => total + campaign.spend, 0)
    : null;

  const current = accountTotals(meta, period?.current);
  const previous = accountTotals(meta, period?.previous);
  const cplNow = current.leads > 0 ? current.spend / current.leads : null;
  const cplPrevious = previous.leads > 0 ? previous.spend / previous.leads : null;
  const cplDelta = cplNow !== null && cplPrevious !== null && cplPrevious > 0
    ? (cplNow - cplPrevious) / cplPrevious
    : null;
  const cplTrend = cplDelta !== null && cplDelta > 0.30
    ? {
      from: cplPrevious,
      to: cplNow,
      delta_pct: cplDelta,
      projected_annual_extra: (cplNow - cplPrevious) * current.leads * 12,
    }
    : null;

  const budget = finite(monthlyBudget);
  const timing = normalizePeriod(period);
  let pacing = null;
  if (campaignsAvailable && budget !== null && budget > 0 && timing) {
    const spent = campaigns.reduce((total, campaign) => total + (finite(campaign?.spend) ?? 0), 0);
    const projected = spent / timing.elapsed * timing.days;
    pacing = {
      spent_pct: spent / budget,
      month_elapsed_pct: timing.elapsed / timing.days,
      projected_month_end_spend: projected,
      projected_overspend: Math.max(0, projected - budget),
    };
  }

  return { wasted: wastedResult, wasted_total: wastedTotal, cpl_trend: cplTrend, pacing };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_WASTE_MIN_SPEND, efficiencyCheck };
}
if (typeof $input !== 'undefined') {
  const row = $input.first().json;
  const client = $('Prepare Client and Periods').first().json;
  const sources = $('Assemble KPI Sources').first().json;
  return [{ json: {
    ...row,
    efficiency: efficiencyCheck({
      meta_campaigns: sources.meta_campaigns,
      meta: sources.meta,
      monthly_budget: client.monthly_budget,
      period: client.period,
    }),
  } }];
}
