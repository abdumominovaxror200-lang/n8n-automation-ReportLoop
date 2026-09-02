# n8n Agency Reporting

Config-driven, multi-client marketing report automation built for the free local stack in
[`PLAN.md`](PLAN.md). It combines Google Analytics 4, Meta Ads, Google Ads, and an optional
extra data source; calculates month-over-month KPIs; asks Groq for a three-sentence summary;
renders a Google Slides template; exports it through Drive as PDF; and delivers it through
Gmail and Telegram.

This repository contains offline-ready workflow skeletons and deterministic fixtures. No live
credential or API call is needed to develop or test the transformation core. There is no
FastAPI/PDF server: Slides and Drive provide rendering and PDF export.

## Layout

```text
workflows/       Importable n8n workflow skeletons
code-nodes/      Plain JavaScript pasted into the n8n KPI Code node
schema/          Clients configuration schema and validator CLI
fixtures/        Deterministic mock source/config data and expected KPI output
tests/           Offline structural tests for workflow exports
```

## Offline checks

Requires Node.js 20 or newer and no npm dependencies.

```powershell
npm test
npm run validate:clients
npm run validate:workflows
```

The KPI module can be required by tests and also runs directly inside an n8n Code node. Its
input is one item whose JSON contains `period`, optional `ga4`/`meta`/`gads`/`extra` sources,
and the requested `kpis`. Its output is one item containing metrics, source totals,
data-quality notices, and a human-readable period label.

## Clients configuration

Create a Google Sheet named `Clients` whose header follows
[`schema/clients.schema.json`](schema/clients.schema.json). The CLI accepts either a JSON array
(or `{ "clients": [...] }`) or a header-based CSV export:

```powershell
node schema/validate_clients.mjs fixtures/sample_clients.json
node schema/validate_clients.mjs clients.csv
```

It reports every invalid row/field in one run and exits non-zero on validation failure. Comma-
separated `kpis` and `recipients` values match the Sheet representation; JSON fixtures may also
use arrays where documented by the schema.

## Import into n8n

1. Start local n8n with the persistent Docker volume documented in `PLAN.md`.
2. Import `wf_alert.json`, `wf_build_report.json`, then `wf_scheduler.json` from `workflows/`.
3. Replace every `TODO: connect ...` credential/reference with the matching local n8n
   credential, Sheet ID, workflow ID, or template ID.
4. Confirm the KPI Code node contains the same source as [`code-nodes/kpi.js`](code-nodes/kpi.js).
5. Run `wf_build_report` manually with a test Clients row before activating the scheduler.

The skeletons intentionally remain inactive after import. HTTP nodes use placeholder URLs or
expressions and must not be executed until credentials and resource IDs are connected.

## Runtime contracts

- Source dates are ISO `YYYY-MM-DD`; both current and previous inclusive windows are explicit.
- Additive advertising totals combine Meta and Google Ads. Derived ratios are recomputed from
  combined numerators and denominators, never averaged across platforms.
- Division by zero yields `null` and a data-quality notice instead of `Infinity` or a crash.
- A missing source does not stop the workflow; affected requested KPIs are flagged.
- Google Slides placeholders are populated only after KPI and narrative generation. Drive
  performs the PDF export; no separate render service exists.

## Credentials added later

Google OAuth (Sheets, GA4, Slides, Drive, Gmail), Meta, Google Ads, Groq, and Telegram credentials
are connected in the local n8n UI. Never commit tokens, OAuth client secrets, chat credentials,
or exported n8n credential objects.
