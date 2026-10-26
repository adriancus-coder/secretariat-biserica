import "server-only";
import webpush from "web-push";
import { pushPayload, PushCoalescer, pushTypesFor, type PushType } from "@/lib/push";
import { prisma } from "./db";
import { logError } from "./log";
import { pendingBadges } from "./queries/badges";

/**
 * Web Push (VAPID). Off — and hidden in Cont — unless VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * VAPID_SUBJECT are set. Payloads hold a generic title, the address and the waiting count only.
 * Never logs endpoints, keys or payloads.
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

const coalescer = new PushCoalescer();

type Recipient = { id: string; churchId: string; name: string; role: "ADMIN" | "SECRETAR" | "VIZUALIZARE"; isPastor: boolean; active: boolean; pushOff: string[] };

/** Sends one notification to every subscription of the user; "sent" when at least one got it. */
async function sendToUser(user: Recipient, type: PushType | "TEST"): Promise<"sent" | "none" | "limited" | "failed"> {
  if (!user.active) return "none";
  if (type !== "TEST" && (!pushTypesFor(user).includes(type) || user.pushOff.includes(type))) return "none";
  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  if (!subs.length) return "none";
  if (!coalescer.hit(user.id, type)) return "limited";
  setup();
  const badges = await pendingBadges(user);
  const payload = pushPayload(type, Object.values(badges).reduce((a, b) => a + b, 0));
  let sent = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: "normal", topic: type.toLowerCase().replace(/_/g, "") });
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failures: 0 } });
      sent = true;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) {
        // The browser dropped the subscription: forget it.
        await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
      } else {
        await prisma.pushSubscription.updateMany({ where: { id: s.id }, data: { failures: { increment: 1 } } });
        await prisma.auditLog.create({
          data: { churchId: user.churchId, userId: user.id, userName: user.name, entity: "SECURITY", entityId: user.id, entityLabel: user.name, action: "UPDATE", changes: { notificare: "trimitere eșuată", cod: status || "rețea" } },
        });
        logError("push", { name: "PushError", code: `${type} ${status || "network"}`, message: "push failed" });
      }
    }
  }
  return sent ? "sent" : "failed";
}

const recipientSelect = { id: true, churchId: true, name: true, role: true, isPastor: true, active: true, pushOff: true } as const;

/** Notifies the users of a church who may act on `type` (pastors, write roles…), never throws. */
export async function notifyChurch(churchId: string, type: PushType, filter?: { userIds?: string[] }): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const users = await prisma.user.findMany({
      where: { churchId, active: true, pushSubscriptions: { some: {} }, ...(filter?.userIds ? { id: { in: filter.userIds } } : {}) },
      select: recipientSelect,
    });
    for (const u of users) await sendToUser(u, type);
  } catch (e) {
    logError("push-notify", e);
  }
}

/** "Trimite o notificare de test" to the signed-in user's devices. */
export async function sendTestPush(userId: string): Promise<"sent" | "none" | "limited" | "failed"> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: recipientSelect });
  return u ? sendToUser(u, "TEST") : "none";
}
