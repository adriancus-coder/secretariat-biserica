"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { FormState } from "@/lib/form-state";
import { ROLE_LABEL, ROLES, type RoleKey } from "@/lib/labels";
import { inviteSchema } from "@/lib/schemas/settings";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { sendInvitationEmail, sendPasswordResetEmail, type EmailResult } from "../email";
import { actionCtx, ActionError } from "../session";
import { appUrl, newToken } from "../tokens";
import { parseOrThrow, runFormAction } from "./run";

export interface LinkState extends FormState {
  link?: string;
  /** Shown above the result when the e-mail could not be sent; the link stays visible. */
  warning?: string;
}

/** What the admin reads when an e-mail was not sent (the link is shown for manual sending). */
function emailWarning(result: EmailResult): string | undefined {
  if (result === "disabled") return "Trimiterea pe e-mail nu este configurată.";
  if (result === "failed") return "E-mailul nu a putut fi trimis. Încercați din nou mai târziu sau trimiteți linkul manual.";
  return undefined;
}

const INVITE_DAYS = 7;
const RESET_HOURS = 48;

async function origin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : null;
}

/** Invitație pentru un utilizator nou: link valabil 7 zile, trimis pe e-mail când e configurat. */
export async function inviteUserAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  let link: string | undefined;
  let emailed = "disabled" as EmailResult; // assigned in the callback below
  let invitedEmail = "";
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const { email, role } = parseOrThrow(inviteSchema, Object.fromEntries(formData));
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new ActionError("Există deja un cont cu această adresă de e-mail.");
    }
    const { token, hash } = newToken();
    await ctx.db.$transaction(async (tx) => {
      // O singură invitație activă pe adresă.
      await tx.invitation.updateMany({ where: { email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.invitation.create({
        data: {
          churchId: ctx.user.churchId,
          email,
          role,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
          invitedById: ctx.user.id,
        },
      });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: email,
        entityLabel: `Invitație pentru ${email}`,
        action: "CREATE",
        fields: ["role"],
        after: { role },
        extra: { sursa: "invitație" },
      });
    });
    link = appUrl(`/invitatie/${token}`, await origin());
    invitedEmail = email;
    emailed = await sendInvitationEmail({
      to: email,
      token,
      churchName: ctx.user.churchName,
      invitedBy: ctx.user.name,
      roleLabel: ROLE_LABEL[role],
      validDays: INVITE_DAYS,
    });
  });
  revalidatePath("/setari/utilizatori");
  if (!link) return state;
  return emailed === "sent"
    ? {
        ok: true,
        message: `Invitația a fost trimisă pe e-mail la ${invitedEmail}. Linkul de mai jos (valabil ${INVITE_DAYS} zile) poate fi trimis și manual.`,
        link,
      }
    : {
        ok: true,
        message: `Invitația a fost creată. Trimiteți linkul de mai jos persoanei invitate (valabil ${INVITE_DAYS} zile).`,
        warning: emailWarning(emailed),
        link,
      };
}

export async function revokeInvitationAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    const r = await ctx.db.invitation.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new ActionError("Invitația nu mai este activă.");
  });
  revalidatePath("/setari/utilizatori");
  return state;
}

/** Numărul de administratori activi, excluzând eventual un utilizator. */
async function otherActiveAdmins(churchId: string, exceptUserId: string) {
  return prisma.user.count({ where: { churchId, role: "ADMIN", active: true, id: { not: exceptUserId } } });
}

export async function changeRoleAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, userId);
    const role = String(formData.get("role")) as RoleKey;
    if (!(ROLES as readonly string[]).includes(role)) throw new ActionError("Rol invalid.");
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    if (user.role === role) return { ok: true };
    if (user.role === "ADMIN" && user.active && (await otherActiveAdmins(ctx.user.churchId, userId)) === 0) {
      throw new ActionError("Biserica trebuie să aibă cel puțin un administrator activ.");
    }
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role } });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: ["role"],
        before: { role: user.role },
        after: { role },
      });
    });
    return { ok: true, message: `Rol schimbat în „${ROLE_LABEL[role]}”.` };
  });
  revalidatePath("/setari/utilizatori");
  return state;
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, userId);
    if (userId === ctx.user.id && !active) throw new ActionError("Nu vă puteți dezactiva propriul cont.");
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    if (!active && user.role === "ADMIN" && (await otherActiveAdmins(ctx.user.churchId, userId)) === 0) {
      throw new ActionError("Biserica trebuie să aibă cel puțin un administrator activ.");
    }
    await ctx.db.$transaction(async (tx) => {
      // Dezactivarea închide imediat sesiunile deschise ale utilizatorului.
      await tx.user.update({ where: { id: userId }, data: { active, ...(active ? {} : { sessionVersion: { increment: 1 } }) } });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: ["active"],
        before: { active: user.active },
        after: { active },
      });
    });
  });
  revalidatePath("/setari/utilizatori");
  return state;
}

/** Link de resetare a parolei, generat de administrator (valabil 48 de ore) și trimis pe e-mail. */
export async function passwordResetLinkAction(userId: string): Promise<LinkState> {
  let link: string | undefined;
  let emailed = "disabled" as EmailResult; // assigned in the callback below
  let userEmail = "";
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, userId);
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new ActionError("Utilizatorul nu există sau este dezactivat.");
    const { token, hash } = newToken();
    await ctx.db.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordReset.create({
        data: {
          churchId: ctx.user.churchId,
          userId,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000),
          issuedById: ctx.user.id,
        },
      });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: [],
        extra: { sursa: "link de resetare a parolei" },
      });
    });
    link = appUrl(`/resetare-parola/${token}`, await origin());
    userEmail = user.email;
    emailed = await sendPasswordResetEmail({
      to: user.email,
      token,
      churchName: ctx.user.churchName,
      name: user.name,
      validHours: RESET_HOURS,
    });
  });
  if (!link) return state;
  return emailed === "sent"
    ? {
        ok: true,
        message: `Linkul de resetare a fost trimis pe e-mail la ${userEmail}. Îl puteți trimite și manual (valabil ${RESET_HOURS} de ore):`,
        link,
      }
    : { ok: true, message: `Link de resetare valabil ${RESET_HOURS} de ore:`, warning: emailWarning(emailed), link };
}
