import type { PrismaClient } from "@/generated/prisma/client";

/** Modelele care aparțin unei biserici (au coloana `churchId`). */
export const TENANT_MODELS = new Set([
  "User",
  "Invitation",
  "PasswordReset",
  "Person",
  "Meeting",
  "Event",
  "Document",
  "Group",
  "Note",
  "AuditLog",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/**
 * Adaugă filtrul/valoarea `churchId` în argumentele unei operațiuni Prisma pe un model de tip tenant.
 * Exportat separat pentru a putea fi testat fără bază de date.
 */
export function scopeArgs(model: string, operation: string, args: AnyArgs, churchId: string): AnyArgs {
  if (!TENANT_MODELS.has(model)) return args;
  const a: AnyArgs = { ...(args ?? {}) };
  if (WHERE_OPERATIONS.has(operation)) {
    a.where = { ...(a.where ?? {}), churchId };
  } else if (operation === "create") {
    a.data = { ...((a.data as Record<string, unknown>) ?? {}), churchId };
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    a.data = Array.isArray(a.data)
      ? a.data.map((d) => ({ ...d, churchId }))
      : { ...((a.data as Record<string, unknown>) ?? {}), churchId };
  } else if (operation === "upsert") {
    a.where = { ...(a.where ?? {}), churchId };
    a.create = { ...(a.create ?? {}), churchId };
  }
  return a;
}

/**
 * Întoarce un client Prisma limitat la o singură biserică: toate citirile, modificările și ștergerile
 * pe modelele de tip tenant primesc automat condiția `churchId`, iar creările primesc valoarea.
 * Este o plasă de siguranță suplimentară peste verificările explicite din stratul de acces la date.
 *
 * Atenție: interogările SQL brute ($queryRaw) nu sunt filtrate automat.
 */
export function scopeToChurch(client: PrismaClient, churchId: string) {
  if (!churchId) throw new Error("churchId lipsă");
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as AnyArgs, churchId) as typeof args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof scopeToChurch>;
