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

## Prompt #2 — GA4 slice

`workflows/wf_build_report.json` now contains the smallest connected reporting path:

`client → two-period GA4 runReport → GA4 mapper → KPI core → Reports sheet row`.

The workflow remains inactive after import and supports two entry paths:

1. Use **Manual Trigger**, open **Sample Client - Edit GA4 Property**, and replace
   `properties/123456789` with a GA4 property the signed-in account may read.
2. The existing scheduler can call **Client Input** with one validated Clients row.

Before the first execution in n8n:

- On **GA4 - Run Report**, select a generic credential named `Google Analytics OAuth2 API`
  (or equivalent) whose OAuth scope includes
  `https://www.googleapis.com/auth/analytics.readonly`.
- On **Check Reports Tab**, **Create Reports Tab**, **Write Reports Headers**, and
  **Append Reports Row**, select the connected Google Sheets OAuth2 credential for project
  ReportLoop.
- Confirm the target spreadsheet is
  `1vV9FLBLTwp05lwBfQRIrV8rrVe6K0IqPbh1obQiDNWI`. The workflow checks for a `Reports` tab;
  if absent it creates the tab and writes the dynamic header row before appending data.
- Leave Meta, Google Ads, Slides, Gmail, Telegram, and `wf_alert` as TODO NoOp nodes for this
  slice. Gmail API is not required.

For a manual run, the workflow calculates the latest 30 complete local-calendar days versus
the preceding 30 days using the client timezone. GA4 is requested once with both date ranges.
`code-nodes/ga4_map.js` converts GA4's `YYYYMMDD`, `totalUsers`, and `newUsers` fields to the
unchanged `kpi.js` input contract. The row written to `Reports` contains `timestamp`,
`client_id`, `period_label`, three columns per requested KPI (`current`, `previous`,
`delta_pct`), and serialized `data_quality`.

Offline verification requires no credentials:

```powershell
npm test
node --test code-nodes/ga4_map.test.js
```
