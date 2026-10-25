"use server";

import { STATUTE } from "@/lib/statutes";
import { listStatutes } from "../statutes";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { APPLICATION_KIND_LABEL, resolveNomen } from "@/lib/labels";
import { APPLICATION_FIELDS, APPLICATIONS_CLOSED_MESSAGE, applicationSchema } from "@/lib/schemas/application";
import { isValidSlug } from "@/lib/slug";
import { idSchema, text } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { sendNewApplicationEmail } from "../email";
import { sharedRateLimiter } from "../rate-limit";
import { actionCtx, ActionError } from "../session";
import { tenantDb } from "../tenant-db";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/** 5 submissions per hour for the same visitor (IP address) and church. */
const submissions = sharedRateLimiter("applications", { limit: 5, windowMs: 3_600_000 });

/** The visitor's IP as reported by the platform proxy; the first X-Forwarded-For entry. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "necunoscut";
}

/**
 * Public membership application. The church comes only from the slug in the address (looked up
 * here, never from a form field), and the row is written through the client scoped to it.
 */
export async function submitApplicationAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let sent = false;
  const state = await runFormAction(formData, async () => {
    if (!isValidSlug(slug)) throw new ActionError(APPLICATIONS_CLOSED_MESSAGE);
    const church = await prisma.church.findUnique({
      where: { slug },
      select: { id: true, nume: true, applicationsOpen: true, gradeRudenie: true },
    });
    if (!church?.applicationsOpen) throw new ActionError(APPLICATIONS_CLOSED_MESSAGE);

    // Honeypot: people never see this field; bots that fill it get the success page, nothing is saved.
    if (String(formData.get("website") ?? "").trim()) {
      sent = true;
      return;
    }

    const input = parseOrThrow(applicationSchema, Object.fromEntries(formData));
    if (input.rudenie && !resolveNomen({ rudenie: church.gradeRudenie }).rudenie.includes(input.rudenie)) {
      throw new ValidationError({ rudenie: "Alegeți o valoare din listă." });
    }
    if (!submissions.hit(`${await clientIp()}|${slug}`)) {
      throw new ActionError("Ați trimis deja mai multe cereri în ultima oră. Încercați din nou mai târziu.");
    }

    // Every statute the church publishes must be accepted; flags are kept only for those.
    const published = (await listStatutes(church.id)).map((s) => s.kind);
    const missing = published.filter((k) => !input[STATUTE[k].consentField]);
    if (missing.length) {
      throw new ValidationError(Object.fromEntries(missing.map((k) => [STATUTE[k].consentField, `Este necesar acordul cu ${STATUTE[k].noteName}.`])));
    }
    const { consent, dataNasterii, dataBotez, consentStatutCult, consentStatutIntern, ...fields } = input;
    const statuteConsent = {
      consentStatutCult: consentStatutCult && published.includes("STATUT_CULT"),
      consentStatutIntern: consentStatutIntern && published.includes("STATUT_INTERN"),
      consentAt: published.length ? new Date() : null,
    };
    const db = tenantDb(church.id);
    const created = await db.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          ...fields,
          churchId: church.id,
          consent,
          ...statuteConsent,
          dataNasterii: toDbDate(dataNasterii),
          dataBotez: toDbDate(dataBotez),
        },
      });
      await tx.auditLog.create({
        data: {
          churchId: church.id,
          userName: "Formular online",
          entity: "APPLICATION",
          entityId: app.id,
          entityLabel: memberName(app),
          action: "CREATE",
          changes: { stare: "PENDING", tipCerere: app.kind, nume: app.nume, prenume: app.prenume, sursa: "formular online" },
        },
      });
      return app;
    });

    after(async () => {
      try {
        const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
        if (!admins.length) return;
        await sendNewApplicationEmail({
          to: admins.map((a) => a.email),
          applicationId: created.id,
          churchName: church.nume,
          applicantName: memberName(created),
          kindLabel: APPLICATION_KIND_LABEL[created.kind],
        });
      } catch (error) {
        console.error("[applications] notification failed:", error instanceof Error ? error.message : String(error));
      }
    });
    sent = true;
  });
  if (!sent) return state;
  redirect(`/cerere/${slug}/trimisa`);
}

/** Comparable audit view of an application. */
function auditView(a: { status: string; kind: string; nume: string; prenume: string; telefon: string; email: string; rejectReason: string }) {
  return { stare: a.status, tipCerere: a.kind, nume: a.nume, prenume: a.prenume, telefon: a.telefon, email: a.email, motiv: a.rejectReason };
}

/** Rejects a pending application, with an optional reason. */
export async function rejectApplicationAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    const reason = parseOrThrow(text(500, "Motivul"), formData.get("motiv") ?? "");
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.application.findUnique({ where: { id } });
      if (!before) throw new ActionError("Cererea nu mai există.");
      const r = await tx.application.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: reason, decidedAt: new Date(), decidedById: ctx.user.id },
      });
      if (r.count !== 1) throw new ActionError("Cererea a fost deja procesată.");
      await writeAudit(tx, ctx.user, {
        entity: "APPLICATION",
        entityId: id,
        entityLabel: memberName(before),
        action: "UPDATE",
        fields: APPLICATION_FIELDS,
        before: auditView(before),
        after: auditView({ ...before, status: "REJECTED", rejectReason: reason }),
      });
    });
    return { ok: true };
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect(`/cereri/${id}?salvat=1`);
}

/** Deletes an application (administrators only). */
export async function deleteApplicationAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.application.findUnique({ where: { id } });
      if (!before) throw new ActionError("Cererea nu mai există.");
      await tx.application.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "APPLICATION",
        entityId: id,
        entityLabel: memberName(before),
        action: "DELETE",
        fields: APPLICATION_FIELDS,
        before: auditView(before),
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/cereri?sters=1");
}
