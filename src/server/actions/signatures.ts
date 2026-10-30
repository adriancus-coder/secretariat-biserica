"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import { MINUTES_ROLE_LABEL, missingLine, placeLabel, roleSigners, tableSigners, type MinutesRole } from "@/lib/minutes-signatures";
import { booleanArg, idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { normalizeSignature, SignatureImageError } from "../signature-image";
import { getChurch } from "../queries/church";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const SIGNATURE_FIELDS = ["semnaturi", "inchis"] as const;
const LOCKED = "Procesul-verbal este închis. Doar administratorul îl poate redeschide.";

/** The meeting (church-scoped) with who signed (drawn or on paper), for the audit log. */
async function signatureView(tx: Tx, meetingId: string) {
  const m = await tx.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      titlu: true,
      tip: true,
      nr: true,
      anRegistru: true,
      data: true,
      locked: true,
      signatures: { select: { peHartie: true, person: { select: { nume: true, prenume: true } } } },
      roleSignatures: { select: { rol: true, nume: true, peHartie: true } },
    },
  });
  if (!m) throw new ActionError("Procesul-verbal nu mai există.");
  const paper = (p: boolean) => (p ? " (pe hârtie)" : "");
  return {
    meeting: m,
    view: {
      semnaturi: [
        ...m.signatures.map((s) => `${memberName(s.person)}${paper(s.peHartie)}`).sort(compareRo),
        ...m.roleSignatures.map((s) => `${placeLabel({ rol: s.rol, name: s.nume })}${paper(s.peHartie)}`).sort(compareRo),
      ],
      inchis: m.locked,
    },
    label: `${m.nr != null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : ""}${m.titlu || m.tip} (${m.data.toISOString().slice(0, 10)})`,
  };
}

/** One place to sign: a person present (`p:<id>`) or a bottom place (`r:SECRETAR` / `r:PASTOR`). */
type Place = { personId: string } | { rol: MinutesRole };
function parsePlace(place: string): Place {
  if (place === "r:SECRETAR" || place === "r:PASTOR") return { rol: place.slice(2) as MinutesRole };
  if (place.startsWith("p:") && idSchema.safeParse(place.slice(2)).success) return { personId: place.slice(2) };
  throw new ActionError("Loc de semnătură necunoscut.");
}

/** A paper mark: no image, when and by whom it was marked. */
const paperMark = (userId: string) => ({ imagePng: null, peHartie: true, signedAt: new Date(), signedByUserId: userId });

/** The bottom place of `rol` when Setări names someone for it, else refused. */
function rolePlace(church: { secretar: string; pastor: string }, rol: MinutesRole) {
  const r = roleSigners(church).find((x) => x.rol === rol);
  if (!r) throw new ActionError(`Completați numele (${MINUTES_ROLE_LABEL[rol]}) în Setări → Organizația.`);
  return r;
}

/**
 * The places of a meeting (MINUTES-SIGNATURES): those present who sign in the table (`tableSigners`:
 * not the Secretar and the Pastor of „Întocmit”) and the bottom places named in Setări, each with
 * whether it is signed (a paper mark counts). The meeting was found through the church-scoped client;
 * its child rows are reached through it.
 */
async function places(tx: Tx, meetingId: string, church: { secretar: string; pastor: string }) {
  const [present, signed, roles] = await Promise.all([
    tx.meetingAttendee.findMany({ where: { meetingId, status: "PRESENT" }, select: { person: { select: { id: true, nume: true, prenume: true, sortKey: true } } } }),
    tx.meetingSignature.findMany({ where: { meetingId }, select: { personId: true } }),
    tx.meetingRoleSignature.findMany({ where: { meetingId }, select: { rol: true } }),
  ]);
  const done = new Set(signed.map((s) => s.personId));
  const doneRoles = new Set(roles.map((r) => r.rol));
  const people = tableSigners(
    present.map((p) => p.person).sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    church,
  );
  return {
    people: people.filter((p) => !done.has(p.id)),
    roles: roleSigners(church).filter((r) => !doneRoles.has(r.rol)),
  };
}

async function audit(tx: Tx, ctx: Ctx, meetingId: string, before: Awaited<ReturnType<typeof signatureView>>, extra?: Record<string, string | number>) {
  const after = await signatureView(tx, meetingId);
  await writeAudit(tx, ctx.user, {
    entity: "MEETING",
    entityId: meetingId,
    entityLabel: before.label,
    action: "UPDATE",
    fields: SIGNATURE_FIELDS,
    before: before.view,
    after: after.view,
    ...(extra ? { extra } : {}),
  });
}

/** Saves the signature of a person present at the meeting (replacing an earlier one). */
export async function signMeetingAction(meetingId: string, personId: string, image: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    parseOrThrow(idSchema, personId);
    let png: Buffer;
    try {
      png = await normalizeSignature(image);
    } catch (e) {
      if (e instanceof SignatureImageError) throw new ActionError(e.message);
      throw e;
    }
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      // The meeting is church-scoped above; the attendee row ties the person to it.
      const present = await tx.meetingAttendee.findUnique({ where: { meetingId_personId: { meetingId, personId } }, select: { status: true } });
      if (present?.status !== "PRESENT") throw new ActionError("Doar persoanele prezente la ședință pot semna.");
      await tx.meetingSignature.upsert({
        where: { meetingId_personId: { meetingId, personId } },
        create: { meetingId, personId, imagePng: new Uint8Array(png), signedByUserId: ctx.user.id },
        update: { imagePng: new Uint8Array(png), peHartie: false, signedAt: new Date(), signedByUserId: ctx.user.id },
      });
      const after = await signatureView(tx, meetingId);
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: after.view,
        extra: { semnatura: "adăugată" },
      });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

