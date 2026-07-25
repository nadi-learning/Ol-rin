/**
 * probe_referral — Slice REFERRAL-1 exit gate (S166).
 *
 * The flow: a parent signs up, types someone's 7-char code in the waiting-room
 * form, and TWO pending rewards are recorded (referrer 50%/1mo, referred
 * 25%/3mo). Nothing pays out — an admin qualifies the referral once month 1 is
 * booked, then marks each half redeemed. Real DB, throwaway identities (M22),
 * cleans up after itself.
 *
 *  1. DB connectivity.
 *  2. normalizeReferralCode: forgives case/space/dash, does NOT repair glyphs.
 *  3. redeem a valid code → referral + 2 reward rows, terms snapshotted, pending.
 *  4. a code with lowercase + spaces + a dash still matches the same referrer.
 *  5. no code → {state:'none'}, and NOTHING is written.
 *  6. unknown code → {state:'unknown_code'}, nothing written.
 *  7. self-referral → {state:'self'}, nothing written.
 *  8. second redeem by the same profile → {state:'already_referred'}, no 2nd row.
 *  9. the DB refuses a duplicate/self referral even if the service is bypassed
 *     (the UNIQUE + CHECK are the real guards, not the typed errors).
 * 10. capture rides parentLink.request: a link request with a code applies it,
 *     and the request itself still lands pending.
 * 11. 🔑 a BAD code does NOT fail the link request (the load-bearing call).
 * 12. getReferralCard: referrer sees who joined + their pending 50%; the referred
 *     parent sees `referredBy` + their 25%.
 * 13. admin listReferrals: both ends, both reward rows, referrer-first order.
 * 14. redeeming a reward under a PENDING referral → REWARD_NOT_QUALIFIED.
 * 15. qualify → reward redeem now allowed, stamped with the actor.
 * 16. void a referral → its still-pending rewards go void, redeemed ones survive.
 * 17. unknown ids → REFERRAL_NOT_FOUND / REWARD_NOT_FOUND.
 * 18. the offer constant is snapshotted, not read live (changing it later must
 *     not restate an already-written ledger row).
 */
import { and, eq, sql } from "drizzle-orm";
import {
  REFERRAL_OFFER,
  normalizeReferralCode,
} from "@b2c/kernel/contracts";
import { appUser, referral, referralReward } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import {
  getReferralCard,
  listReferrals,
  redeemReferralCode,
  ReferralNotFoundError,
  RewardNotFoundError,
  RewardNotQualifiedError,
  setReferralStatus,
  setRewardStatus,
} from "../src/services/referral";
import { submitParentLinkRequest } from "../src/services/parent_link";
import { parentLinkRequest } from "@b2c/kernel/schema";

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

