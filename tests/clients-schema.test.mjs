import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateClientsFile } from "../schema/validate_clients.mjs";

test("sample Clients JSON satisfies the production schema", async () => {
  const result = await validateClientsFile(
    new URL("../fixtures/sample_clients.json", import.meta.url).pathname.replace(/^\/(.:)/, "$1"),
  );
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.rows.length, 2);
});

test("validator reports all row errors instead of stopping at the first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clients-validator-"));
  const path = join(directory, "invalid.json");
  const invalid = {
    client_id: "x",
    agency: "",
    report_name: "",
    ga4_property_id: "wrong",
    meta_ad_account_id: "",
    gads_customer_id: "",
    extra_sheet_url: "not-a-url",
    kpis: "sessions,unknown",
    schedule_cron: "not cron",
    recipients: "bad-email",
    telegram_chat_id: "",
    logo_url: "",
    brand_color: "blue",
    slides_template_id: "",
    timezone: "Mars/Olympus",
    enabled: "sometimes",
  };
  await writeFile(path, JSON.stringify(invalid), "utf8");

  const result = await validateClientsFile(path);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 10);
  assert.ok(result.errors.some((error) => error.includes("schedule_cron")));
  assert.ok(result.errors.some((error) => error.includes("recipients")));
  assert.ok(result.errors.some((error) => error.includes("enabled")));
});

test("quoted CSV and boolean cells are normalized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clients-validator-"));
  const path = join(directory, "clients.csv");
  const header = "client_id,agency,report_name,ga4_property_id,meta_ad_account_id,gads_customer_id,extra_sheet_url,kpis,schedule_cron,recipients,telegram_chat_id,logo_url,brand_color,slides_template_id,timezone,enabled";
  const row = 'csv-demo,"Agency, Ltd",Monthly,123,act_123,123-456-7890,,"sessions,users",0 9 2 * *,owner@example.com,-100123,,#112233,template,UTC,TRUE';
  await writeFile(path, `${header}\n${row}\n`, "utf8");

  const result = await validateClientsFile(path);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.rows[0].agency, "Agency, Ltd");
  assert.equal(result.rows[0].enabled, true);
});

test("monthly_budget accepts a non-negative number or blank and rejects other values", async () => {
  const source = JSON.parse(await readFile(new URL('../fixtures/sample_clients.json', import.meta.url), 'utf8'))[0];
  const directory = await mkdtemp(join(tmpdir(), "clients-validator-"));
  const validPath = join(directory, "valid-budget.json");
  await writeFile(validPath, JSON.stringify([
    { ...source, monthly_budget: 2500 },
    { ...source, client_id: 'blank-budget', monthly_budget: '' },
  ]), "utf8");
  const valid = await validateClientsFile(validPath);
  assert.equal(valid.valid, true, valid.errors.join('\n'));

  const invalidPath = join(directory, "invalid-budget.json");
  await writeFile(invalidPath, JSON.stringify({ ...source, monthly_budget: 'not-a-budget' }), "utf8");
  const invalid = await validateClientsFile(invalidPath);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('monthly_budget')));
});

test("CSV monthly_budget cells are normalized to numbers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clients-validator-"));
  const path = join(directory, "clients-budget.csv");
  const header = "client_id,agency,report_name,ga4_property_id,meta_ad_account_id,gads_customer_id,extra_sheet_url,kpis,schedule_cron,recipients,telegram_chat_id,logo_url,brand_color,slides_template_id,timezone,enabled,monthly_budget";
  const row = 'budget-demo,Agency,Monthly,123,act_123,123-456-7890,,sessions,0 9 2 * *,owner@example.com,-100123,,#112233,template,UTC,TRUE,2500.50';
  await writeFile(path, `${header}\n${row}\n`, "utf8");
  const result = await validateClientsFile(path);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.rows[0].monthly_budget, 2500.5);
});
