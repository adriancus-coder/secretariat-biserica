"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultFamilyName, NEW_FAMILY } from "@/lib/families";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { familySchema, moveTargetSchema } from "@/lib/schemas/family";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fromDbDate, todayIso } from "@/lib/dates";
import { canBeHead, pickHead } from "@/lib/families";
import { addMembersSchema, joinFamilySchema } from "@/lib/schemas/family";
import { assertCanBeHead, createFamilyFor, dissolveFamily, FAMILY_FIELDS, familyView, markEdited, settleFamily } from "../families";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/** Renames a family, edits its address and notes, and changes its head (one of its members). */
export async function saveFamilyAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let saved = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    const input = parseOrThrow(familySchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      const before = await familyView(tx, id);
      if (!before) throw new ActionError("Familia nu mai există.");
      if (input.headId) {
        const head = await tx.person.findUnique({ where: { id: input.headId }, select: { familyId: true } });
        if (head?.familyId !== id) throw new ValidationError({ headId: "Capul familiei trebuie să fie unul dintre membrii ei." });
        if (input.headId !== before.headId) await assertCanBeHead(tx, input.headId);
      } else {
        const members = await tx.person.findMany({ where: { familyId: id }, select: { statut: true, dataNasterii: true } });
        if (members.some((m) => canBeHead({ statut: m.statut, dataNasterii: fromDbDate(m.dataNasterii) }, todayIso()))) {
          throw new ValidationError({ headId: "Alegeți capul familiei." });
        }
      }
      await tx.family.update({ where: { id }, data: { ...input, autoCreated: false } });
      await writeAudit(tx, ctx.user, {
        entity: "FAMILY",
        entityId: id,
        entityLabel: input.nume,
        action: "UPDATE",
        fields: FAMILY_FIELDS,
        before,
        after: await familyView(tx, id),
      });
    });
    saved = true;
  });
  if (!saved) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${id}?salvat=1`);
}

/**
 * "Mută persoana în altă familie": into an existing family or a new one headed by the person.
 * The head of a family with other members moves only after another head is chosen.
 */
export async function moveToFamilyAction(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let destination: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    const { tinta } = parseOrThrow(moveTargetSchema, Object.fromEntries(formData));
    destination = await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId }, include: { headOf: { select: { id: true, nume: true } }, family: { select: { nume: true } } } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      if (tinta === person.familyId) return tinta;
      if (tinta !== NEW_FAMILY && !(await tx.family.findUnique({ where: { id: tinta }, select: { id: true } }))) {
        throw new ValidationError({ tinta: "Familia aleasă nu mai există." });
      }
      if (tinta === NEW_FAMILY) await assertCanBeHead(tx, personId, "tinta");
      if (person.headOf && (await tx.person.count({ where: { familyId: person.headOf.id, id: { not: personId } } }))) {
        throw new ActionError(`${memberName(person)} este capul familiei. Alegeți mai întâi alt cap al familiei, apoi mutați persoana.`);
      }
      const from = person.familyId;
      await tx.person.update({ where: { id: personId }, data: { familyId: tinta === NEW_FAMILY ? null : tinta } });
      if (from) await settleFamily(tx, ctx.user, from);
      const to = tinta === NEW_FAMILY ? await createFamilyFor(tx, ctx.user, person) : tinta;
      if (tinta !== NEW_FAMILY) {
        await markEdited(tx, to);
        await settleFamily(tx, ctx.user, to);
      }
      const toName = (await tx.family.findUnique({ where: { id: to }, select: { nume: true } }))?.nume ?? "";
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: personId,
        entityLabel: memberName(person),
        action: "UPDATE",
        fields: ["familie"],
        before: { familie: person.family?.nume ?? "" },
        after: { familie: toName },
      });
      return to;
    });
  });
  if (!destination) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${destination}?salvat=1&mesaj=${encodeURIComponent("Persoana a fost mutată.")}`);
}

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** Puts persons without a family into a family (with their kinship); audited on the family and on each person. */
async function joinFamily(tx: Tx, ctx: Ctx, familyId: string, list: { id: string; rudenie: string }[]) {
  const before = await familyView(tx, familyId);
  if (!before) throw new ActionError("Familia nu mai există.");
  const persons = await tx.person.findMany({ where: { id: { in: list.map((m) => m.id) } }, select: { id: true, nume: true, prenume: true, familyId: true, rudenie: true } });
  if (persons.length !== list.length) throw new ActionError("Una dintre persoanele alese nu mai există.");
  const taken = persons.find((p) => p.familyId);
  if (taken) throw new ActionError(`${memberName(taken)} face deja parte dintr-o familie.`);
  for (const m of list) {
    const p = persons.find((x) => x.id === m.id)!;
    await tx.person.update({ where: { id: m.id }, data: { familyId, familieVeche: "", ...(m.rudenie ? { rudenie: m.rudenie } : {}) } });
    await writeAudit(tx, ctx.user, {
      entity: "PERSON",
      entityId: m.id,
      entityLabel: memberName(p),
      action: "UPDATE",
      fields: ["familie", "rudenie"],
      before: { familie: "", rudenie: p.rudenie },
      after: { familie: before.nume, rudenie: m.rudenie || p.rudenie },
    });
  }
  await markEdited(tx, familyId);
  // A family without a head (only children so far) gets one if an adult joined.
  await settleFamily(tx, ctx.user, familyId);
  await writeAudit(tx, ctx.user, {
    entity: "FAMILY",
    entityId: familyId,
    entityLabel: before.nume,
    action: "UPDATE",
    fields: FAMILY_FIELDS,
    before,
    after: await familyView(tx, familyId),
  });
}

