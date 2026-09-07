import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { schemaPath, vendorSchemaPath } from "./paths.ts";
import { ZERO_UUID, isUuidV4 } from "./hash.ts";
import type { AgentCard } from "../types.ts";

export type SchemaIssue = { path: string; message: string };

function formatErrors(errors: Array<{ instancePath?: string; message?: string; params?: Record<string, unknown> }> | null | undefined): SchemaIssue[] {
  if (!errors) return [{ path: "", message: "unknown schema failure" }];
  return errors.map((e) => {
    const missing = e.params && typeof e.params.missingProperty === "string" ? e.params.missingProperty : "";
    const path = e.instancePath || (missing ? missing : "");
    const message = missing ? `missing required field ${missing}` : (e.message ?? "invalid");
    return { path, message: path ? `${path}: ${message}` : message };
  });
}

export function validateDeclarationData(data: unknown): SchemaIssue[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath("declaration.schema.json"), "utf8"));
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  return formatErrors(validate.errors);
}

export function validateCardSchema(data: unknown): SchemaIssue[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath("agent-card.schema.json"), "utf8"));
  const validate = ajv.compile(schema);
  const issues = validate(data) ? [] : formatErrors(validate.errors);
  if (data && typeof data === "object") {
    const card = data as AgentCard;
    const id = card.metadata?.id ?? "";
    if (id === ZERO_UUID || !isUuidV4(id)) {
      issues.push({ path: "metadata.id", message: "metadata.id: must be a UUID v4 (all-zero UUID is rejected)" });
    }
    if (!card.classification?.next_review) {
      issues.push({ path: "classification.next_review", message: "classification.next_review: missing required field next_review" });
    }
  }
  return issues;
}

export function validateOscal(data: unknown): SchemaIssue[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(vendorSchemaPath("oscal_assessment-results_schema-1.1.2.json"), "utf8"));
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  return formatErrors(validate.errors);
}

export function formatIssueText(issues: SchemaIssue[]): string {
  return issues.map((i) => i.message).join("\n");
}
