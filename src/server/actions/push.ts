"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { deviceLabel, PUSH_TYPES, pushTypesFor } from "@/lib/push";
import { idSchema } from "@/lib/validation";
import { prisma } from "../db";
import { isPushConfigured, sendTestPush } from "../push";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

const key = z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(200);
const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: key, auth: key }),
});

const audit = (u: { id: string; churchId: string; name: string }, text: string) =>
  prisma.auditLog.create({ data: { churchId: u.churchId, userId: u.id, userName: u.name, entity: "SECURITY", entityId: u.id, entityLabel: u.name, action: "UPDATE", changes: { notificari: text } } });

/** "Activează notificările pe acest dispozitiv": stores the browser's subscription for this user. */
export async function subscribePushAction(subscription: unknown, userAgent: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    if (!isPushConfigured()) throw new ActionError("Notificările nu sunt disponibile.");
    if (!pushTypesFor(ctx.user).length) throw new ActionError("Rolul dumneavoastră nu primește notificări.");
    const sub = subscriptionSchema.safeParse(subscription);
    if (!sub.success) throw new ActionError("Dispozitivul nu a putut fi înregistrat pentru notificări.");
    const device = deviceLabel(String(userAgent ?? "").slice(0, 400));
    // The same browser signed in as someone else takes the subscription over.
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.data.endpoint },
      create: { userId: ctx.user.id, endpoint: sub.data.endpoint, p256dh: sub.data.keys.p256dh, auth: sub.data.keys.auth, userAgent: device },
      update: { userId: ctx.user.id, p256dh: sub.data.keys.p256dh, auth: sub.data.keys.auth, userAgent: device, failures: 0 },
    });
    await audit(ctx.user, `activate pe ${device}`);
    return { ok: true, message: "Notificările sunt activate pe acest dispozitiv." };
  });
  if (state.ok) revalidatePath("/cont");
  return state;
}

/** "Elimină" a device (only one of the user's own). */
export async function removePushAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    parseOrThrow(idSchema, id);
    const sub = await prisma.pushSubscription.findFirst({ where: { id, userId: ctx.user.id }, select: { userAgent: true } });
    if (!sub) throw new ActionError("Dispozitivul nu mai este înregistrat.");
    await prisma.pushSubscription.deleteMany({ where: { id, userId: ctx.user.id } });
    await audit(ctx.user, `dezactivate pe ${sub.userAgent || "un dispozitiv"}`);
    return { ok: true, message: "Dispozitivul nu mai primește notificări." };
  });
  if (state.ok) revalidatePath("/cont");
  return state;
}

/** The per-type switches: the list of types turned off. */
export async function setPushTypesAction(off: string[]): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    const list = z.array(z.enum(PUSH_TYPES)).max(PUSH_TYPES.length).safeParse(off);
    if (!list.success) throw new ActionError("Alegere invalidă.");
    await prisma.user.update({ where: { id: ctx.user.id }, data: { pushOff: [...new Set(list.data)] } });
    return { ok: true, message: "Preferințele au fost salvate." };
  });
  if (state.ok) revalidatePath("/cont");
  return state;
}

/** "Trimite o notificare de test" to all of the user's devices. */
export async function testPushAction(): Promise<FormState> {
  return runFormAction(null, async () => {
    const ctx = await actionCtx();
    if (!isPushConfigured()) throw new ActionError("Notificările nu sunt disponibile.");
    const r = await sendTestPush(ctx.user.id);
    if (r === "none") throw new ActionError("Niciun dispozitiv nu primește notificări. Activați-le întâi.");
    if (r === "limited") throw new ActionError("Ați trimis o notificare de test acum câteva minute. Încercați din nou peste 5 minute.");
    if (r === "failed") throw new ActionError("Notificarea nu a putut fi trimisă. Încercați să o activați din nou pe dispozitiv.");
    return { ok: true, message: "Notificarea de test a fost trimisă." };
  });
}
