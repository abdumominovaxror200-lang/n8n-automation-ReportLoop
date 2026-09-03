'use strict';

const MAX_NARRATIVE_LENGTH = 600;
const NUMBER_TOKEN = /\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;

function deterministicInsight(brief) {
  const movers = Array.isArray(brief?.movers) ? brief.movers : [];
  const flags = Array.isArray(brief?.flags) ? brief.flags : [];
  const summary = movers.length
    ? movers.map((mover) => `${mover.label} ${mover.from} → ${mover.to} (${mover.delta_pct}).`).join(' ')
    : 'No comparable KPI movement is available for this period.';
  const recommendationsByFlag = {
    cpl_up: 'Review paid-media targeting and lead quality before changing budget.',
    conversions_down: 'Inspect conversion tracking and the conversion funnel for the measured period.',
    spend_up_leads_flat: 'Compare campaign-level spend and lead quality before reallocating spend.',
    sessions_down: 'Review acquisition-channel traffic and tracking coverage for the measured period.',
  };
  let recommendations = [...new Set(flags
    .map((flag) => recommendationsByFlag[flag.code])
    .filter(Boolean))].slice(0, 2);
  if (!recommendations.length && movers.length) {
    recommendations = ['Monitor the largest measured KPI movements before changing campaign settings.'];
  }
  const flagNotes = flags
    .map((flag) => String(flag.message ?? '').trim())
    .filter(Boolean);
  return {
    insight_summary: [summary, ...flagNotes].filter(Boolean).join(' '),
    recommendations,
    insight_source: 'fallback',
  };
}

function contentFrom(response) {
  if (typeof response === 'string') return response.trim();
  return String(response?.choices?.[0]?.message?.content ?? '').trim();
}

function cleanContent(content) {
  return content
    .replace(/^\s*(?:here(?:'s| is)\s+(?:the|a)\s+[^\n:.]+[:.]?)\s*/i, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*#*\s*(?:analysis|insights?|summary|recommendations?|what changed)\s*:?[#*\s]*$/i.test(line))
    .map((line) => line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .replace(/^\s*#*\s*(?:analysis|insights?|summary|recommendations?|what changed)\s*:\s*/i, '')
      .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
      .replace(/[>*_`#]/g, '')
      .trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_NARRATIVE_LENGTH)
    .trim();
}

function numbersAreAllowed(content, facts) {
  const allowed = new Set((Array.isArray(facts) ? facts : []).map(String));
  return (content.match(NUMBER_TOKEN) ?? []).every((token) => allowed.has(token));
}

function splitNarrative(content) {
  const summary = [];
  const recommendations = [];
  const action = /^(?:review|inspect|verify|compare|monitor|investigate|consider|audit|check|focus|test|optimize|pause|adjust|reallocate)\b/i;
  for (const line of content.split(/\r?\n/)) {
    for (const sentence of line.match(/[^.!?]+[.!?]?/g) ?? []) {
      const text = sentence.trim();
      if (!text) continue;
      if (action.test(text)) recommendations.push(text);
      else summary.push(text);
    }
  }
  return {
    insight_summary: summary.join(' '),
    recommendations: recommendations.slice(0, 3),
    insight_source: 'llm',
  };
}

function applyInsight(response, brief) {
  const content = cleanContent(contentFrom(response));
  if (!content || !numbersAreAllowed(content, brief?.facts)) return deterministicInsight(brief);
  const parsed = splitNarrative(content);
  if (!parsed.insight_summary) return deterministicInsight(brief);
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyInsight, deterministicInsight, MAX_NARRATIVE_LENGTH };
}
if (typeof $input !== 'undefined') {
  const source = $('Build Insight Brief').first().json;
  return [{ json: { ...source, ...applyInsight($input.first().json, source.brief) } }];
}
