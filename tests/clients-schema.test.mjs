import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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