/** "Adaugă membri" on the family page: persons without a family, each with a kinship. */
export async function addFamilyMembersAction(familyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let added = 0;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, familyId);
    const { membri } = parseOrThrow(addMembersSchema, Object.fromEntries(formData));
    await ctx.db.$transaction((tx) => joinFamily(tx, ctx, familyId, membri));
    added = membri.length;
  });
  if (!added) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${familyId}?salvat=1&mesaj=${encodeURIComponent(added === 1 ? "O persoană a fost adăugată." : `${added} persoane au fost adăugate.`)}`);
}

/** "Adaugă la familia…" on the person page (person without a family). */
export async function joinFamilyAction(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let familyId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    const input = parseOrThrow(joinFamilySchema, Object.fromEntries(formData));
    await ctx.db.$transaction((tx) => joinFamily(tx, ctx, input.familyId, [{ id: personId, rudenie: input.rudenie }]));
    familyId = input.familyId;
  });
  if (!familyId) return state;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}?salvat=1&mesaj=${encodeURIComponent("Persoana a fost adăugată în familie.")}`);
}

/** "Fă cap de familie nouă" on the person page (person without a family, not a child). */
export async function headNewFamilyAction(personId: string): Promise<FormState> {
  let familyId: string | undefined;
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    familyId = await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      if (person.familyId) throw new ActionError("Persoana face deja parte dintr-o familie.");
      await assertCanBeHead(tx, personId).catch((e) => {
        throw e instanceof ValidationError ? new ActionError(Object.values(e.errors)[0]) : e;
      });
      const id = await createFamilyFor(tx, ctx.user, person);
      await tx.person.update({ where: { id: personId }, data: { familieVeche: "" } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: personId,
        entityLabel: memberName(person),
        action: "UPDATE",
        fields: ["familie"],
        before: { familie: "" },
        after: { familie: (await tx.family.findUnique({ where: { id }, select: { nume: true } }))?.nume ?? "" },
      });
      return id;
    });
  });
  if (!familyId) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${familyId}?salvat=1&mesaj=${encodeURIComponent("Familia a fost creată. Adăugați membrii.")}`);
}

/** "Dizolvă familia": the members stay in the register without a family. */
export async function dissolveFamilyAction(familyId: string): Promise<FormState> {
  let done = false;
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, familyId);
    await ctx.db.$transaction(async (tx) => {
      if (!(await tx.family.findUnique({ where: { id: familyId }, select: { id: true } }))) throw new ActionError("Familia nu mai există.");
      await dissolveFamily(tx, ctx.user, familyId);
    });
    done = true;
  });
  if (!done) return state;
  revalidatePath("/", "layout");
  redirect(`/familii?sters=1&mesaj=${encodeURIComponent("Familia a fost dizolvată; membrii au rămas în registru fără familie.")}`);
}

/** Setări → Date, "Dizolvă familiile create automat": only families never edited by hand. Admin only. */
export async function dissolveAutoFamiliesAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const n = await ctx.db.$transaction(
      async (tx) => {
        const auto = await tx.family.findMany({ where: { autoCreated: true }, select: { id: true } });
        for (const f of auto) await dissolveFamily(tx, ctx.user, f.id, "dizolvată ca familie creată automat");
        return auto.length;
      },
      { timeout: 60_000 },
    );
    return { ok: true, message: n === 0 ? "Nu există familii create automat." : n === 1 ? "O familie a fost dizolvată." : `${n} familii au fost dizolvate.` };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export interface RecalcHeadsState extends FormState {
  /** "Fam. Ion Pop: Pop Ana → Pop Ion" */
  changes?: string[];
}

/** Setări → Date, "Recalculează capii de familie": applies the head rule to families created automatically. Admin only. */
export async function recalcHeadsAction(): Promise<RecalcHeadsState> {
  let changes: string[] = [];
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    changes = await ctx.db.$transaction(
      async (tx) => {
        const today = todayIso();
        const out: string[] = [];
        const families = await tx.family.findMany({
          where: { autoCreated: true },
          orderBy: { nume: "asc" },
          select: {
            id: true,
            nume: true,
            headId: true,
            members: { select: { id: true, nume: true, prenume: true, statut: true, rudenie: true, gen: true, dataNasterii: true, createdAt: true } },
          },
        });
        for (const f of families) {
          const head = pickHead(
            f.members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), createdAt: m.createdAt.toISOString() })),
            today,
          );
          if ((head?.id ?? null) === f.headId) continue;
          const old = f.members.find((m) => m.id === f.headId);
          const before = await familyView(tx, f.id);
          // A family still named after its old head follows the new one.
          const nume = old && f.nume === defaultFamilyName(old) && head ? defaultFamilyName(head) : f.nume;
          await tx.family.update({ where: { id: f.id }, data: { headId: head?.id ?? null, nume } });
          await writeAudit(tx, ctx.user, {
            entity: "FAMILY",
            entityId: f.id,
            entityLabel: nume,
            action: "UPDATE",
            fields: FAMILY_FIELDS,
            before,
            after: await familyView(tx, f.id),
            extra: { observatie: "capul familiei a fost recalculat" },
          });
          out.push(`${f.nume}: ${old ? memberName(old) : "fără cap"} → ${head ? memberName(head) : "fără cap (doar copii)"}`);
        }
        return out;
      },
      { timeout: 60_000 },
    );
    return {
      ok: true,
      message: changes.length ? `Capul familiei s-a schimbat la ${changes.length === 1 ? "o familie" : `${changes.length} familii`}.` : "Toți capii de familie respectă deja regula.",
    };
  });
  if (state.ok) revalidatePath("/", "layout");
  return { ...state, changes };
}
