/**
 * Slice REFERRAL-1 (S166) — the redemption side of referrals.
 *
 * The share-out-loud half already existed: every `app_user` profile is minted
 * with a unique 7-char `referral_code` (contracts.ts, S138). What was missing is
 * everything that happens AFTER someone reads that code out — capturing it,
 * recording who owes whom what, and letting ops work the list.
 *
 * The flow:
 *   1. A parent signs up and, in the same waiting-room form where they name their
 *      child, optionally types a code (`parentLink.request`, board-less).
 *   2. `redeemReferralCode` matches it to a profile and writes ONE `referral` row
 *      plus TWO `referral_reward` rows — the referrer's 50%/1mo and the referred
 *      parent's 25%/3mo — both `pending`, with the terms snapshotted.
 *   3. Nothing else happens automatically. There is NO billing anywhere in this
 *      codebase, so "books month 1" is not an event the app can observe. An admin
 *      confirms it on the Referrals tab (`setReferralStatus` → 'qualified'), and
 *      marks each half `redeemed` when the discount is actually given.
 *
 * 🔑 The load-bearing design call: a bad code NEVER fails the request it rides on.
 * The parent's real errand is linking to their child; the referral is a bonus. So
 * `redeemReferralCode` returns an OUTCOME rather than throwing, and the caller
 * reports it alongside a link request that succeeded regardless. A typo'd code
 * must not cost a parent their dashboard.
 *
 * Tenancy: `referral` + `referral_reward` are GLOBAL / non-RLS (see schema). The
 * admin ledger is therefore global too — a referral spans two identities who may
 * be on different boards or on none, so there is no board to scope it by. This is
 * the one admin surface in the app that is NOT board-walled, and it is safe only
 * because `adminProcedure` takes two locks (role AND the hardcoded ADMIN_EMAILS).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias, type PgTransaction } from "drizzle-orm/pg-core";
import {
  REFERRAL_OFFER,
  normalizeReferralCode,
  type ReferralSide,
  type ReferralStatus,
  type RewardStatus,
} from "@b2c/kernel/contracts";
import { appUser, referral, referralReward } from "@b2c/kernel/schema";
import { db } from "../db/client";

type Tx = PgTransaction<any, any, any>;
/** Every write here touches only GLOBAL tables, so a board-less `db` is enough. */
type Db = Tx | typeof db;

export class ReferralNotFoundError extends Error {
  readonly code = "REFERRAL_NOT_FOUND";
  constructor(id: string) {
    super(`referral ${id} not found`);
    this.name = "ReferralNotFoundError";
  }
}
export class RewardNotFoundError extends Error {
  readonly code = "REWARD_NOT_FOUND";
  constructor(id: string) {
    super(`referral reward ${id} not found`);
    this.name = "RewardNotFoundError";
  }
}
/** A reward cannot be redeemed before the referral it hangs off is qualified. */
export class RewardNotQualifiedError extends Error {
  readonly code = "REWARD_NOT_QUALIFIED";
  constructor() {
    super("this referral has not been qualified yet");
    this.name = "RewardNotQualifiedError";
  }
}

/**
 * Why a code did or did not land. Deliberately a RESULT, not an exception —
 * see the header. `applied` is the only success; the rest are all "your link
 * request went through, the code did not", each distinguishable so the UI can
 * say something specific rather than a generic failure.
 */
export type RedeemOutcome =
  | { state: "applied"; referrerName: string | null; percentOff: number; months: number }
  | { state: "none" } // no code was typed at all
  | { state: "unknown_code" } // nothing matched
  | { state: "self" } // their own code
  | { state: "already_referred" }; // this profile already redeemed one

/**
 * Capture a code for `referredUserId`. Idempotent by construction: the UNIQUE on
 * `referral.referred_user_id` means a second attempt reports `already_referred`
 * rather than stacking a second discount — including a re-submit of the SAME
 * code, which is what a double-tapped form produces.
 */
