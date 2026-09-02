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
  assert.equal(node.parameters.jsCode.trim(), rawKpi.trim());
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
  assert.ok(externalNodes.length >= 10);
  for (const node of externalNodes) {
    assert.match(`${node.name} ${node.notes ?? ""}`, /TODO: connect/i);
  }
});

test("build workflow routes every configured error output to wf_alert", async () => {
  const raw = await readFile(new URL("../workflows/wf_build_report.json", import.meta.url), "utf8");
  const workflow = JSON.parse(raw);
  const guarded = workflow.nodes.filter((node) => node.onError === "continueErrorOutput");
  assert.ok(guarded.length >= 9);
  for (const node of guarded) {
    const errorOutput = workflow.connections[node.name]?.main?.[1] ?? [];
    assert.ok(
      errorOutput.some((connection) => connection.node === "TODO: connect wf_alert"),
      `${node.name} must route errors to wf_alert`,
    );
  }
});
