import katex from "katex";
import "katex/dist/katex.min.css";

// Render a string that may contain inline `$...$` or display `$$...$$` LaTeX,
// rendering the math with KaTeX and leaving the rest as plain text. Used for the
// authored-question preview (the AI emits inline LaTeX in the stem/answer) so the
// tutor sees rendered math, not raw source. Malformed math renders as KaTeX's own
// inline error (throwOnError:false) instead of crashing the card.
//
// The capturing split keeps the delimited segments; `$$...$$` is listed first so
// display math wins over inline at the same position. `[^$]` inside each form
// keeps a segment from swallowing across the next delimiter.
const SEGMENT = /(\$\$[^$]*\$\$|\$[^$]+\$)/g;

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode });
}

export function MathText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(SEGMENT);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length >= 4 && part.startsWith("$$") && part.endsWith("$$")) {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.length >= 2 && part.startsWith("$") && part.endsWith("$")) {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(1, -1), false) }}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
