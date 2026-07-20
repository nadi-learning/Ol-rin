import "./board-setting-up.css";

/**
 * 🔑 Slice M (founder) — what a student sees when the board they picked has
 * NOTHING published yet.
 *
 * This became a real, reachable population the moment the board picker stopped
 * being derived from content (`session_boards.ts`, SUPPORTED_BOARDS). IGCSE
 * exists as a board on purpose and has no chapters at all, so this screen is
 * not a defensive branch — for one of the three boards we offer, it IS the
 * product today.
 *
 * 🔴 IT REPLACED A LIE, NOT A BLANK. The revision landing's empty case rendered
 * `Nothing matches "{query}"` — which is correct for a search that found
 * nothing, and wrong for the case where the search box is EMPTY and the board
 * simply has no lessons. A student on a fresh board was told their own blank
 * query matched nothing. The two cases are now split: a failed SEARCH still
 * says so, and an empty BOARD says this.
 *
 * The voice is SoonBanner's ("Olórin is still writing these", practice.css:90)
 * on purpose — same promise, same narrator, so a student who meets both does
 * not think two different things are broken. And per that banner's founder
 * call: no countdown and no date, because we have none we would defend.
 */
export function BoardSettingUp({ boardName }: { boardName?: string | null }) {
  return (
    <div className="bsu" role="status">
      <h2 className="bsu-head">Olórin is still setting this up</h2>
      <p className="bsu-body">
        {boardName ? (
          <>
            Your lessons for <strong>{boardName}</strong> aren't ready yet.
          </>
        ) : (
          <>Your lessons aren't ready yet.</>
        )}{" "}
        Nothing's wrong — I'm still writing them. I'll have them here for you soon.
      </p>
    </div>
  );
}
