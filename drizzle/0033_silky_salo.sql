-- S109 Slice A — ONE role per (user, board).
--
-- HAND-EDITED after drizzle-kit generate. The generator emitted a bare
-- ADD CONSTRAINT ... UNIQUE(user_id, board_id), which fails on any database
-- holding a user with two roles on one board — and the old unique
-- (user_id, board_id, role) allowed exactly that. The dedupe below MUST run
-- first. Everything else is the generator's output, unchanged.
--
-- Precedence admin > tutor > parent > student (contracts.ts ROLES, ordered by
-- privilege): the most-privileged row survives, so nobody is demoted by the
-- collapse. Written as a targeted DELETE, not a TRUNCATE, so it is safe to run
-- against a populated database.
DELETE FROM "membership" m
 USING "membership" k
 WHERE m."user_id" = k."user_id"
   AND m."board_id" = k."board_id"
   AND array_position(ARRAY['admin','tutor','parent','student'], m."role")
     > array_position(ARRAY['admin','tutor','parent','student'], k."role");--> statement-breakpoint

ALTER TABLE "membership" DROP CONSTRAINT "membership_user_id_board_id_role_unique";--> statement-breakpoint
ALTER TABLE "parent_child" DROP CONSTRAINT "parent_child_parent_id_student_id_unique";--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_board_id_unique" UNIQUE("user_id","board_id");--> statement-breakpoint
-- parent_child's unique WIDENS (parent,student) → (board,parent,student), so it
-- can only ever admit more rows than before. No dedupe needed.
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_board_id_parent_id_student_id_unique" UNIQUE("board_id","parent_id","student_id");--> statement-breakpoint
-- If this CHECK fails, some row holds a role outside the four. That is worth
-- failing loudly for rather than coercing — the value would be unreachable by
-- every authorization middleware anyway.
ALTER TABLE "membership" ADD CONSTRAINT "membership_role_check" CHECK ("membership"."role" IN ('student','tutor','parent','admin'));