export async function redeemReferralCode(
  tx: Db,
  args: { referredUserId: string; rawCode: string | null | undefined },
): Promise<RedeemOutcome> {
  const code = normalizeReferralCode(args.rawCode ?? "");
  if (!code) return { state: "none" };

  // Already referred? Checked FIRST so a person who re-opens the form and types a
  // different code is told the truth ("you already used one") instead of being
  // silently handed the unique-violation of the row they already have.
  const [prior] = await tx
    .select({ id: referral.id })
    .from(referral)
    .where(eq(referral.referredUserId, args.referredUserId))
    .limit(1);
  if (prior) return { state: "already_referred" };

  // Match the code. `referral_code` is UNIQUE, so this is at most one row —
  // across ALL user types on purpose: a student or a tutor may refer a parent,
  // and the offer names "whoever's code they used" (founder, S164).
  const [referrer] = await tx
    .select({ id: appUser.id, name: appUser.name })
    .from(appUser)
    .where(eq(appUser.referralCode, code))
    .limit(1);
  if (!referrer) return { state: "unknown_code" };

  // Self-referral. The DB CHECK forbids it too; this exists so the surface can
  // say "that's your own code" rather than surfacing a constraint violation.
  // NB: the check is on the PROFILE id, so a person's student code used by their
  // own parent profile IS allowed — those are two different people to us, and
  // deciding otherwise would need email matching we deliberately don't do here.
  if (referrer.id === args.referredUserId) return { state: "self" };

  const [row] = await tx
    .insert(referral)
    .values({
      referrerUserId: referrer.id,
      referredUserId: args.referredUserId,
      codeUsed: code,
    })
    // Concurrent double-submit (two tabs): the loser writes nothing instead of
    // throwing. `prior` above catches the sequential case; this catches the race.
    .onConflictDoNothing({ target: referral.referredUserId })
    .returning({ id: referral.id });
  if (!row) return { state: "already_referred" };

  // Both halves of the offer, terms snapshotted (contracts.ts REFERRAL_OFFER).
  await tx.insert(referralReward).values([
    {
      referralId: row.id,
      beneficiaryUserId: referrer.id,
      side: "referrer" satisfies ReferralSide,
      percentOff: REFERRAL_OFFER.referrer.percentOff,
      months: REFERRAL_OFFER.referrer.months,
    },
    {
      referralId: row.id,
      beneficiaryUserId: args.referredUserId,
      side: "referred" satisfies ReferralSide,
      percentOff: REFERRAL_OFFER.referred.percentOff,
      months: REFERRAL_OFFER.referred.months,
    },
  ]);

  return {
    state: "applied",
    referrerName: referrer.name,
    percentOff: REFERRAL_OFFER.referred.percentOff,
    months: REFERRAL_OFFER.referred.months,
  };
}

export type ReferralCard = {
  /** The caller's own code. Null only for a legacy profile minted before S138. */
  code: string | null;
  /** People who used it, newest first. */
  referred: {
    name: string | null;
    email: string;
    status: ReferralStatus;
    createdAt: Date;
  }[];
  /** What the caller stands to get — one entry per reward owed TO them. */
  rewards: {
    id: string;
    side: ReferralSide;
    percentOff: number;
    months: number;
    status: RewardStatus;
  }[];
  /** Set when the caller themselves arrived via someone's code. */
  referredBy: { name: string | null; percentOff: number; months: number } | null;
};

/**
 * The "refer & earn" card for ONE profile. Reads global tables only, so it takes
 * a profile id rather than a board — the same shape serves the parent dashboard
 * today and any other surface that grows one later.
 */