export async function deleteSignatureAction(meetingId: string, personId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    parseOrThrow(idSchema, personId);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      await tx.meetingSignature.deleteMany({ where: { meetingId, personId } });
      const after = await signatureView(tx, meetingId);
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: after.view,
      });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/**
 * "Închide procesul-verbal": the meeting becomes read-only. Every place (those present in the table,
 * the Secretar and the Pastor at the bottom) must be signed, in the app or on paper; with places
 * missing it is refused („Lipsesc: …”) unless `confirmed` (the page asks first, naming them).
 */
export async function lockMeetingAction(meetingId: string, confirmed: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    parseOrThrow(booleanArg, confirmed);
    const church = await getChurch(ctx);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) return;
      const open = await places(tx, meetingId, church);
      const missing = [...open.people.map(memberName), ...open.roles.map(placeLabel)];
      if (missing.length && !confirmed) throw new ActionError(`${missingLine(missing)} Marcați „Semnat pe hârtie” sau confirmați închiderea.`);
      await tx.meeting.update({ where: { id: meetingId }, data: { locked: true, lockedAt: new Date() } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: { ...before.view, inchis: true },
        ...(missing.length ? { extra: { nesemnate: missing.length } } : {}),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** „Semnat pe hârtie” on one place (a person present, or the Secretar / Pastor at the bottom); audited. */
export async function markPaperAction(meetingId: string, place: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    const target = parsePlace(String(place));
    const church = await getChurch(ctx);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      const data = paperMark(ctx.user.id);
      let who: string;
      if ("rol" in target) {
        const r = rolePlace(church, target.rol);
        await tx.meetingRoleSignature.upsert({
          where: { meetingId_rol: { meetingId, rol: target.rol } },
          create: { meetingId, rol: target.rol, nume: r.name, ...data },
          update: { nume: r.name, ...data },
        });
        who = placeLabel(r);
      } else {
        const present = await tx.meetingAttendee.findUnique({
          where: { meetingId_personId: { meetingId, personId: target.personId } },
          select: { status: true, person: { select: { nume: true, prenume: true } } },
        });
        if (present?.status !== "PRESENT") throw new ActionError("Doar persoanele prezente la ședință pot semna.");
        await tx.meetingSignature.upsert({ where: { meetingId_personId: { meetingId, personId: target.personId } }, create: { meetingId, personId: target.personId, ...data }, update: data });
        who = memberName(present.person);
      }
      await audit(tx, ctx, meetingId, before, { semnatura: `semnat pe hârtie: ${who}` });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/** „Toți au semnat pe hârtie”: every place still unsigned is marked on paper (the page confirms first). */
export async function markAllPaperAction(meetingId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    const church = await getChurch(ctx);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      const open = await places(tx, meetingId, church);
      if (!open.people.length && !open.roles.length) throw new ActionError("Toate locurile sunt deja semnate.");
      const data = paperMark(ctx.user.id);
      if (open.people.length) await tx.meetingSignature.createMany({ data: open.people.map((p) => ({ meetingId, personId: p.id, ...data })) });
      for (const r of open.roles) await tx.meetingRoleSignature.create({ data: { meetingId, rol: r.rol, nume: r.name, ...data } });
      await audit(tx, ctx, meetingId, before, { semnatura: `toți au semnat pe hârtie (${open.people.length + open.roles.length})` });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/** The Secretar / Pastor signs at the bottom with a drawing on the pad (replacing an earlier one or a paper mark). */
export async function signRoleAction(meetingId: string, rol: string, image: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    const target = parsePlace(`r:${String(rol)}`);
    if (!("rol" in target)) throw new ActionError("Loc de semnătură necunoscut.");
    const r = rolePlace(await getChurch(ctx), target.rol);
    let png: Buffer;
    try {
      png = await normalizeSignature(image);
    } catch (e) {
      if (e instanceof SignatureImageError) throw new ActionError(e.message);
      throw e;
    }
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      const data = { nume: r.name, imagePng: new Uint8Array(png), peHartie: false, signedAt: new Date(), signedByUserId: ctx.user.id };
      await tx.meetingRoleSignature.upsert({ where: { meetingId_rol: { meetingId, rol: target.rol } }, create: { meetingId, rol: target.rol, ...data }, update: data });
      await audit(tx, ctx, meetingId, before, { semnatura: `adăugată: ${placeLabel(r)}` });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/** Removes the Secretar / Pastor signature (drawn or on paper) while the minutes are open. */
export async function deleteRoleSignatureAction(meetingId: string, rol: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    const target = parsePlace(`r:${String(rol)}`);
    if (!("rol" in target)) throw new ActionError("Loc de semnătură necunoscut.");
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      await tx.meetingRoleSignature.deleteMany({ where: { meetingId, rol: target.rol } });
      await audit(tx, ctx, meetingId, before);
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/** Reopens a closed meeting (administrator only). */
export async function unlockMeetingAction(meetingId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, meetingId);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (!before.meeting.locked) return;
      await tx.meeting.update({ where: { id: meetingId }, data: { locked: false, lockedAt: null } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: { ...before.view, inchis: false },
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
