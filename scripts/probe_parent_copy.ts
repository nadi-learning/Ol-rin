/**
 * probe_parent_copy — guards the parent-dashboard copy map against the two ways
 * it can break a real parent's page, neither of which TypeScript can see.
 *
 * 1. A MISSING PLACEHOLDER AT A CALL SITE. `fillCopy` throws on an unsupplied
 *    `{token}` — deliberately, so a bad string can never render "{total}" to a
 *    parent. But `vars` is an optional `Record`, so adding `{name}` to a string
 *    and forgetting one `copy()` call site typechecks clean and throws at RENDER.
 *    S168 introduced exactly that: three `story.*` call sites in `MonthStory`.
 *    This scan caught them before the founder's eyeball did.
 *
 * 2. A GENDERED PRONOUN. Founder ruling S168: the dashboard says the child's
 *    NAME, never "she"/"he". `student.pronoun` exists but nothing reads it, so a
 *    pronoun in this map is not a guess about the child — it is an assertion, and
 *    it was wrong for every boy. This leg is a REGRESSION guard: the copy is
 *    prose, and prose is exactly where a pronoun creeps back in.
 *
 * ⚠️ Legs 1–2 read SOURCE, so comments are stripped first (M77 — a comment
 * explaining a deleted thing kept a probe green off its own prose). The strings
 * under test are inside `PARENT_COPY_DEFAULTS`, and call sites are matched in the
 * two files that resolve copy: the page and the read path.
 *
 *   bun scripts/probe_parent_copy.ts
 */
import { readFileSync } from "node:fs";
import {
  PARENT_COPY_DEFAULTS,
  fillCopy,
  placeholdersOf,
  resolveParentCopy,
  type ParentCopyKey,
} from "@b2c/kernel/parent-copy";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** Comments are not the artifact under test (M77). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const CONSUMERS = [
  "frontend/src/components/ParentPage.tsx",
  "src/services/parent.ts",
];

/**
 * Which `{tokens}` does each call site supply? Matches `copy("key", { a, b: c })`
 * and the server's `resolveParentCopy("key", …)`. A call with no object literal
 * supplies nothing — which is the case this probe exists to catch.
 */
function callSites(src: string) {
  const out: Array<{ key: string; supplied: Set<string>; line: number }> = [];
  const re = /(?:copy|resolveParentCopy)\(\s*"([\w.]+)"\s*(?:,\s*\{([^}]*)\})?/g;
  for (const m of src.matchAll(re)) {
    const supplied = new Set<string>();
    for (const v of (m[2] ?? "").split(",")) {
      const nameMatch = v.trim().match(/^(\w+)/);
      if (nameMatch) supplied.add(nameMatch[1]!);
    }
    out.push({ key: m[1]!, supplied, line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

function main() {
  console.log("probe_parent_copy\n");
  const keys = Object.keys(PARENT_COPY_DEFAULTS) as ParentCopyKey[];

  // §1 every default is resolvable when given its own tokens.
  let resolvable = 0;
  for (const k of keys) {
    const tokens = placeholdersOf(PARENT_COPY_DEFAULTS[k]);
    const vars = Object.fromEntries(tokens.map((t) => [t, "X"]));
    try {
      resolveParentCopy(k, vars);
      resolvable++;
    } catch {
      /* counted by the check below */
    }
  }
  check(`§1 all ${keys.length} defaults resolve with their own tokens`, resolvable === keys.length);

  // §1b the throw is REAL — the guard that makes §2 meaningful (negative control).
  let threw = false;
  try {
    fillCopy("hello {name}", {});
  } catch {
    threw = true;
  }
  check("§1b NEGATIVE CONTROL: fillCopy throws on a missing token", threw);

  // §2 every call site supplies every token its key needs.
  const offenders: string[] = [];
  let scanned = 0;
  for (const file of CONSUMERS) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const site of callSites(src)) {
      const template = PARENT_COPY_DEFAULTS[site.key as ParentCopyKey];
      if (!template) continue; // dynamic key (e.g. `map.over.${state}`) — §3 covers those
      scanned++;
      const missing = placeholdersOf(template).filter((t) => !site.supplied.has(t));
      if (missing.length) offenders.push(`${file}:${site.line} copy("${site.key}") missing {${missing.join("},{")}}`);
    }
  }
  check(`§2 all ${scanned} static call sites supply their tokens`, offenders.length === 0);
  for (const o of offenders) console.error(`      ${o}`);

  // §3 the dynamically-keyed families must exist for EVERY value they can take,
  // since a missing one renders `undefined` rather than throwing.
  for (const st of ["green", "yellow", "red", "gray"]) {
    check(`§3 map.over.${st} exists (dynamic key)`, `map.over.${st}` in PARENT_COPY_DEFAULTS);
  }

  // §4 the founder's ruling: no gendered pronouns anywhere in the map.
  const PRONOUN = /\b(she|her|hers|herself|he|him|his|himself)\b/i;
  const gendered = keys.filter((k) => PRONOUN.test(PARENT_COPY_DEFAULTS[k]));
  check("§4 NO gendered pronouns in any default string (S168 ruling)", gendered.length === 0);
  for (const g of gendered) console.error(`      ${g}: "${PARENT_COPY_DEFAULTS[g]}"`);

  // §4b the pronoun matcher can actually fire (negative control — a regex that
  // matches nothing would keep §4 green forever).
  check("§4b NEGATIVE CONTROL: the pronoun matcher fires on a pronoun", PRONOUN.test("here's what she built"));

  // §5 the child's name reaches the strings that name them.
  const named = keys.filter((k) => placeholdersOf(PARENT_COPY_DEFAULTS[k]).includes("name"));
  check(`§5 ${named.length} strings address the child by name`, named.length >= 15);

  console.log(`\nprobe_parent_copy: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
