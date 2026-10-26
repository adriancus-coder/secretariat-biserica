import type { ReactNode } from "react";

/**
 * "Name + secondary text" on one row (CLAUDE.md UI rules). The name is never cut: no ellipsis,
 * no line clamp; it wraps when it is longer than the row. The secondary text sits at the right
 * edge when both fit and moves under the name, aligned left, when they do not; it wraps, never cut.
 * `lead` is an optional fixed column before them (a day number, a date).
 */
export function NameRow({ name, detail, lead, className }: { name: ReactNode; detail?: ReactNode; lead?: ReactNode; className?: string }) {
  return (
    <span className={`name-row${className ? ` ${className}` : ""}`}>
      {lead !== undefined ? <span className="name-row-lead">{lead}</span> : null}
      <span className="name-row-main">
        <span className="name-row-name">{name}</span>
        {detail ? <span className="name-row-detail">{detail}</span> : null}
      </span>
    </span>
  );
}
