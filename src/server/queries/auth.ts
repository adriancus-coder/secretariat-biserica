import "server-only";
import { prisma } from "../db";
import { hashToken } from "../tokens";

/** Înregistrarea unei biserici noi e permisă prin ALLOW_SIGNUP=true sau la prima pornire (nicio biserică). */
export async function signupAllowed(): Promise<boolean> {
  if (process.env.ALLOW_SIGNUP === "true") return true;
  return (await prisma.church.count()) === 0;
}

export async function findValidInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { church: { select: { nume: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) return null;
  return {
    email: invitation.email,
    role: invitation.role,
    churchName: invitation.church.nume,
    expiresAt: invitation.expiresAt,
  };
}

export async function findValidPasswordReset(token: string) {
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true, name: true, active: true } } },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) return null;
  return { email: reset.user.email, name: reset.user.name };
}
