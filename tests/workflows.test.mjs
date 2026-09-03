import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowFiles = ["wf_scheduler.json", "wf_build_report.json", "wf_alert.json"];

for (const filename of workflowFiles) {
  test(`${filename} is an inactive importable workflow skeleton`, async () => {
    const raw = await readFile(new URL(`../workflows/${filename}`, import.meta.url), "utf8");
    const workflow = JSON.parse(raw);
    assert.equal(typeof workflow.name, "string");
    assert.ok(Array.isArray(workflow.nodes));
    assert.ok(workflow.nodes.length >= 3);
    assert.equal(workflow.active, false);
    assert.equal(typeof workflow.connections, "object");
    const nodeNames = new Set(workflow.nodes.map((node) => node.name));
    for (const source of Object.keys(workflow.connections)) {
      assert.ok(nodeNames.has(source), `connection source ${source} must exist`);
      for (const output of workflow.connections[source].main ?? []) {
        for (const connection of output ?? []) {
          assert.ok(nodeNames.has(connection.node), `connection target ${connection.node} must exist`);
        }
      }
    }
  });
}

test("build workflow embeds the production KPI code", async () => {
  const [rawWorkflow, rawKpi] = await Promise.all([
    readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8"),
    readFile(new URL("../code-nodes/kpi.js", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(rawWorkflow);
  const node = workflow.nodes.find((candidate) => candidate.name === "Calculate KPIs");
  assert.ok(node, "Calculate KPIs node is required");
  const normalizeLines = (value) => value.replace(/\r\n/g, "\n").trim();
  assert.equal(normalizeLines(node.parameters.jsCode), normalizeLines(rawKpi));
});

test("GA4 slice embeds its mapper and requests the two explicit periods", async () => {
  const [rawWorkflow, rawMapper] = await Promise.all([
    readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8"),
    readFile(new URL("../code-nodes/ga4_map.js", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(rawWorkflow);
  const mapper = workflow.nodes.find((node) => node.name === "Map GA4 Response");
  const request = workflow.nodes.find((node) => node.name === "GA4 - Run Report");
  const normalizeLines = (value) => value.replace(/\r\n/g, "\n").trim();
  assert.equal(normalizeLines(mapper.parameters.jsCode), normalizeLines(rawMapper));
  assert.match(request.parameters.url, /analyticsdata\.googleapis\.com\/v1beta/);
  assert.match(request.parameters.jsonBody, /period\.previous/);
  assert.match(request.parameters.jsonBody, /period\.current/);
  for (const metric of ["sessions", "totalUsers", "newUsers", "conversions"]) {
    assert.match(request.parameters.jsonBody, new RegExp(metric));
  }
});

test("optional Meta branch embeds its mapper and joins the shared KPI input", async () => {
  const [rawWorkflow, rawMapper] = await Promise.all([
    readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8"),
    readFile(new URL("../code-nodes/meta_map.js", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(rawWorkflow);
  const normalizeLines = (value) => value.replace(/\r\n/g, "\n").trim();
  const mapper = workflow.nodes.find((node) => node.name === "Map Meta Insights");
  assert.equal(normalizeLines(mapper.parameters.jsCode), normalizeLines(rawMapper));

  const request = workflow.nodes.find((node) => node.name === "Meta Ads - Daily Insights");
  assert.match(request.parameters.url, /graph\.facebook\.com\/v21\.0/);
  const query = Object.fromEntries(request.parameters.queryParameters.parameters
    .map(({ name, value }) => [name, value]));
  assert.match(query.fields, /actions,action_values/);
  assert.equal(query.level, "account");
  assert.equal(query.time_increment, "1");
  assert.match(query.time_range, /period\.previous\.start/);
  assert.match(query.time_range, /period\.current\.end/);

  for (const name of [
    "Meta Account Configured?",
    "Meta Not Configured",
    "Select GA4 Source",
    "Merge All Sources",
    "Assemble KPI Sources",
  ]) assert.ok(workflow.nodes.some((node) => node.name === name), `${name} is required`);
  assert.match(
    workflow.nodes.find((node) => node.name === "Assemble KPI Sources").parameters.jsCode,
    /meta:sources\.meta\?\?null/,
  );
  assert.ok(workflow.connections["Assemble KPI Sources"].main[0]
    .some((connection) => connection.node === "Calculate KPIs"));
  assert.ok(workflow.connections["Meta Account Configured?"].main[0]
    .some((connection) => connection.node === "Meta Ads - Daily Insights"));
  assert.ok(workflow.connections["Meta Account Configured?"].main[1]
    .some((connection) => connection.node === "Meta Not Configured"));
  assert.ok(workflow.connections["Map Meta Insights"].main[0]
    .some((connection) => connection.node === "Merge All Sources" && connection.index === 1));
  assert.ok(workflow.connections["Meta Not Configured"].main[0]
    .some((connection) => connection.node === "Merge All Sources" && connection.index === 1));
});

test("report workflow embeds the deterministic renderer after the sheet append", async () => {
  const [rawWorkflow, rawRenderer] = await Promise.all([
    readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8"),
    readFile(new URL("../code-nodes/report_render.js", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(rawWorkflow);
  const renderer = workflow.nodes.find((node) => node.name === "Render HTML + Text Report");
  assert.ok(renderer);
  const normalizeLines = (value) => value.replace(/\r\n/g, "\n").trim();
  assert.equal(normalizeLines(renderer.parameters.jsCode), normalizeLines(rawRenderer));
  assert.ok(
    workflow.connections["Append Reports Row"].main[0]
      .some((connection) => connection.node === "Render HTML + Text Report"),
  );
  assert.ok(
    workflow.connections["Render HTML + Text Report"].main[1]
      .some((connection) => connection.node === "Send Failure Alert"),
  );
});

test("delivery workflow embeds its pure helper and gates both channels", async () => {
  const [rawWorkflow, rawDelivery] = await Promise.all([
    readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8"),
    readFile(new URL("../code-nodes/delivery.js", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(rawWorkflow);
  const normalizeLines = (value) => value.replace(/\r\n/g, "\n").trim();
  const delivery = workflow.nodes.find((node) => node.name === "Prepare Delivery");
  assert.equal(normalizeLines(delivery.parameters.jsCode), normalizeLines(rawDelivery));

  const gmail = workflow.nodes.find((node) => node.name === "Send Gmail Report");
  assert.equal(gmail.type, "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.match(gmail.parameters.sendTo, /gmail\.to/);
  assert.match(gmail.parameters.message, /gmail\.html/);

  const telegram = workflow.nodes.find((node) => node.name === "Send Telegram Report");
  assert.equal(telegram.type, "n8n-nodes-base.telegram");
  assert.equal(telegram.parameters.operation, "sendMessage");
  assert.match(telegram.parameters.chatId, /telegram\.chatId/);
  assert.match(telegram.parameters.text, /telegram\.text/);

  for (const name of ["Gmail Enabled?", "Telegram Enabled?", "Send Failure Alert"]) {
    assert.ok(workflow.nodes.some((node) => node.name === name), `${name} is required`);
  }
  assert.ok(workflow.connections["Render HTML + Text Report"].main[0]
    .some((connection) => connection.node === "Prepare Delivery"));
  assert.ok(workflow.connections["Send Gmail Report"].main[0]
    .some((connection) => connection.node === "Restore Delivery After Gmail"));
  assert.ok(workflow.connections["Restore Delivery After Gmail"].main[0]
    .some((connection) => connection.node === "Telegram Enabled?"));
});

test("imported workflow has no baked credentials and uses valid JSON body forms", async () => {
  const raw = await readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  for (const node of workflow.nodes) {
    assert.equal(Object.hasOwn(node, "credentials"), false, `${node.name} must not bake credentials`);
    if (node.type !== "n8n-nodes-base.httpRequest" || node.parameters.jsonBody === undefined) continue;
    const body = node.parameters.jsonBody.trim();
    if (body.startsWith("={{")) {
      assert.match(body, /^=\{\{\s*JSON\.stringify\(/, `${node.name} dynamic body must stringify JSON`);
    } else {
      assert.doesNotThrow(() => JSON.parse(body), `${node.name} static body must be plain JSON`);
    }
  }
});

test("GA4 slice creates Reports headers when needed and appends to the configured sheet", async () => {
  const raw = await readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  const names = new Set(workflow.nodes.map((node) => node.name));
  for (const name of [
    "Check Reports Tab",
    "Reports Tab Exists?",
    "Check Reports Headers",
    "Reports Headers Exist?",
    "Create Reports Tab",
    "Write Reports Headers",
    "Append Reports Row",
  ]) {
    assert.ok(names.has(name));
  }
  const append = workflow.nodes.find((node) => node.name === "Append Reports Row");
  assert.equal(append.parameters.documentId.value, "1vV9FLBLTwp05lwBfQRIrV8rrVe6K0IqPbh1obQiDNWI");
  assert.equal(append.parameters.sheetName.value, "Reports");
  for (const todo of ["TODO: connect Google Ads", "TODO: connect Slides Render"]) {
    assert.equal(workflow.nodes.find((node) => node.name === todo)?.type, "n8n-nodes-base.noOp");
  }
  assert.equal(workflow.nodes.some((node) => node.name === "TODO: connect Meta"), false);
  assert.equal(workflow.nodes.some((node) => node.name === "TODO: connect Gmail"), false);
  assert.equal(workflow.nodes.some((node) => node.name === "TODO: connect Telegram"), false);
});

test("scheduler evaluates each enabled client's cron in its timezone", async () => {
  const raw = await readFile(new URL("../workflows/wf_scheduler.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  const node = workflow.nodes.find((candidate) => candidate.name === "Filter Enabled and Due Now");
  assert.ok(node);
  assert.match(node.parameters.jsCode, /schedule_cron/);
  assert.match(node.parameters.jsCode, /timeZone: timezone/);
  assert.doesNotMatch(node.parameters.jsCode, /due_today/);
});

test("credential-bound nodes remain visibly marked TODO", async () => {
  const raw = await readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  const externalNodes = workflow.nodes.filter((node) =>
    ["httpRequest", "gmail", "telegram", "googleSheets"].some((kind) =>
      String(node.type).includes(kind),
    ),
  );
  assert.ok(externalNodes.length >= 5);
  for (const node of externalNodes) {
    assert.match(`${node.name} ${node.notes ?? ""}`, /TODO: connect/i);
  }
});

test("build workflow routes every configured error output to the Telegram alert", async () => {
  const raw = await readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  const guarded = workflow.nodes.filter((node) => node.onError === "continueErrorOutput");
  assert.ok(guarded.length >= 9);
  for (const node of guarded) {
    const errorOutput = workflow.connections[node.name]?.main?.[1] ?? [];
    assert.ok(
      errorOutput.some((connection) => connection.node === "Send Failure Alert"),
      `${node.name} must route errors to Send Failure Alert`,
    );
  }
  const alert = workflow.nodes.find((node) => node.name === "Send Failure Alert");
  assert.equal(alert.type, "n8n-nodes-base.telegram");
  assert.match(alert.parameters.text, /ReportLoop/);
  assert.match(alert.parameters.text, /error\?\.message/);
});
