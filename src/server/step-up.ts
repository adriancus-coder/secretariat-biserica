import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { verifyPassword } from "./password";

/**
 * Step-up for sensitive actions (full and category export, discipline pages, pastoral notes, user role
 * changes, statute and privacy settings): one confirmation — the device unlock when the user has a
 * passkey, otherwise the password — valid 15 minutes. An httpOnly cookie holding the user id, the
 * session version and the expiry, signed with a key derived from AUTH_SECRET: it works only for the
 * same user and session (a sign-out everywhere or a password change ends it).
 */
export const STEP_UP_COOKIE = "secretariat_confirmat";
export const STEP_UP_SECONDS = 15 * 60;

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing");
  return Buffer.from(hkdfSync("sha256", secret, "secretariat-biserica", "step-up-v1", 32));
}

const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function stepUpValue(user: { id: string; sessionVersion: number }, now = Date.now()): string {
  const payload = `${user.id}.${user.sessionVersion}.${Math.floor(now / 1000) + STEP_UP_SECONDS}`;
  return `${payload}.${mac(payload)}`;
}

export function validStepUp(value: string | undefined, user: { id: string; sessionVersion: number }, now = Date.now()): boolean {
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const [uid, version, exp] = payload.split(".");
  if (uid !== user.id || Number(version) !== user.sessionVersion || !(Number(exp) * 1000 > now)) return false;
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(mac(payload));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Has this session confirmed the user's identity in the last 15 minutes? */
export async function hasStepUp(user: { id: string; sessionVersion: number }): Promise<boolean> {
  return validStepUp((await cookies()).get(STEP_UP_COOKIE)?.value, user);
}

/** Sets the grant (server actions only). */
export async function grantStepUp(user: { id: string; sessionVersion: number }) {
  (await cookies()).set(STEP_UP_COOKIE, stepUpValue(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STEP_UP_SECONDS,
  });
}

/** What the confirmation uses for this user: the device unlock when a passkey exists, else the password. */
export async function stepUpMethod(userId: string): Promise<"passkey" | "password"> {
  return (await prisma.userPasskey.count({ where: { userId } })) > 0 ? "passkey" : "password";
}

export const STEP_UP_REQUIRED = "Confirmați întâi identitatea (Face ID, amprentă sau parola), apoi reîncercați.";

/**
 * For a sensitive request that carries a password field (exports): passes with a valid step-up; a user
 * with a passkey must confirm on the device (the password is not enough); otherwise the password.
 */
export async function sensitiveCheck(user: { id: string; sessionVersion: number }, password: string): Promise<"ok" | "device" | "password"> {
  if (await hasStepUp(user)) return "ok";
  if ((await stepUpMethod(user.id)) === "passkey") return "device";
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!password || !account || !(await verifyPassword(password, account.passwordHash))) return "password";
  return "ok";
}
