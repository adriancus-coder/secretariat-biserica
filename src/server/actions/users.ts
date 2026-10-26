"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { ROLE_LABEL, ROLES, type RoleKey } from "@/lib/labels";
import { inviteSchema } from "@/lib/schemas/settings";
import { booleanArg, idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { canGrantDiscipline } from "@/lib/permissions";
import { hasActivePastor } from "../pastor-approval";
import { hasStepUp, STEP_UP_REQUIRED } from "../step-up";
import { prisma } from "../db";
import { sendInvitationEmail, sendPasswordResetEmail, type EmailResult } from "../email";
import { requestOrigin } from "../request-origin";
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
    link = appUrl(`/invitatie/${token}`, await requestOrigin());
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
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, userId);
    const role = String(formData.get("role")) as RoleKey;
    if (!(ROLES as readonly string[]).includes(role)) throw new ActionError("Rol invalid.");
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    if (user.role === role) return { ok: true };
    if (user.role === "ADMIN" && user.active && (await otherActiveAdmins(ctx.user.churchId, userId)) === 0) {
      throw new ActionError("Biserica trebuie să aibă cel puțin un administrator activ.");
    }
    // "Rugăciune" sees only the family of the week: it cannot keep the pastor flag (Statut art. 38–39).
    const dropPastor = role === "RUGACIUNE" && user.isPastor;
    // Access to discipline is only for an Administrator or Secretar (Statut art. 44 lit. d): another role drops it.
    const dropDiscipline = user.accesDisciplina && role !== "ADMIN" && role !== "SECRETAR";
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { role, ...(dropPastor ? { isPastor: false, pastorTitlu: "" } : {}), ...(dropDiscipline ? { accesDisciplina: false, accesDisciplinaDeLa: null, accesDisciplinaLa: null } : {}) },
      });
      if (dropDiscipline) await auditDisciplineAccess(tx, ctx.user, user, false, "rolul s-a schimbat");
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: dropPastor ? ["role", "pastor"] : ["role"],
        before: { role: user.role, pastor: user.isPastor ? "da" : "nu" },
        after: { role, pastor: dropPastor ? "nu" : user.isPastor ? "da" : "nu" },
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
    parseOrThrow(booleanArg, active);
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

/** "Deconectează de pe toate dispozitivele" for one user (sessionVersion + 1). Admin only. */
export async function endUserSessionsAction(userId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, userId);
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: [],
        extra: { sesiuni: "închise pe toate dispozitivele" },
      });
    });
    return { ok: true, message: userId === ctx.user.id ? "Sesiunile au fost închise." : `${user.name} a fost deconectat de pe toate dispozitivele.` };
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
    link = appUrl(`/resetare-parola/${token}`, await requestOrigin());
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

const PASTOR_TITLES = ["", "pastor coordonator", "pastor asistent"] as const;

/** "Pastor al bisericii" (Statut art. 38–39): the flag and its optional label. Administrators only, audited. */
export async function setPastorAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, userId);
    const isPastor = formData.get("isPastor") === "on";
    const titlu = String(formData.get("pastorTitlu") ?? "");
    if (!(PASTOR_TITLES as readonly string[]).includes(titlu)) throw new ActionError("Titlu invalid.");
    const pastorTitlu = isPastor ? titlu : "";
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    if (user.isPastor === isPastor && user.pastorTitlu === pastorTitlu) return { ok: true };
    if (isPastor && user.role === "RUGACIUNE") throw new ActionError("Un utilizator cu rolul „Rugăciune” nu poate fi marcat ca pastor. Schimbați întâi rolul.");
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isPastor, pastorTitlu } });
      await writeAudit(tx, ctx.user, {
        entity: "USER",
        entityId: userId,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        fields: ["pastor", "pastorTitlu"],
        before: { pastor: user.isPastor ? "da" : "nu", pastorTitlu: user.pastorTitlu },
        after: { pastor: isPastor ? "da" : "nu", pastorTitlu },
      });
    });
    return { ok: true, message: isPastor ? "Marcat ca pastor al bisericii." : "Nu mai este marcat ca pastor." };
  });
  revalidatePath("/", "layout");
  return state;
}

type AuditTx = Parameters<typeof writeAudit>[0];

/** SECURITY audit of the access to discipline: who, to whom, when (the entry's user and time). */
async function auditDisciplineAccess(tx: AuditTx, actor: { id: string; name: string } & Parameters<typeof writeAudit>[1], target: { id: string; name: string; email: string }, on: boolean, why?: string) {
  await writeAudit(tx, actor, {
    entity: "SECURITY",
    entityId: target.id,
    entityLabel: `${target.name} <${target.email}>`,
    action: "UPDATE",
    fields: [],
    extra: { observatie: `acces la măsurile disciplinare ${on ? "acordat" : "retras"} de ${actor.name}${why ? ` (${why})` : ""} — Statut art. 44 lit. d` },
  });
}

/**
 * Setări → Utilizatori și roluri → "Acces la măsurile disciplinare (art. 44 lit. d)": a pastor gives or
 * takes back the access of an active Administrator or Secretar (not a pastor: pastors have it); in a
 * church without any pastor user, an Administrator who has the access. Never to oneself. Step-up;
 * audited SECURITY with who, to whom and when.
 */
export async function setDisciplineAccessAction(userId: string, on: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    parseOrThrow(idSchema, userId);
    parseOrThrow(booleanArg, on);
    const hasPastor = await hasActivePastor(ctx.user.churchId);
    if (!canGrantDiscipline(ctx.user, hasPastor)) {
      throw new ActionError(hasPastor ? "Accesul la măsurile disciplinare îl dă un pastor (Statut art. 44 lit. d)." : "Biserica nu are un pastor în aplicație; accesul îl poate da doar un administrator care are el însuși acces.");
    }
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    if (userId === ctx.user.id) throw new ActionError("Nu vă puteți da singur acces la măsurile disciplinare.");
    const user = await ctx.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ActionError("Utilizatorul nu există.");
    if (on && (!user.active || (user.role !== "ADMIN" && user.role !== "SECRETAR"))) throw new ActionError("Accesul se dă doar unui Administrator sau Secretar activ.");
    if (on && user.isPastor) throw new ActionError("Pastorii au deja acces.");
    if (user.accesDisciplina === on) return { ok: true };
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: on ? { accesDisciplina: true, accesDisciplinaDeLa: ctx.user.id, accesDisciplinaLa: new Date() } : { accesDisciplina: false, accesDisciplinaDeLa: null, accesDisciplinaLa: null } });
      await auditDisciplineAccess(tx, ctx.user, user, on);
    });
    return { ok: true, message: on ? `${user.name} are acces la măsurile disciplinare.` : `${user.name} nu mai are acces la măsurile disciplinare.` };
  });
  revalidatePath("/", "layout");
  return state;
}
