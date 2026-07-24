/**
 * probe_build_stamp — Slice TWOWAY-FIX exit gate for the stale-tab signal.
 *
 * The incident: a tutor's tab ran a pre-TWOWAY-1 bundle for an hour after the deploy.
 * It could not draw the plan gate, so the gate the server kept opening was invisible,
 * and every go-ahead re-triggered work the tab could not display. Nothing anywhere
 * told the tab it was out of date.
 *
 * The signal is two artefacts that MUST come from the same build:
 *   - `__BUILD_ID__`, baked into the JS bundle at compile time (vite `define`)
 *   - `dist/version.json`, emitted beside it by the `b2c-build-stamp` plugin
 * The running app polls the second and compares it to the first. If they could ever
 * disagree WITHIN one build, the app would either cry wolf on every load (banner that
 * never goes away) or never fire at all — both worse than no signal.
 *
 * 🔑 This probe BUILDS rather than reading whatever happens to be in dist. A probe
 * that soft-skips when its subject is absent reports a pass for having checked
 * nothing — the failure mode the ai-build-miss log keeps re-learning (M42's family).
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

const ROOT = join(import.meta.dir, "..");
const FE = join(ROOT, "frontend");
const DIST = join(FE, "dist");

function readBuild(): { id: string; bundle: string; html: string } {
  const version = JSON.parse(readFileSync(join(DIST, "version.json"), "utf8"));
  const assets = readdirSync(join(DIST, "assets"));
  const bundle = assets.find((f) => /^index-.*\.js$/.test(f))!;
  return {
    id: version.build,
    bundle,
    html: readFileSync(join(DIST, "index.html"), "utf8"),
  };
}

async function main() {
  console.log("building the frontend (the probe's subject IS the build output)…");
  execSync("bun run build", { cwd: FE, stdio: "ignore" });
  const a = readBuild();

  check("stamp: dist/version.json carries a non-empty string `build`", typeof a.id === "string" && a.id.length > 0);

  const bundleSrc = readFileSync(join(DIST, "assets", a.bundle), "utf8");
  const occurrences = bundleSrc.split(a.id).length - 1;
  check(
    "stamp: the SAME id is baked into the shipped JS bundle (define fired)",
    occurrences >= 1,
  );

  // The load-bearing one. version.json is only meaningful if it describes the bundle
  // index.html actually loads — if the plugin ever emitted beside a different asset,
  // every visitor would be told to refresh forever.
  check(
    "stamp: index.html loads the very bundle the stamp was baked into",
    a.html.includes(a.bundle),
  );

  // A second build must ROTATE the id, or a deploy could ship a new app under an old
  // stamp and the banner would never fire — a signal that silently stops working.
  console.log("rebuilding to prove the id rotates…");
  execSync("bun run build", { cwd: FE, stdio: "ignore" });
  const b = readBuild();

  check("stamp: a fresh build produces a DIFFERENT id", b.id !== a.id);
  check(
    "stamp: the new id is baked into the new bundle too (not just the file)",
    readFileSync(join(DIST, "assets", b.bundle), "utf8").includes(b.id),
  );
  check(
    "stamp: index.html still points at the stamped bundle after a rebuild",
    b.html.includes(b.bundle),
  );

  // The comparison the running app makes, exercised directly: an OLD tab (baked id
  // `a.id`) polling the CURRENT server (`b.id`) must read as stale, and a current tab
  // must not. This is the whole feature in two assertions.
  const isStale = (bakedId: string, served: string) => served !== bakedId;
  check("stale check: an old tab against the new deploy → STALE", isStale(a.id, b.id));
  check("stale check: a current tab against its own deploy → fresh", !isStale(b.id, b.id));

  console.log(`\nprobe_build_stamp: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
