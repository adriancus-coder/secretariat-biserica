import type { ReactNode } from "react";
import type { RichBlock, RichDoc, RichInline } from "@/lib/rich-text";

/** A stored rich document shown read-only (detail pages, viewers): React elements only, never HTML. */
export function RichView({ doc, className = "" }: { doc: RichDoc; className?: string }) {
  return <div className={`rt-view font-serif ${className}`}>{doc.content.map(block)}</div>;
}

function block(b: RichBlock, key: number): ReactNode {
  if (b.type === "paragraph") {
    return (
      <p key={key} data-align={b.attrs?.align ?? undefined}>
        {(b.content ?? []).map(inline)}
      </p>
    );
  }
  const items = b.content.map((item, i) => <li key={i}>{item.content.map(block)}</li>);
  return b.type === "orderedList" ? (
    <ol key={key} start={b.attrs?.start ?? 1}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
}

function inline(n: RichInline, key: number): ReactNode {
  if (n.type === "hardBreak") return <br key={key} />;
  let out: ReactNode = n.text;
  for (const m of n.marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "underline") out = <u>{out}</u>;
    else if (m.type === "textSize" && m.attrs.size !== "normal") out = <span data-size={m.attrs.size}>{out}</span>;
  }
  return <span key={key}>{out}</span>;
}
