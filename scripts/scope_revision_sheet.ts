// scope_revision_sheet.ts — prefix every selector in a Starkhorn-ported CSS
// sheet with `.revision-shell-host ` so its generic component classes (.card,
// .btn-primary, .chip, .page, .voice-*, …) can't leak into the TAITOR app shell.
//
// WHY THIS EXISTS: `frontend/src/styles/revision-shell.css` is ported VERBATIM
// from Starkhorn (`nadi-frontend/src/styles/revision-shell.css`), which is an
// unscoped page sheet. Unscoped, its ~270 generic classes collide with the
// rewrite's own (the giant-chip bug) and force every surface to defensively
// prefix its classes. This scoper closes the leak by host-scoping the whole
// sheet — the slide still gets the design context because PreviewShell renders
// it inside `.revision-shell-host`.
//
// RE-RUN after any fresh verbatim re-pull from Starkhorn. It is IDEMPOTENT
// (won't double-prefix already-scoped rules) and AST-based via postcss (so
// @keyframes steps / @font-face descriptors are correctly left untouched, and
// selectors inside @media/@supports ARE prefixed).
//
//   bun scripts/scope_revision_sheet.ts frontend/src/styles/revision-shell.css
//
// postcss is a dev-only one-shot dependency; install with `bun add -d postcss`
// if it isn't present (it is not a runtime dep of the app).
import postcss from "postcss";
import { readFileSync, writeFileSync } from "node:fs";

const HOST = ".revision-shell-host";
const FILE = process.argv[2];
if (!FILE) throw new Error("usage: bun scripts/scope_revision_sheet.ts <css-file>");

// True if the rule sits inside an at-rule whose body is NOT a list of style
// rules (keyframe steps, @font-face descriptors, @page) — never prefix those.
// @media/@supports/@container bodies ARE style rules and DO get prefixed.
function inNonSelectorAtRule(rule: postcss.Rule): boolean {
  let p = rule.parent as postcss.Container | undefined;
  while (p) {
    if (p.type === "atrule") {
      const name = (p as postcss.AtRule).name.toLowerCase().replace(/^-\w+-/, "");
      if (name === "keyframes" || name === "font-face" || name === "page") return true;
    }
    p = (p as postcss.Node).parent as postcss.Container | undefined;
  }
  return false;
}

const root = postcss.parse(readFileSync(FILE, "utf8"), { from: FILE });
let prefixed = 0, left = 0, skipped = 0;

root.walkRules((rule) => {
  if (inNonSelectorAtRule(rule)) { skipped++; return; }
  rule.selectors = rule.selectors.map((sel) => {
    const s = sel.trim();
    if (s === HOST || [" ", ":", "[", ".", ">"].some((c) => s.startsWith(HOST + c))) {
      left++;
      return sel; // already host-scoped → leave verbatim
    }
    prefixed++;
    return `${HOST} ${s}`;
  });
});

writeFileSync(FILE, root.toString(), "utf8");
console.log(`prefixed=${prefixed}  already-scoped(left)=${left}  keyframe/fontface-rules(left)=${skipped}`);