/** How many referral rows exist for a referred profile — the "nothing written" oracle. */
async function referralCount(referredUserId: string): Promise<number> {
  const rows = await db
    .select({ id: referral.id })
    .from(referral)
    .where(eq(referral.referredUserId, referredUserId));
  return rows.length;
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("1. DB connectivity (select 1) as app role", true);

  // ── 2. the normalizer, as a PURE function (no DB, no fixtures) ──────────────
  // Mutually-controlling legs (M84): one direction demands forgiveness, the
  // other demands refusal. No single wrong implementation satisfies both — a
  // normalizer that "cleans" everything fails 2c, one that cleans nothing fails 2a.
  check("2a. normalize forgives case + whitespace + dashes", normalizeReferralCode(" k7m4-pqr ") === "K7M4PQR");
  check("2b. normalize leaves an already-clean code untouched", normalizeReferralCode("K7M4PQR") === "K7M4PQR");
  check(
    "2c. normalize does NOT repair glyph confusions (0 stays 0, never O)",
    normalizeReferralCode("K7M40QR") === "K7M40QR" && normalizeReferralCode("K7M4OQR") === "K7M4OQR",
  );

  // ── identities: a referrer (student, to prove any user_type may refer) and
  //    several fresh parents (a person is referrable exactly once, so each leg
  //    that redeems needs its own).
  const refCode = `RF${tag.slice(-5)}`;
  const referrerEmail = `rfr-src-${tag}@example.com`;
  const [referrer] = await db
    .insert(appUser)
    .values({ email: referrerEmail, name: "Referrer Student", userType: "student", referralCode: refCode })
    .returning();
  if (!referrer) throw new Error("referrer seed failed");

  const mkParent = async (n: string) => {
    const email = `rfr-${n}-${tag}@example.com`;
    const [u] = await db
      .insert(appUser)
      .values({ email, name: `Parent ${n}`, userType: "parent" })
      .returning();
    if (!u) throw new Error(`parent ${n} seed failed`);
    return { id: u.id, email };
  };
  const pA = await mkParent("a");
  const pB = await mkParent("b");
  const pC = await mkParent("c");
  const pD = await mkParent("d");
  const pE = await mkParent("e");
  const adminEmail = `rfr-adm-${tag}@example.com`;
  const [adm] = await db
    .insert(appUser)
    .values({ email: adminEmail, name: "Admin", userType: "admin" })
    .returning();
  if (!adm) throw new Error("admin seed failed");

  // ── 3. the happy path ───────────────────────────────────────────────────────
  const out3 = await redeemReferralCode(db, { referredUserId: pA.id, rawCode: refCode });
  const [ref3] = await db.select().from(referral).where(eq(referral.referredUserId, pA.id));
  const rw3 = await db
    .select()
    .from(referralReward)
    .where(eq(referralReward.referralId, ref3?.id ?? "00000000-0000-0000-0000-000000000000"));
  const rwReferrer = rw3.find((r) => r.side === "referrer");
  const rwReferred = rw3.find((r) => r.side === "referred");
  check("3a. valid code → {state:'applied'}", out3.state === "applied");
  check("3b. one referral row, pending, code snapshotted", ref3?.status === "pending" && ref3?.codeUsed === refCode && ref3?.referrerUserId === referrer.id);
  check("3c. exactly TWO reward rows written", rw3.length === 2);
  check(
    "3d. referrer reward = 50% off 1 month, pending, to the referrer",
    rwReferrer?.percentOff === 50 && rwReferrer?.months === 1 && rwReferrer?.status === "pending" && rwReferrer?.beneficiaryUserId === referrer.id,
  );
  check(
    "3e. referred reward = 25% off 3 months, pending, to the parent",
    rwReferred?.percentOff === 25 && rwReferred?.months === 3 && rwReferred?.status === "pending" && rwReferred?.beneficiaryUserId === pA.id,
  );

  // 4. the damaged-in-transit form of the SAME code, by a different parent.
  const out4 = await redeemReferralCode(db, {
    referredUserId: pB.id,
    rawCode: ` ${refCode.slice(0, 3).toLowerCase()}-${refCode.slice(3)} `,
  });
  const [ref4] = await db.select().from(referral).where(eq(referral.referredUserId, pB.id));
  check("4. lowercase + dash + spaces still matches, stored normalized", out4.state === "applied" && ref4?.codeUsed === refCode);

  // ── 5–8. every refusal, each asserting NOTHING WAS WRITTEN ──────────────────
  // (an outcome string is not proof the ledger stayed clean — M83's lesson:
  //  assert the thing you actually care about, not the report about it.)
  const out5 = await redeemReferralCode(db, { referredUserId: pC.id, rawCode: "   " });
  check("5. blank code → 'none', no row written", out5.state === "none" && (await referralCount(pC.id)) === 0);

  const out6 = await redeemReferralCode(db, { referredUserId: pC.id, rawCode: "ZZZZZZZ" });
  check("6. unknown code → 'unknown_code', no row written", out6.state === "unknown_code" && (await referralCount(pC.id)) === 0);

  // Self-referral: mint a code ON pC and have pC redeem it.
  const selfCode = `SF${tag.slice(-5)}`;
  await db.update(appUser).set({ referralCode: selfCode }).where(eq(appUser.id, pC.id));
  const out7 = await redeemReferralCode(db, { referredUserId: pC.id, rawCode: selfCode });
  check("7. own code → 'self', no row written", out7.state === "self" && (await referralCount(pC.id)) === 0);

  const out8 = await redeemReferralCode(db, { referredUserId: pA.id, rawCode: selfCode });
  check("8. already-referred profile → 'already_referred', still ONE row", out8.state === "already_referred" && (await referralCount(pA.id)) === 1);

  // ── 9. the DB is the real guard, not the service ────────────────────────────
  // Bypass the service entirely and write straight at the table. If these two
  // INSERTs succeed, every check above is decoration — the constraints are what
  // make a second discount or a self-referral impossible, and a future refactor
  // that drops the service checks must still fail here.
  let dupBlocked = false;
  try {
    await db.insert(referral).values({ referrerUserId: referrer.id, referredUserId: pA.id, codeUsed: refCode });
  } catch {
    dupBlocked = true;
  }
  let selfBlocked = false;
  try {
    await db.insert(referral).values({ referrerUserId: pD.id, referredUserId: pD.id, codeUsed: "X" });
  } catch {
    selfBlocked = true;
  }
  check("9a. DB UNIQUE blocks a second referral for one profile (service bypassed)", dupBlocked);
  check("9b. DB CHECK blocks a self-referral (service bypassed)", selfBlocked);

  // ── 10–11. capture through the REAL entry point (the waiting-room form) ─────
  // submitParentLinkRequest mints its own parent shell by email, so use fresh
  // emails here rather than the pre-seeded ids.
  const formEmail = `rfr-form-${tag}@example.com`;
  const req10 = await submitParentLinkRequest({
    email: formEmail,
    name: "Form Parent",
    identifier: `child-${tag}@example.com`,
    referralCode: refCode.toLowerCase(),
  });
  const [formUser] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, formEmail), eq(appUser.userType, "parent")));
  check("10a. link request carries the referral outcome", req10.referral.state === "applied");
  check("10b. the link request itself still lands pending", req10.status === "pending");
  check("10c. the referral row exists for the form parent", formUser ? (await referralCount(formUser.id)) === 1 : false);

  // 🔑 11 — the load-bearing call: a typo'd code must not cost a parent the link.
  const badEmail = `rfr-bad-${tag}@example.com`;
  const req11 = await submitParentLinkRequest({
    email: badEmail,
    name: "Typo Parent",
    identifier: `child2-${tag}@example.com`,
    referralCode: "NOTACODE",
  });
  const [badUser] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, badEmail), eq(appUser.userType, "parent")));
  check("11a. a BAD code does not throw — the link request succeeds", req11.status === "pending");
  check("11b. …and reports why the code did not land", req11.referral.state === "unknown_code");
  check("11c. …and wrote no referral row", badUser ? (await referralCount(badUser.id)) === 0 : false);

  // ── 12. the parent-facing card, from both ends ──────────────────────────────
  const srcCard = await getReferralCard(referrer.id);
  const dstCard = await getReferralCard(pA.id);
  check("12a. referrer's card shows their own code", srcCard.code === refCode);
  check("12b. referrer's card lists everyone who used it (>=3: A, B, form)", srcCard.referred.length >= 3);
  check(
    "12c. referrer's card shows the pending 50% owed to them",
    srcCard.rewards.some((r) => r.side === "referrer" && r.percentOff === 50 && r.status === "pending"),
  );
  check("12d. referrer was not themselves referred", srcCard.referredBy === null);
  check(
    "12e. referred parent's card names who referred them + their 25%/3mo",
    dstCard.referredBy?.name === "Referrer Student" && dstCard.referredBy?.percentOff === 25 && dstCard.referredBy?.months === 3,
  );
  check("12f. referred parent has no one under them", dstCard.referred.length === 0);

  // ── 13. the admin ledger ────────────────────────────────────────────────────
  const ledger = await listReferrals();
  const mine = ledger.find((r) => r.id === ref3!.id);
  check("13a. ledger carries this referral with both ends resolved", mine?.referrer.email === referrerEmail && mine?.referred.email === pA.email);
  check("13b. …the referrer's user_type is shown (any type may refer)", mine?.referrer.userType === "student");
  check("13c. …with both reward rows, referrer first", mine?.rewards.length === 2 && mine?.rewards[0]?.side === "referrer");

  // ── 14–15. the qualification gate ───────────────────────────────────────────
  let notQualified = false;
  try {
    await setRewardStatus({ rewardId: rwReferrer!.id, status: "redeemed", actorUserId: adm.id });
  } catch (e) {
    notQualified = e instanceof RewardNotQualifiedError;
  }
  check("14. redeeming under a PENDING referral → REWARD_NOT_QUALIFIED", notQualified);

  await setReferralStatus({ referralId: ref3!.id, status: "qualified", actorUserId: adm.id });
  const done = await setRewardStatus({ rewardId: rwReferrer!.id, status: "redeemed", actorUserId: adm.id });
  const [rwAfter] = await db.select().from(referralReward).where(eq(referralReward.id, rwReferrer!.id));
  const [refAfter] = await db.select().from(referral).where(eq(referral.id, ref3!.id));
  check("15a. qualify stamps the referral with the actor", refAfter?.status === "qualified" && refAfter?.resolvedBy === adm.id);
  check("15b. …then the reward redeems, stamped with the actor + a time", done.status === "redeemed" && rwAfter?.status === "redeemed" && rwAfter?.redeemedBy === adm.id && rwAfter?.redeemedAt !== null);

  // ── 16. voiding cascades to PENDING rewards only ────────────────────────────
  // ref3 now has one redeemed (referrer) + one pending (referred) reward — the
  // exact mixed state that proves the update is scoped, not blanket.
  await setReferralStatus({ referralId: ref3!.id, status: "void", actorUserId: adm.id });
  const rwVoided = await db.select().from(referralReward).where(eq(referralReward.referralId, ref3!.id));
  check(
    "16a. void sends the still-pending reward to void",
    rwVoided.find((r) => r.side === "referred")?.status === "void",
  );
  check(
    "16b. …but an ALREADY-REDEEMED reward survives (money given is a record, not a promise)",
    rwVoided.find((r) => r.side === "referrer")?.status === "redeemed",
  );

  // ── 17. unknown ids ─────────────────────────────────────────────────────────
  const ghost = "00000000-0000-0000-0000-000000000000";
  let noRef = false;
  try {
    await setReferralStatus({ referralId: ghost, status: "qualified", actorUserId: adm.id });
  } catch (e) {
    noRef = e instanceof ReferralNotFoundError;
  }
  let noRw = false;
  try {
    await setRewardStatus({ rewardId: ghost, status: "void", actorUserId: adm.id });
  } catch (e) {
    noRw = e instanceof RewardNotFoundError;
  }
  check("17a. unknown referral id → REFERRAL_NOT_FOUND", noRef);
  check("17b. unknown reward id → REWARD_NOT_FOUND", noRw);

  // ── 18. the terms are a SNAPSHOT, not a live read ───────────────────────────
  // The ledger row must carry the numbers as written, independent of the
  // constant. Asserting `row.percentOff === REFERRAL_OFFER.referrer.percentOff`
  // would pass trivially for a column that read the constant at SELECT time and
  // would keep passing after the offer changed — so compare against LITERALS,
  // and separately assert the constant still matches what shipped today.
  check("18a. written terms are literal 50/1 and 25/3", rwReferrer?.percentOff === 50 && rwReferrer?.months === 1 && rwReferred?.percentOff === 25 && rwReferred?.months === 3);
  check(
    "18b. today's REFERRAL_OFFER constant agrees with the shipped offer",
    REFERRAL_OFFER.referrer.percentOff === 50 && REFERRAL_OFFER.referrer.months === 1 && REFERRAL_OFFER.referred.percentOff === 25 && REFERRAL_OFFER.referred.months === 3,
  );

  // ── cleanup (FK-safe: rewards+referrals cascade off app_user) ───────────────
  await db.delete(parentLinkRequest).where(sql`${parentLinkRequest.enteredIdentifier} LIKE ${`child%-${tag}@example.com`}`);
  for (const email of [referrerEmail, pA.email, pB.email, pC.email, pD.email, pE.email, adminEmail, formEmail, badEmail]) {
    await db.delete(appUser).where(eq(appUser.email, email)); // referral/reward cascade
  }

  console.log(`\nprobe_referral: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_referral FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
