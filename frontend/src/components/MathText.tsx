import { Fragment } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// Render a string that may contain inline `$...$` or display `$$...$$` LaTeX,
// rendering the math with KaTeX and leaving the rest as plain text. This is the
// single presentation path for every authored field (stem / reference answer /
// explanation / the student's own typed answer) shown to a student or tutor, so
// text is cleaned once, here, before it reaches any surface:
//   1. Math segments are split out of the RAW string FIRST and handed to KaTeX
//      verbatim — escape-decoding must never touch TeX (`\text`, `\theta`,
//      `\ne`, `\rho`, … would be eaten as `\t`/`\n`/`\r`).
//   2. In the prose between segments, literal escape sequences (`\n`, `\t`,
//      CRLF) that leak in from AI/JSON authoring output are decoded to real
//      whitespace — otherwise the tutor and student see raw `\n` mid-question —
//      and real newlines render as line breaks (HTML would collapse them).
// Malformed math renders as KaTeX's own inline error (throwOnError:false) instead
// of crashing the card.
//
// The capturing split keeps the delimited segments; `$$...$$` is listed first so
// display math wins over inline at the same position. `[^$]` inside each form
// keeps a segment from swallowing across the next delimiter; inline math also
// stops at a real newline so a stray lone `$` in prose can't eat a paragraph.
const SEGMENT = /(\$\$[^$]*\$\$|\$[^$\n]+\$)/g;

// Decode literal escape sequences to the whitespace they were meant to be, and
// normalize CRLF, so downstream we only have to deal with real `\n`. PROSE
// ONLY — never run this over a math segment.
function normalizeEscapes(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\n");
}

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode });
}

// Prose between math segments: decode escapes, then render real newlines as <br/>.
function renderProse(part: string, keyBase: string) {
  const lines = normalizeEscapes(part).split("\n");
  return lines.map((line, li) => (
    <Fragment key={`${keyBase}-${li}`}>
      {li > 0 && <br />}
      {line}
    </Fragment>
  ));
}

export function MathText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(SEGMENT).map((part, i) => {
        const key = String(i);
        if (part.length >= 4 && part.startsWith("$$") && part.endsWith("$$")) {
          return (
            <span
              key={key}
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.length >= 2 && part.startsWith("$") && part.endsWith("$")) {
          return (
            <span
              key={key}
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(1, -1), false) }}
            />
          );
        }
        return <Fragment key={key}>{renderProse(part, key)}</Fragment>;
      })}
    </>
  );
}
