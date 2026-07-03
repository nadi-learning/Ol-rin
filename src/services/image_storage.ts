// Local-FS storage for rendered question images (Slice IMG).
//
// v0 stores PNGs on the local filesystem under IMAGES_DIR; the `storageKey`
// (`{questionId}/v{n}.png`) is the same shape a future R2 object key would take,
// so moving to R2 on deploy is a swap of these two functions — the DB column and
// callers stay put (R2 deferred to deploy-time, like OAuth). A `.py` sibling
// keeps the matplotlib source next to each render for debugging / regen.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { env } from "../config/env";

const root = () => resolve(env.IMAGES_DIR);

/** Absolute path for a storage key, guarded against path traversal. */
function pathFor(storageKey: string): string {
  const abs = resolve(root(), storageKey);
  if (abs !== root() && !abs.startsWith(root() + "/")) {
    throw new Error(`unsafe image storage key: ${storageKey}`);
  }
  return abs;
}

export function storageKeyFor(questionId: string, version: number): string {
  return `${questionId}/v${version}.png`;
}

export interface SavedImage {
  storageKey: string;
}

/** Write the PNG (+ a .py sibling) to the local store; returns its storageKey. */
export async function saveImage(args: {
  questionId: string;
  version: number;
  pngBytes: Uint8Array;
  pyScript: string;
}): Promise<SavedImage> {
  const storageKey = storageKeyFor(args.questionId, args.version);
  const pngPath = pathFor(storageKey);
  await mkdir(dirname(pngPath), { recursive: true });
  await writeFile(pngPath, args.pngBytes);
  await writeFile(pngPath.replace(/\.png$/, ".py"), args.pyScript, "utf-8");
  return { storageKey };
}

/** Read the PNG bytes for a storageKey (used by the serving route). */
export async function readImage(storageKey: string): Promise<Uint8Array> {
  const buf = await readFile(pathFor(storageKey));
  return new Uint8Array(buf);
}
