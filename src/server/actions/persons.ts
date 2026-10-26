"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "@/lib/dates";
import type { FormState, PersonFormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { personDerived } from "@/lib/person-derived";
import { contactRestricted } from "@/lib/contact-access";
import { applyExitRule, PERSON_FIELDS, personSchema, type PersonInput } from "@/lib/schemas/person";
import { APPLICATION_FIELDS } from "@/lib/schemas/application";
import { personRolesSchema } from "@/lib/schemas/roles";
import { idSchema } from "@/lib/validation";
import { canBeHead, NEW_FAMILY, defaultFamilyName } from "@/lib/families";
import { todayIso } from "@/lib/dates";
import { writeAudit } from "../audit";
import { anonymizePerson } from "../anonymize";
import { createFamilyFor, markEdited, settleFamily } from "../families";
import { syncRoleGroups } from "../group-sync";
import { assertPersonRoles, personRolesAudit, writePersonRoles } from "../person-roles";
import { reconcileNameLinks } from "../kinship";
import { findDuplicatePerson } from "../queries/applications";
import { getChurch } from "../queries/church";
import { parseListSpec, personNeighbors } from "../queries/persons";
import { withDin } from "@/lib/person-nav";
import { actionCtx, ActionError, type Ctx } from "../session";
import { hasActivePastor } from "../pastor-approval";
import { proposeApplication, proposeForPastor, settleProposal, withdrawProposals } from "../pastor-proposals";
import { formEntries, proposalKind } from "@/lib/person-proposal";
import { PERSON_PROPOSAL_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/** Fields tracked by the audit log: the person's columns plus the family and the roles held (as names). */
const PERSON_AUDIT_FIELDS = [...PERSON_FIELDS, "familie", "functii"] as const;

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** The person's family and roles as names, for the audit log. */
async function auditExtras(tx: Tx, personId: string) {
  const p = await tx.person.findUnique({ where: { id: personId }, select: { family: { select: { nume: true } } } });
  return { familie: p?.family?.nume ?? "", functii: await personRolesAudit(tx, personId) };
}

function toPersonData(person: PersonInput) {
  // The family is written separately (an id, or a new family created after the person).
  const input: Omit<PersonInput, "familyId"> & { familyId?: string } = { ...person };
  delete input.familyId;
  return {
    ...input,
    dataNasterii: toDbDate(input.dataNasterii),
    dataMembru: toDbDate(input.dataMembru),
    dataBotez: toDbDate(input.dataBotez),
    dataBinecuvantare: toDbDate(input.dataBinecuvantare),
    dataIesire: toDbDate(input.dataIesire),
    dataCerereRetragere: toDbDate(input.dataCerereRetragere),
    dataCasatoriei: toDbDate(input.dataCasatoriei),
    plecatDin: toDbDate(input.plecatDin),
    ...personDerived(input),
  } satisfies Prisma.PersonUpdateInput;
}

/**
 * Adăugarea (id = null) sau modificarea unei persoane.
 * With a hidden `cerere` field (accepting a membership application), the new person and the
 * ACCEPTED application are written in one transaction; a person with the same name and birth date
 * stops the save with a warning unless `fortat=1` ("Creează oricum").
 *
 * Statut art. 23 alin. 3, while the church has a pastor user (`hasActivePastor`): a non-pastor's
 * acceptance of an application is stored on it as a proposal (PROPUSA, "Propune acceptarea"), and
 * a save making an entry Reabilitare spirituală or an exit Excludere waits as a `PersonProposal`.
 * The pastor approves by replaying the stored form here: `cerere` / `propunere` (pastors only).
 */
export async function savePersonAction(id: string | null, _prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  let savedId: string | undefined;
  let proposedTo: string | undefined;
  let duplicate: PersonFormState["duplicate"];
  const applicationId = id === null ? String(formData.get("cerere") ?? "") : "";
  const proposalId = String(formData.get("propunere") ?? "");
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx();
    const isPastor = permissions.pastor(ctx.user);
    // A pastor decides applications and proposals whatever the role; anything else needs `write`.
    if (!permissions.write(ctx.user) && !(isPastor && (applicationId || proposalId))) throw new ActionError("Nu aveți drepturi pentru această operațiune.");
    if (id !== null) parseOrThrow(idSchema, id);
    if (applicationId) parseOrThrow(idSchema, applicationId);
    if (proposalId) {
      parseOrThrow(idSchema, proposalId);
      if (!isPastor) throw new ActionError("Doar pastorul confirmă propunerea.");
      const pr = await ctx.db.personProposal.findUnique({ where: { id: proposalId }, select: { status: true, personId: true } });
      if (!pr || pr.status !== "PROPUSA" || pr.personId !== id) throw new ActionError("Propunerea a fost deja procesată.");
    }
    const input = applyExitRule(parseOrThrow(personSchema, Object.fromEntries(formData)));
    const data = toPersonData(input);
    const roles = parseOrThrow(personRolesSchema, formData.get("functii"));
    await assertPersonRoles(ctx.db, id, roles);
    // The minutes of an entry or an exclusion must be this church's (the scoped client finds only those).
    for (const [field, meetingId] of [["intrareMeetingId", input.intrareMeetingId], ["iesireMeetingId", input.iesireMeetingId]] as const) {
      if (meetingId && !(await ctx.db.meeting.findUnique({ where: { id: meetingId }, select: { id: true } }))) {
        throw new ValidationError({ [field]: "Procesul-verbal ales nu mai există." });
      }
    }
    const familyChoice = input.familyId;
    if (familyChoice && familyChoice !== NEW_FAMILY && !(await ctx.db.family.findUnique({ where: { id: familyChoice }, select: { id: true } }))) {
      throw new ValidationError({ familyId: "Familia aleasă nu mai există." });
    }
    if (familyChoice === NEW_FAMILY && !canBeHead(input, todayIso())) {
      throw new ValidationError({ familyId: "Un copil sau o persoană sub 18 ani nu poate fi cap de familie. Alegeți familia părinților." });
    }

    if (applicationId) {
      const app = await ctx.db.application.findUnique({ where: { id: applicationId }, select: { status: true } });
      if (!app) throw new ActionError("Cererea nu mai există.");
      if (app.status !== "PENDING" && app.status !== "PROPUSA") throw new ActionError("Cererea a fost deja procesată.");
      if (formData.get("fortat") !== "1") {
        const dup = await findDuplicatePerson(ctx.db, { nume: input.nume, prenume: input.prenume, dataNasterii: data.dataNasterii });
        if (dup) {
          duplicate = { id: dup.id, name: memberName(dup) };
          return { message: "Există deja în registru o persoană cu același nume și aceeași dată de naștere." };
        }
      }
    }

    // Statut art. 23 alin. 3: the pastor has the final word (only while the church has one in the app).
    if (!isPastor && (await hasActivePastor(ctx.user.churchId))) {
      const entries = formEntries(formData);
      if (applicationId) {
        await proposeApplication(ctx, applicationId, entries);
        proposedTo = `/cereri/${applicationId}?salvat=1&mesaj=${encodeURIComponent("Propunerea a fost trimisă pastorului.")}`;
        return;
      }
      const current = id
        ? await ctx.db.person.findUnique({ where: { id }, select: { modIntrare: true, dataMembru: true, modIesire: true, dataIesire: true, statut: true, telefon: true, email: true, adresa: true, codPostal: true, localitate: true } })
        : null;
      if (id && !current) throw new ActionError("Persoana nu mai există în registru.");
      // Contact data the proposer could not see stay as stored when the pastor replays the form.
      if (current && contactRestricted(current, ctx.user.role)) Object.assign(entries, { telefon: current.telefon, email: current.email, adresa: current.adresa, codPostal: current.codPostal, localitate: current.localitate });
      const kind = proposalKind(
        current && { ...current, dataMembru: fromDbDate(current.dataMembru), dataIesire: fromDbDate(current.dataIesire) },
        { modIntrare: input.modIntrare || null, dataMembru: input.dataMembru || null, modIesire: input.modIesire || null, dataIesire: input.dataIesire || null },
      );
      if (kind) {
        await proposeForPastor(ctx, { kind, personId: id, nume: memberName(input), entries });
        const mesaj = encodeURIComponent(`${PERSON_PROPOSAL_LABEL[kind]}: modificarea așteaptă confirmarea pastorului.`);
        proposedTo = id ? `/persoane/${id}?salvat=1&mesaj=${mesaj}` : `/cereri?stare=propuse&salvat=1&mesaj=${mesaj}`;
        return;
      }
      // A plain save while a proposal for this person waits: the proposal is withdrawn (the form shown came from it).
      if (id) await withdrawProposals(ctx, id);
    }

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.person.findUnique({ where: { id }, include: { headOf: { select: { id: true, nume: true } } } });
        if (!before) throw new ActionError("Persoana nu mai există în registru.");
        const extrasBefore = await auditExtras(tx, id);
        // A non-administrator never sees the contact data of a person who left: keep them as stored.
        if (contactRestricted(before, ctx.user.role)) Object.assign(data, { telefon: before.telefon, email: before.email, adresa: before.adresa, codPostal: before.codPostal, localitate: before.localitate }, personDerived({ ...input, telefon: before.telefon, email: before.email }));
        const target = familyChoice === NEW_FAMILY ? NEW_FAMILY : familyChoice || null;
        // The head of a family with other members changes family only after a new head is chosen.
        if (before.headOf && target !== before.headOf.id) {
          const others = await tx.person.count({ where: { familyId: before.headOf.id, id: { not: id } } });
          if (others) {
            throw new ValidationError({
              familyId: `Este capul familiei „${before.headOf.nume}”. Alegeți alt cap din pagina familiei înainte de a o muta.`,
            });
          }
        }
        const after = await tx.person.update({ where: { id }, data: { ...data, familyId: target === NEW_FAMILY ? null : target } });
        // The old family first: a lone head leaves it (and it is deleted) before heading a new one.
        if (before.familyId && before.familyId !== target) await settleFamily(tx, ctx.user, before.familyId);
        if (target === NEW_FAMILY) await createFamilyFor(tx, ctx.user, after);
        if (target && target !== NEW_FAMILY && target !== before.familyId) {
          await markEdited(tx, target);
          await settleFamily(tx, ctx.user, target);
        }
        // Placed in a family: the old family text is no longer shown.
        if (target && before.familieVeche) await tx.person.update({ where: { id }, data: { familieVeche: "" } });
        // A family still named after its head follows a rename of the head.
        if (before.headOf && target === before.headOf.id && before.headOf.nume === defaultFamilyName(before)) {
          await tx.family.update({ where: { id: target }, data: { nume: defaultFamilyName(after) } });
        }
        // Groups linked to a role held before or after follow (also when the person left the register).
        await syncRoleGroups(tx, ctx.user, { roleIds: await writePersonRoles(tx, id, roles) });
        // KINSHIP-STATUTE-PARENTS: a link confirmed from the parents' names goes when the file no longer carries that name.
        const nameLinks = await reconcileNameLinks(tx as never, id);
        await writeAudit(tx, ctx.user, {
          entity: "PERSON",
          entityId: id,
          entityLabel: memberName(after),
          action: "UPDATE",
          fields: PERSON_AUDIT_FIELDS,
          before: { ...before, ...extrasBefore },
          after: { ...after, ...(await auditExtras(tx, id)) },
          ...(proposalId || nameLinks
            ? { extra: { ...(proposalId ? { sursa: "confirmată de pastor" } : {}), ...(nameLinks ? { rudenie: `${nameLinks} legături după numele părinților scoase (numele s-a schimbat)` } : {}) } }
            : {}),
        });
        if (proposalId) await settleProposal(tx, ctx, proposalId, id);
        return id;
      }
      const joining = familyChoice && familyChoice !== NEW_FAMILY ? familyChoice : null;
      const created = await tx.person.create({ data: { ...data, familyId: joining, churchId: ctx.user.churchId } });
      if (familyChoice === NEW_FAMILY) await createFamilyFor(tx, ctx.user, created);
      if (joining) {
        await markEdited(tx, joining);
        await settleFamily(tx, ctx.user, joining);
      }
      await syncRoleGroups(tx, ctx.user, { roleIds: await writePersonRoles(tx, created.id, roles) });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: created.id,
        entityLabel: memberName(created),
        action: "CREATE",
        fields: PERSON_AUDIT_FIELDS,
        after: { ...created, ...(await auditExtras(tx, created.id)) },
        ...(applicationId ? { extra: { sursa: "cerere de membru" } } : proposalId ? { extra: { sursa: "confirmată de pastor" } } : {}),
      });
      if (proposalId) await settleProposal(tx, ctx, proposalId, created.id);
      if (applicationId) {
        const accepted = await tx.application.updateMany({
          where: { id: applicationId, status: { in: ["PENDING", "PROPUSA"] } },
          data: { status: "ACCEPTED", personId: created.id, decidedAt: new Date(), decidedById: ctx.user.id },
        });
        if (accepted.count !== 1) throw new ActionError("Cererea a fost deja procesată.");
        const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
        await writeAudit(tx, ctx.user, {
          entity: "APPLICATION",
          entityId: applicationId,
          entityLabel: memberName(app),
          action: "UPDATE",
          fields: [...APPLICATION_FIELDS, "persoana"],
          before: { stare: app.propusLa ? "PROPUSA" : "PENDING" },
          after: { stare: "ACCEPTED", persoana: memberName(created) },
        });
      }
      return created.id;
    });
  });
  if (proposedTo && state.ok !== false) {
    revalidatePath("/", "layout");
    redirect(proposedTo);
  }
  if (!savedId) return duplicate ? { ...state, ok: false, duplicate } : state;
  revalidatePath("/", "layout");
  const din = typeof formData.get("din") === "string" ? String(formData.get("din")) : undefined;
  // "Salvează și următorul": the next person of the list the form was opened from, in edit mode.
  if (id && formData.get("dupa") === "urmatorul") {
    const ctx = await actionCtx("write");
    const church = await getChurch(ctx);
    const { next } = await personNeighbors(ctx, id, parseListSpec(din), church.nomen.rudenie);
    if (next) redirect(withDin(`/persoane/${next}/editare`, din, { salvat: "1" }));
  }
  redirect(withDin(`/persoane/${savedId}`, din, { salvat: "1" }));
}

/** Permanent deletion (Administrator only; the page asks twice). */
export async function deletePersonAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.person.findUnique({ where: { id } });
      if (!before) throw new ActionError("Persoana nu mai există în registru.");
      const extras = await auditExtras(tx, id);
      await tx.person.delete({ where: { id } });
      // The family loses a member: it gets a new head, or is deleted when empty.
      if (before.familyId) await settleFamily(tx, ctx.user, before.familyId, before);
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: id,
        entityLabel: memberName(before),
        action: "DELETE",
        fields: PERSON_AUDIT_FIELDS,
        before: { ...before, ...extras },
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/persoane?sters=1");
}

/** Anonymisation (Administrator only), see anonymizePerson (src/server/anonymize.ts). */
export async function anonymizePersonAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    if (!(await anonymizePerson(ctx, id))) throw new ActionError("Persoana nu mai există în registru.");
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect(`/persoane/${id}?salvat=1&mesaj=${encodeURIComponent("Persoana a fost anonimizată.")}`);
}
