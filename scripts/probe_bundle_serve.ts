/**
 * probe_bundle_serve (S4) — the bundle byte-route end-to-end over real HTTP with
 * a real Better Auth session cookie (dev bypass). This is the leg the in-process
 * service test can't reach: the cookie-gated /content/bundle/:versionId?board=
 * path the browser's dynamic import() hits.
 *
 * Proves (D-S4-1):
 *   1. member of board A → GET bundle (board=A) → 200 + application/javascript +
 *      body is the stored module source (has `export default` + both keys).
 *   2. NON-member of board B → GET (board=B) → 403 NO_MEMBERSHIP (gate, M11).
 *   3. member of BOTH, but A's version requested under board=B → 404
 *      (RLS hides A's content_unit under the B claim — cross-board isolation).
 *   4. no session cookie → 401 NOT_AUTHENTICATED.
 *   5. unknown board slug → 404 BOARD_NOT_FOUND.
 *
 * Throwaway boards/content (unique per run, M22) + full cleanup. REQUIRES the
 * dev server up (bun run dev) so the HTTP route is live — and a FRESH server
 * that has this route (M25: kill stale first).
 */
import { eq, inArray } from "drizzle-orm";
import {
  appUser,
  board,
  contentUnit,
  contentVersion,
  membership,
  users,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { auth } from "../src/auth/auth";
import { grantRole } from "../src/services/membership";
import { env } from "../src/config/env";

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

const BUNDLE_SOURCE = `const React = window.__REVISION_REACT__;
export default {
  contractVersion: "1",
  components: {
    "slide-probe-a": function (props) { return React.createElement("h1", null, "A"); },
    "slide-probe-b": function (props) { return React.createElement("h1", null, "B"); },
  },
};
`;

async function signUpCookie(email: string): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "dev-password-123", name: email.split("@")[0]! },
    asResponse: true,
  });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function getBundle(
  versionId: string,
  boardSlug: string,
  cookie?: string,
): Promise<{ status: number; ctype: string; body: string }> {
  const res = await fetch(
    `http://localhost:${env.PORT}/content/bundle/${versionId}?board=${boardSlug}`,
    { headers: cookie ? { cookie } : {} },
  );
  return {
    status: res.status,
    ctype: res.headers.get("content-type") ?? "",
    body: await res.text(),
  };
}

async function main() {
  try {
    const h = await fetch(`http://localhost:${env.PORT}/health`);
    if (h.status !== 200) throw new Error();
  } catch {
    console.error(
      `\nprobe_bundle_serve: server not running on :${env.PORT}. Start it (bun run dev) and retry.`,
    );
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  const slugA = `bnd-a-${tag}`;
  const slugB = `bnd-b-${tag}`;
  const email = `bnd-${tag}@example.com`;

  // boards A + B
  const [bA] = await db.insert(board).values({ slug: slugA, name: "Bundle A" }).returning();
  const [bB] = await db.insert(board).values({ slug: slugB, name: "Bundle B" }).returning();
  if (!bA || !bB) throw new Error("board seed failed");

  // content under A: a slide_module unit + version (v1) carrying the bundle
  let versionId = "";
  await withBoard(bA.id, async (tx) => {
    const [unit] = await tx
      .insert(contentUnit)
      .values({ boardId: bA.id, type: "slide_module", source: "starkhorn" })
      .returning();
    const [ver] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit!.id,
        versionNo: 1,
        body: { contractVersion: "1", bundle: BUNDLE_SOURCE, manifest: { slides: {} } },
        publishedAt: new Date(),
      })
      .returning();
    await tx.update(contentUnit).set({ currentVersionId: ver!.id }).where(eq(contentUnit.id, unit!.id));
    versionId = ver!.id;
  });

  // create the membership the REAL way (grantRole = the enablement path, M11) —
  // A for the happy path, and later B so check 3 isolates RLS (member of B but
  // content is on A) from check 2.
  const cookie = await signUpCookie(email);
  check("dev sign-up returned a session cookie", cookie.length > 0);
  await withBoard(bA.id, (tx) => grantRole(tx, { email, name: "Bnd", board: bA, role: "student" }));

  // 1. member of A → bundle under board=A → 200 + JS + correct bytes
  const okA = await getBundle(versionId, slugA, cookie);
  check(`member → bundle 200 (got ${okA.status})`, okA.status === 200);
  check("served as application/javascript", okA.ctype.includes("javascript"));
  check("body has `export default`", okA.body.includes("export default"));
  check("body has both component keys", okA.body.includes("slide-probe-a") && okA.body.includes("slide-probe-b"));

  // 2. NOT a member of B yet → board=B → 403
  const noMem = await getBundle(versionId, slugB, cookie);
  check(`non-member → 403 (got ${noMem.status})`, noMem.status === 403);
  check("403 body NO_MEMBERSHIP", noMem.body.includes("NO_MEMBERSHIP"));

  // 3. now a member of B too, but A's version under board=B → RLS hides A's unit → 404
  await withBoard(bB.id, (tx) => grantRole(tx, { email, name: "Bnd", board: bB, role: "student" }));
  const crossBoard = await getBundle(versionId, slugB, cookie);
  check(`member of B but A's content under board=B → 404 (got ${crossBoard.status})`, crossBoard.status === 404);
  check("404 body VERSION_NOT_FOUND", crossBoard.body.includes("VERSION_NOT_FOUND"));

  // 4. no session → 401
  const noAuth = await getBundle(versionId, slugA);
  check(`no session → 401 (got ${noAuth.status})`, noAuth.status === 401);

  // 5. unknown board → 404
  const badBoard = await getBundle(versionId, `nope-${tag}`, cookie);
  check(`unknown board → 404 (got ${badBoard.status})`, badBoard.status === 404);

  // cleanup
  await withBoard(bA.id, (tx) => tx.delete(membership).where(eq(membership.boardId, bA.id)));
  await withBoard(bB.id, (tx) => tx.delete(membership).where(eq(membership.boardId, bB.id)));
  await withBoard(bA.id, async (tx) => {
    await tx.delete(contentVersion).where(eq(contentVersion.id, versionId));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, bA.id));
  });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(users).where(eq(users.email, email)); // cascades sessions/accounts
  await db.delete(board).where(inArray(board.id, [bA.id, bB.id]));

  console.log(`\nprobe_bundle_serve: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_bundle_serve FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
