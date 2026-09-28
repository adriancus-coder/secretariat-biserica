import { ACTION_LABEL, displayAuditValue, FIELD_LABELS } from "@/lib/audit-labels";
import type { AuditAction } from "@/lib/audit-types";

export interface AuditRow {
  id: string;
  action: AuditAction;
  userName: string;
  createdAt: Date;
  changes: unknown;
  entityLabel?: string;
}

const dateTime = new Intl.DateTimeFormat("ro-RO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: process.env.APP_TIME_ZONE || "Europe/Bucharest",
});

export function formatDateTime(d: Date): string {
  return dateTime.format(d);
}

function ChangeList({ action, changes }: { action: AuditAction; changes: unknown }) {
  if (!changes || typeof changes !== "object") return null;
  // PostgreSQL (jsonb) nu păstrează ordinea cheilor: le afișăm în ordinea câmpurilor din formulare.
  const order = Object.keys(FIELD_LABELS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const entries = Object.entries(changes as Record<string, unknown>).sort(([a], [b]) => rank(a) - rank(b));
  if (!entries.length) return null;
  return (
    <ul className="mt-1 text-[13px] text-ink-2 space-y-0.5">
      {entries.map(([field, value]) => {
        const label = FIELD_LABELS[field] ?? field;
        if (action === "UPDATE" && Array.isArray(value) && value.length === 2) {
          return (
            <li key={field}>
              <span className="text-ink-3">{label}:</span> {displayAuditValue(field, value[0])}{" "}
              <span aria-hidden="true">→</span> <b className="font-medium">{displayAuditValue(field, value[1])}</b>
            </li>
          );
        }
        return (
          <li key={field}>
            <span className="text-ink-3">{label}:</span> {displayAuditValue(field, value)}
          </li>
        );
      })}
    </ul>
  );
}

/** Istoricul modificărilor unei înregistrări (jurnalul de audit). */
export function AuditTrail({ rows, showLabel = false }: { rows: AuditRow[]; showLabel?: boolean }) {
  if (!rows.length) return <div className="hint">Nicio modificare înregistrată.</div>;
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="border-b border-line pb-2 last:border-0">
          <div className="text-[13px]">
            <span className="text-ink-3">{formatDateTime(r.createdAt)}</span> ·{" "}
            <b className="font-medium">{r.userName || "—"}</b> {ACTION_LABEL[r.action]}
            {showLabel && r.entityLabel ? <> „{r.entityLabel}”</> : null}
          </div>
          <details className="mt-0.5">
            <summary className="text-[12.5px] text-ink-3 cursor-pointer select-none">detalii</summary>
            <ChangeList action={r.action} changes={r.changes} />
          </details>
        </li>
      ))}
    </ol>
  );
}
