import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/auth";
import type { RoleKey } from "@/lib/labels";
import { permissions, type Permission } from "@/lib/permissions";
import { prisma } from "./db";
import { tenantDb, type TenantClient } from "./tenant-db";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  churchId: string;
  churchName: string;
}

/**
 * Utilizatorul curent, verificat în baza de date la fiecare cerere: contul trebuie să existe,
 * să fie activ, iar versiunea sesiunii să corespundă (schimbarea parolei invalidează sesiunile vechi).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      churchId: true,
      active: true,
      sessionVersion: true,
      church: { select: { nume: true } },
    },
  });
  if (!user || !user.active || user.sessionVersion !== (session.sessionVersion ?? 0)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    churchId: user.churchId,
    churchName: user.church.nume,
  };
});

/** Pentru pagini: redirecționează la autentificare dacă nu există o sesiune validă. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/autentificare");
  return user;
}

/** Pentru pagini: afișează pagina 403 dacă utilizatorul nu are permisiunea. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!permissions[permission](user.role)) forbidden();
  return user;
}

export interface Ctx {
  user: CurrentUser;
  db: TenantClient;
}

/** Contextul pentru stratul de date: utilizatorul + clientul limitat la biserica lui. */
export async function requireCtx(permission?: Permission): Promise<Ctx> {
  const user = permission ? await requirePermission(permission) : await requireUser();
  return { user, db: tenantDb(user.churchId) };
}

export class ActionError extends Error {}

/**
 * Pentru acțiuni de server: nu redirecționează, ci aruncă `ActionError`, pe care formularele
 * îl afișează ca mesaj (vezi src/server/actions/result.ts).
 */
export async function actionCtx(permission?: Permission): Promise<Ctx> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Sesiunea a expirat. Autentificați-vă din nou.");
  if (permission && !permissions[permission](user.role)) {
    throw new ActionError("Nu aveți drepturi pentru această operațiune.");
  }
  return { user, db: tenantDb(user.churchId) };
}
