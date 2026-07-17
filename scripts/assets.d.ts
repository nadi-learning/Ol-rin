// Image modules, declared for the BE/scripts TypeScript program.
//
// Why this lives in scripts/ and not the frontend: `probe_echo_guard.ts`
// imports the guard AND the copy file out of `frontend/src` (S90's deliberate
// call — a second word list in scripts/ would drift from the one the UI calls).
// That pulls FE modules into the BE program, and from S92 the copy file imports
// the pet sticker PNGs. The FE gets this declaration from `vite/client`; the BE
// program has no such types, so without this the ROOT typecheck fails on files
// it does not even own.
//
// This is the running cost of that cross-import precedent (build-state S90,
// owed #7). If the probe is ever moved back behind a FE-side test runner, this
// file goes with it.
declare module "*.png" {
  const src: string;
  export default src;
}

// S96 (ONB-5) — the story scenes are JPEGs (photographic sketch art; PNG would
// be ~4x the bytes for no gain, and these ship to phones in India). The copy
// file imports them, so the BE program sees them too — and the moment it did,
// the root typecheck went red with 18 errors in a file the FE compiles cleanly.
// That is this precedent's cost arriving exactly where S92 said it would.
declare module "*.jpg" {
  const src: string;
  export default src;
}
