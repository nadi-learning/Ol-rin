import { useEffect, useRef, useState } from "react";
import { trpc, setBoard, clearPersona } from "../trpc";
import "./gate.css";

/**
 * The missing half of the landing persona (founder).
 *
 * A person who picked "Parent" or "Tutor" on the way in has no membership yet,
 * and `whoami` correctly reports "belongs nowhere" — which sends them into the
 * STUDENT board picker and the student welcome. That is the bug this closes:
 * they were asked their class, their pronoun, a hero and a pet before the app
 * could discover they are not a student.
 *
 * So the membership is minted HERE instead, directly, carrying the claim:
 *
 *   - `intendedRole` is honoured by the server only when minting, and only for
 *     a self-assignable role — an existing role always wins, and `admin` is not
 *     claimable at all (contracts: SELF_ASSIGNABLE_ROLES).
 *   - a non-student claim lands DISABLED, so what it buys is the waiting room
 *     (`AccessPending`), never a capability. An admin enabling them is the only
 *     way out, and that is the point: otherwise anyone clicking the orange card
 *     would get authoring access to real students' content.
 *
 * The board is a PLACEHOLDER, not a question. They are disabled until someone
 * sets them up by hand, and that setup is exactly when the right board gets
 * chosen — asking now would be asking a question we are about to overwrite.
 */
export function ClaimMint({
  claimedRole,
  onDone,
}: {
  claimedRole: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // 🔴 StrictMode double-invokes effects in dev, and this one MUTATES (it mints
  // a membership). Without the guard the second pass races the first: both read
  // "no membership", both insert, and the loser's onConflictDoNothing makes it
  // silent rather than wrong — but it is still two round trips and two chances
  // to land in an inconsistent state. Ref, not state: it must not re-render.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        // Ask which boards exist rather than hardcoding one. `seed:boards` is a
        // deploy step, and a hardcoded slug whose row is missing throws
        // BoardNotFound — the exact failure Slice M's seed exists to prevent.
        const boards = await trpc.session.listBoards.query();
        const slug = boards[0]?.slug;
        if (!slug) {
          setError("No boards are set up yet. Please contact us.");
          return;
        }

        await trpc.session.chooseBoard.mutate({
          board: slug,
          intendedRole: claimedRole as "parent" | "tutor",
        });

        // Only AFTER the mutation succeeds. Clearing first would lose the claim
        // if the request failed, and they would silently become a student on
        // the retry — the very bug this component exists to fix.
        setBoard(slug);
        clearPersona();
        onDone();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    })();
  }, [claimedRole, onDone]);

  if (error) {
    return (
      <div className="gate">
        <p className="gate-error">{error}</p>
      </div>
    );
  }
  return <div className="gate">Setting up your account…</div>;
}
