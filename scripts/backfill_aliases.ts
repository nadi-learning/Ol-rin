/**
 * Hand-off email → the email that ALREADY EXISTS in our DB (S169, founder call).
 *
 * Shared by `backfill_dashboard.ts` (which writes) and `probe_backfill_dashboard.ts`
 * (which verifies), because the probe matches the loaded children back to the
 * hand-off file by address — if only the writer knew about an alias, the probe
 * would report the correctly-loaded student as MISSING.
 *
 * ── why aliases exist ────────────────────────────────────────────────────────
 * The hand-off names Avani Purwar as `priyapurwar12@gmail.com`; she has been
 * practising on prod since 2026-07-22 as `purwaravani@gmail.com`. Same child.
 * Identity here is `email × phone × user_type`, so loading the hand-off address
 * verbatim would mint a SECOND student profile — and the five months of imported
 * mastery would land on the empty one while her live attempts kept accruing on
 * the other. A parent would then see two children with the same name, one frozen.
 *
 * Keyed on the hand-off address so the source file stays untouched (it is real
 * children's data and is deliberately not in this repo). Add a line per alias as
 * they turn up; an unmapped address is used as-is, which is the common case.
 */
export const EMAIL_ALIASES: Record<string, string> = {
  "priyapurwar12@gmail.com": "purwaravani@gmail.com",
};

/** The address to write/expect for a hand-off address. Pure — callers log. */
export function resolveEmail(handOff: string): string {
  return EMAIL_ALIASES[handOff.trim().toLowerCase()] ?? handOff;
}