export async function getReferralCard(userId: string): Promise<ReferralCard> {
  const [me] = await db
    .select({ code: appUser.referralCode })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  const referredRows = await db
    .select({
      name: appUser.name,
      email: appUser.email,
      status: referral.status,
      createdAt: referral.createdAt,
    })
    .from(referral)
    .innerJoin(appUser, eq(appUser.id, referral.referredUserId))
    .where(eq(referral.referrerUserId, userId))
    .orderBy(desc(referral.createdAt));

  const rewardRows = await db
    .select({
      id: referralReward.id,
      side: referralReward.side,
      percentOff: referralReward.percentOff,
      months: referralReward.months,
      status: referralReward.status,
    })
    .from(referralReward)
    .where(eq(referralReward.beneficiaryUserId, userId))
    .orderBy(desc(referralReward.createdAt));

  // Who referred ME — a join back the other way. The reward figures come off the
  // ledger row, not the live constant, so the card tells them what they were
  // actually promised on the day (see REFERRAL_OFFER's comment).
  const [inbound] = await db
    .select({
      name: appUser.name,
      percentOff: referralReward.percentOff,
      months: referralReward.months,
    })
    .from(referral)
    .innerJoin(appUser, eq(appUser.id, referral.referrerUserId))
    .innerJoin(
      referralReward,
      and(
        eq(referralReward.referralId, referral.id),
        eq(referralReward.side, "referred"),
      ),
    )
    .where(eq(referral.referredUserId, userId))
    .limit(1);

  return {
    code: me?.code ?? null,
    referred: referredRows.map((r) => ({
      name: r.name,
      email: r.email,
      status: r.status as ReferralStatus,
      createdAt: r.createdAt,
    })),
    rewards: rewardRows.map((r) => ({
      id: r.id,
      side: r.side as ReferralSide,
      percentOff: r.percentOff,
      months: r.months,
      status: r.status as RewardStatus,
    })),
    referredBy: inbound
      ? { name: inbound.name, percentOff: inbound.percentOff, months: inbound.months }
      : null,
  };
}

export type AdminReferralRow = {
  id: string;
  codeUsed: string;
  status: ReferralStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  referrer: { userId: string; name: string | null; email: string; userType: string };
  referred: { userId: string; name: string | null; email: string; userType: string };
  rewards: {
    id: string;
    side: ReferralSide;
    percentOff: number;
    months: number;
    status: RewardStatus;
    redeemedAt: Date | null;
  }[];
};

/**
 * Admin ledger — every referral, newest first, each with both reward rows.
 *
 * GLOBAL, not board-scoped: see the header. Unlike the parent-link panel (whose
 * candidate students are RLS-walled because the LINK is a board action), nothing
 * here is board-shaped, and an admin who could only see same-board referrals
 * would see a partial ledger with no way to know it was partial.
 *
 * Two queries + a join in memory rather than one row-per-reward query: the page
 * renders per REFERRAL, and flattening rewards back out of a fanned-out result is
 * more code than fetching them once and grouping.
 */
export async function listReferrals(limit = 200): Promise<AdminReferralRow[]> {
  // Both ends of a referral are `app_user`, so the join needs TWO aliases of the
  // same table — drizzle's `alias()`, which keeps the columns typed (a raw SQL
  // join would hand back `any` and push the shape checking into this file).
  const referrerU = alias(appUser, "referrer_u");
  const referredU = alias(appUser, "referred_u");

  const list = await db
    .select({
      id: referral.id,
      codeUsed: referral.codeUsed,
      status: referral.status,
      createdAt: referral.createdAt,
      resolvedAt: referral.resolvedAt,
      referrerId: referrerU.id,
      referrerName: referrerU.name,
      referrerEmail: referrerU.email,
      referrerType: referrerU.userType,
      referredId: referredU.id,
      referredName: referredU.name,
      referredEmail: referredU.email,
      referredType: referredU.userType,
    })
    .from(referral)
    .innerJoin(referrerU, eq(referrerU.id, referral.referrerUserId))
    .innerJoin(referredU, eq(referredU.id, referral.referredUserId))
    .orderBy(desc(referral.createdAt))
    .limit(limit);

  // Guard the reward fetch: `inArray` with an EMPTY list generates `in ()`, which
  // is a syntax error in Postgres — the empty ledger is the normal state today.
  if (list.length === 0) return [];

  const rewards = await db
    .select({
      id: referralReward.id,
      referralId: referralReward.referralId,
      side: referralReward.side,
      percentOff: referralReward.percentOff,
      months: referralReward.months,
      status: referralReward.status,
      redeemedAt: referralReward.redeemedAt,
    })
    .from(referralReward)
    .where(inArray(referralReward.referralId, list.map((r) => r.id)));

  const byReferral = new Map<string, AdminReferralRow["rewards"]>();
  for (const w of rewards) {
    const bucket = byReferral.get(w.referralId) ?? [];
    bucket.push({
      id: w.id,
      side: w.side as ReferralSide,
      percentOff: w.percentOff,
      months: w.months,
      status: w.status as RewardStatus,
      redeemedAt: w.redeemedAt,
    });
    byReferral.set(w.referralId, bucket);
  }

  return list.map((r) => ({
    id: r.id,
    codeUsed: r.codeUsed,
    status: r.status as ReferralStatus,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    referrer: {
      userId: r.referrerId,
      name: r.referrerName,
      email: r.referrerEmail,
      userType: r.referrerType,
    },
    referred: {
      userId: r.referredId,
      name: r.referredName,
      email: r.referredEmail,
      userType: r.referredType,
    },
    // Sorted referrer-first so the two rows render in a stable order regardless
    // of insert order — the card reads as a pair, not a list.
    rewards: (byReferral.get(r.id) ?? []).sort((a, b) =>
      a.side === b.side ? 0 : a.side === "referrer" ? -1 : 1,
    ),
  }));
}

