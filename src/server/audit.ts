import "server-only";
import { diff, snapshot } from "@/lib/audit-diff";
import type { AuditAction, AuditEntity, Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "./session";

/** Clientul (sau tranzacția) prin care se scrie intrarea în jurnal. */
interface AuditWriter {
  auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> };
}

interface AuditEntry {
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  /** Câmpurile urmărite. */
  fields: readonly string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Informații suplimentare (ex. sursa „import”). */
  extra?: Record<string, string | number>;
}

/**
 * Scrie o intrare în jurnalul de modificări. Se apelează în aceeași tranzacție cu modificarea,
 * astfel încât jurnalul și datele să rămână consistente.
 * Pentru UPDATE fără câmpuri modificate nu se scrie nimic.
 */
export async function writeAudit(db: AuditWriter, user: CurrentUser, e: AuditEntry): Promise<void> {
  let changes: Prisma.InputJsonValue | undefined;
  if (e.action === "UPDATE") {
    const d = diff(e.before ?? {}, e.after ?? {}, e.fields);
    if (!Object.keys(d).length && !e.extra) return;
    changes = { ...d, ...(e.extra ?? {}) } as Prisma.InputJsonValue;
  } else {
    const snap = snapshot((e.action === "DELETE" ? e.before : e.after) ?? {}, e.fields);
    changes = { ...snap, ...(e.extra ?? {}) } as Prisma.InputJsonValue;
  }
  await db.auditLog.create({
    data: {
      churchId: user.churchId,
      userId: user.id,
      userName: user.name,
      entity: e.entity,
      entityId: e.entityId,
      entityLabel: e.entityLabel.slice(0, 300),
      action: e.action,
      changes,
    },
  });
}
