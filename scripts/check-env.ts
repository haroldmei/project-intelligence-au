// Cross-check the env schema against template files. Run before deploys to
// catch drift between `src/lib/env.ts` (source of truth) and the templates
// users actually fill in.
//
//   tsx --env-file-if-exists=.env.local scripts/check-env.ts
//
// Exit code: 0 if templates are in sync, 1 if any required var is missing.
//
// Note: this runs in dev. It loads `@/lib/env` which validates `process.env` —
// so the local .env.local must already be valid before this script can warn
// about template drift.

import { existsSync, readFileSync } from "node:fs";
import { ENV_VARS } from "../src/lib/env";

function readTemplate(path: string): Set<string> {
  const lines = readFileSync(path, "utf8").split("\n");
  const names = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (m) names.add(m[1]);
  }
  return names;
}

function check(templatePath: string): number {
  if (!existsSync(templatePath)) {
    console.log(`[check-env] ${templatePath} not present — skipping`);
    return 0;
  }
  const declared = new Set(ENV_VARS.map((v) => v.name));
  const required = new Set(ENV_VARS.filter((v) => v.required).map((v) => v.name));
  const inTemplate = readTemplate(templatePath);
  let issues = 0;

  for (const name of required) {
    if (!inTemplate.has(name)) {
      console.error(`  ✗ ${templatePath} missing required var: ${name}`);
      issues++;
    }
  }
  for (const name of inTemplate) {
    if (!declared.has(name)) {
      console.warn(`  ! ${templatePath} declares unknown var: ${name} (not in env.ts schema)`);
    }
  }
  return issues;
}

let totalIssues = 0;
console.log("[check-env] verifying templates against src/lib/env.ts schema ...");
totalIssues += check(".env.example");
totalIssues += check(".env.production.example");

if (totalIssues > 0) {
  console.error(`[check-env] ${totalIssues} issue(s). Update the template(s) above.`);
  process.exit(1);
}
console.log(`[check-env] templates in sync (${ENV_VARS.length} vars declared).`);