/**
 * Admin — move a referral to `qualified` (the referred party booked month 1) or
 * `void`. Qualifying is what makes both rewards claimable; voiding also voids
 * every still-pending reward under it, so a withdrawn referral cannot leave a
 * live obligation behind. An already-`redeemed` reward is left alone — that is a
 * record of money already given, not a promise.
 */
export async function setReferralStatus(args: {
  referralId: string;
  status: Extract<ReferralStatus, "qualified" | "void">;
  actorUserId: string;
}): Promise<{ status: ReferralStatus }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: referral.id })
      .from(referral)
      .where(eq(referral.id, args.referralId))
      .limit(1);
    if (!row) throw new ReferralNotFoundError(args.referralId);

    await tx
      .update(referral)
      .set({ status: args.status, resolvedBy: args.actorUserId, resolvedAt: new Date() })
      .where(eq(referral.id, args.referralId));

    if (args.status === "void") {
      await tx
        .update(referralReward)
        .set({ status: "void" })
        .where(
          and(
            eq(referralReward.referralId, args.referralId),
            eq(referralReward.status, "pending"),
          ),
        );
    }
    return { status: args.status };
  });
}

/**
 * Admin — mark ONE side's reward `redeemed` (the discount was given) or `void`.
 *
 * Redeeming is GATED on the parent referral being `qualified`: the offer says the
 * referrer earns their 50% "once the referred books month 1", so redeeming under
 * a still-pending referral would be paying out a condition nobody has confirmed.
 * Voiding is not gated — withdrawing an obligation is always allowed.
 */
export async function setRewardStatus(args: {
  rewardId: string;
  status: Extract<RewardStatus, "redeemed" | "void">;
  actorUserId: string;
}): Promise<{ status: RewardStatus }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: referralReward.id,
        referralStatus: referral.status,
      })
      .from(referralReward)
      .innerJoin(referral, eq(referral.id, referralReward.referralId))
      .where(eq(referralReward.id, args.rewardId))
      .limit(1);
    if (!row) throw new RewardNotFoundError(args.rewardId);
    if (args.status === "redeemed" && row.referralStatus !== "qualified") {
      throw new RewardNotQualifiedError();
    }

    await tx
      .update(referralReward)
      .set({
        status: args.status,
        redeemedBy: args.status === "redeemed" ? args.actorUserId : null,
        redeemedAt: args.status === "redeemed" ? new Date() : null,
      })
      .where(eq(referralReward.id, args.rewardId));
    return { status: args.status };
  });
}

/** Resolve a profile id for (email, user_type) — the parent card's entry point. */
export async function findProfileId(
  email: string,
  userType: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, userType)))
    .limit(1);
  return row?.id ?? null;
}
