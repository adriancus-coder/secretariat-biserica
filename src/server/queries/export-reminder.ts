import "server-only";
import { daysBetween, todayIso } from "@/lib/dates";
import type { Ctx } from "../session";

/** Remind after this many days without a JSON export (docs/SECURITY.md, backup policy). */
export const EXPORT_REMINDER_DAYS = 30;

/** Days since the church's last JSON export (the SECURITY audit entry "Export date"); null = never. */
export async function daysSinceLastExport(ctx: Ctx): Promise<number | null> {
  const last = await ctx.db.auditLog.findFirst({
    where: { entity: "SECURITY", entityLabel: "Export date" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last ? daysBetween(todayIso(undefined, last.createdAt), todayIso()) : null;
}

/** "Ultimul export: acum 42 de zile" / "Nu a fost descărcată încă nicio copie de siguranță." */
export function exportAgeText(days: number | null): string {
  if (days === null) return "Nu a fost descărcată încă nicio copie de siguranță.";
  if (days === 0) return "Ultimul export: astăzi.";
  if (days === 1) return "Ultimul export: ieri.";
  return `Ultimul export: acum ${days}${days >= 20 ? " de" : ""} zile.`;
}
