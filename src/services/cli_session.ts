// Shared helpers for the Claude CLI's per-spawn session JSONL. Ported verbatim
// from Starkhorn (nadi-backend/src/services/cli_session.ts).
//
// Claude CLI persists each spawn's conversation as one JSONL file under
// ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl. When we --resume against a
// prior session id, the CLI replays that JSONL — so it must still exist on disk.
// The encoded-cwd format is the cwd with every `/` replaced by `-`.
//
// The chat turn loop (authoring_chat.ts) preflights JSONL existence before
// deciding to --resume vs fall back to a stitched-transcript path.

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function cliSessionJsonlPath(sessionId: string): string {
  const encoded = process.cwd().replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
}

export async function jsonlExists(sessionId: string): Promise<boolean> {
  try {
    await access(cliSessionJsonlPath(sessionId));
    return true;
  } catch {
    return false;
  }
}
