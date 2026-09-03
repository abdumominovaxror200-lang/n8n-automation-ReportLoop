#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("./clients.schema.json", import.meta.url));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonBlank = rows.filter((values) => values.some((value) => value.trim() !== ""));
  if (nonBlank.length === 0) return [];
  const headers = nonBlank[0].map((value, index) => {
    const header = value.replace(/^\uFEFF/, "").trim();
    if (!header) throw new Error(`CSV header ${index + 1} is empty`);
    return header;
  });
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers");
  return nonBlank.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function rowsFromJson(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.clients)) return value.clients;
  if (value && typeof value === "object") return [value];
  throw new Error("JSON must be a client object, an array of clients, or {\"clients\": [...]}");
}

function isUri(value) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}
function isEmail(value) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value); }
function isTimezone(value) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}
function isCron5(value) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return parts.every((part, index) => {
    const [minimum, maximum] = ranges[index];
    return part.split(",").every((expression) => {
      const [base, step, ...extra] = expression.split("/");
      if (extra.length > 0 || (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1))) return false;
      if (base === "*") return true;
      const bounds = base.split("-");
      if (bounds.length > 2 || bounds.some((item) => !/^\d+$/.test(item))) return false;
      const numbers = bounds.map(Number);
      return numbers.every((number) => number >= minimum && number <= maximum)
        && (numbers.length === 1 || numbers[0] <= numbers[1]);
    });
  });
}
function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === "true";
  return value;
}

function validateRow(input, schema, rowNumber) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: [`row ${rowNumber}: must be an object`], normalized: input };
  const normalized = { ...input };
  if (Object.hasOwn(normalized, "enabled")) normalized.enabled = normalizeBoolean(normalized.enabled);
  if (typeof normalized.monthly_budget === "string" && normalized.monthly_budget.trim() !== ""
      && /^\d+(?:\.\d+)?$/.test(normalized.monthly_budget.trim())) {
    normalized.monthly_budget = Number(normalized.monthly_budget);
  }
  const allowed = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(normalized)) if (!allowed.has(key)) errors.push(`row ${rowNumber}.${key}: unknown column`);
  for (const key of schema.required) if (!Object.hasOwn(normalized, key)) errors.push(`row ${rowNumber}.${key}: required column is missing`);

  for (const [key, rule] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(normalized, key)) continue;
    const value = normalized[key];
    if (rule.oneOf) {
      const matches = rule.oneOf.some((option) => {
        if (typeof value !== option.type) return false;
        if (option.minimum !== undefined && value < option.minimum) return false;
        if (option.pattern && !new RegExp(option.pattern).test(value)) return false;
        return true;
      });
      if (!matches) errors.push(`row ${rowNumber}.${key}: must be a non-negative number or empty`);
      continue;
    }
    if (typeof value !== rule.type) { errors.push(`row ${rowNumber}.${key}: expected ${rule.type}`); continue; }
    if (rule.type !== "string") continue;
    if (rule.minLength !== undefined && value.trim().length < rule.minLength) errors.push(`row ${rowNumber}.${key}: must not be empty`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(`row ${rowNumber}.${key}: exceeds ${rule.maxLength} characters`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`row ${rowNumber}.${key}: invalid format`);
    if (rule.format === "uri" && !(rule.allowEmpty && value === "") && !isUri(value)) errors.push(`row ${rowNumber}.${key}: must be an http(s) URL${rule.allowEmpty ? " or empty" : ""}`);
    if (rule.format === "cron5" && !isCron5(value)) errors.push(`row ${rowNumber}.${key}: must be a five-field cron expression`);
    if (rule.format === "iana-timezone" && !isTimezone(value)) errors.push(`row ${rowNumber}.${key}: must be a valid IANA timezone`);
    if (rule.csvList) {
      const items = value.split(",").map((item) => item.trim()).filter(Boolean);
      if (items.length < (rule.minItems ?? 0)) errors.push(`row ${rowNumber}.${key}: list must not be empty`);
      if (rule.csvList === "email") items.forEach((item) => { if (!isEmail(item)) errors.push(`row ${rowNumber}.${key}: invalid email '${item}'`); });
      if (rule.allowedValues) items.forEach((item) => {
        if (!rule.allowedValues.includes(item)) errors.push(`row ${rowNumber}.${key}: unsupported value '${item}'`);
      });
      if (new Set(items).size !== items.length) errors.push(`row ${rowNumber}.${key}: contains duplicate values`);
    }
  }
  return { errors, normalized };
}

export async function validateClientsFile(inputPath) {
  const [schemaText, inputText] = await Promise.all([readFile(schemaPath, "utf8"), readFile(inputPath, "utf8")]);
  const schema = JSON.parse(schemaText);
  const rows = inputPath.toLowerCase().endsWith(".csv") ? parseCsv(inputText) : rowsFromJson(JSON.parse(inputText.replace(/^\uFEFF/, "")));
  if (rows.length === 0) return { valid: false, rows: [], errors: ["input contains no client rows"] };
  const results = rows.map((row, index) => validateRow(row, schema, index + 1));
  const errors = results.flatMap((result) => result.errors);
  const clientIds = new Map();
  results.forEach((result, index) => {
    const clientId = result.normalized?.client_id;
    if (typeof clientId !== "string" || clientId === "") return;
    if (clientIds.has(clientId)) errors.push(`row ${index + 1}.client_id: duplicate of row ${clientIds.get(clientId)}`);
    else clientIds.set(clientId, index + 1);
  });
  return { valid: errors.length === 0, rows: results.map((result) => result.normalized), errors };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    console.error("Usage: node schema/validate_clients.mjs <clients.json|clients.csv>");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await validateClientsFile(inputPath);
    if (!result.valid) {
      console.error(`Clients validation failed (${result.errors.length} error${result.errors.length === 1 ? "" : "s"}):`);
      result.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
      return;
    }
    console.log(`Clients validation passed: ${result.rows.length} row${result.rows.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error(`Could not validate clients: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
