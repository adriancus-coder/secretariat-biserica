import "server-only";
import {
  childChanges,
  decisionStatus,
  selfChanges,
} from "@/lib/data-update-review";
import { toDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { BELIEVER_RELATIONS } from "@/lib/labels";
import { personDerived } from "@/lib/person-derived";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import type {
  ChildData,
  DataUpdateProposal,
  SelfData,
} from "@/lib/schemas/data-update";
import { idSchema } from "@/lib/validation";
import { parseOrThrow, ValidationError } from "./actions/run";
import { writeAudit } from "./audit";
import {
  childSnapshot,
  selfSnapshot,
  writeOnlineConsents,
} from "./data-update";
import { createFamilyFor, markEdited, settleFamily } from "./families";
import { ActionError, type Ctx } from "./session";

const NEW_PERSON = "nou";

/** The person columns of the proposal's own fields (only those chosen). */
function selfData(
  current: SelfData | null,
  proposed: SelfData,
  fields: Set<string>,
) {
  const pick = <K extends keyof SelfData>(k: K): SelfData[K] =>
    fields.has(k) || !current ? proposed[k] : current[k];
  const dataBotez = pick("dataBotez");
  const botezAn = dataBotez ? Number(dataBotez.slice(0, 4)) : pick("botezAn");
  const v = {
    nume: pick("nume"),
    prenume: pick("prenume"),
    gen: pick("gen"),
    telefon: pick("telefon"),
    email: pick("email"),
    adresa: pick("adresa"),
    botezBiserica: pick("botezBiserica"),
    botezLocalitate: pick("botezLocalitate"),
    botezOficiant: pick("botezOficiant"),
    numeTata: pick("numeTata"),
    numeMama: pick("numeMama"),
  };
  return {
    ...v,
    dataNasterii: toDbDate(pick("dataNasterii")),
    dataCasatoriei: toDbDate(pick("dataCasatoriei")),
    dataBotez: toDbDate(dataBotez),
    botezAn,
    ...personDerived(v),
  };
}

function childData(
  current: Omit<ChildData, "consents"> | null,
  proposed: ChildData,
  fields: Set<string>,
) {
  const pick = <
    K extends "nume" | "prenume" | "gen" | "dataNasterii" | "dataBinecuvantare",
  >(
    k: K,
  ) => (fields.has(k) || !current ? proposed[k] : current[k]);
  const v = {
    nume: pick("nume"),
    prenume: pick("prenume") ?? "",
    gen: pick("gen"),
  };
  return {
    ...v,
    dataNasterii: toDbDate(pick("dataNasterii")),
    dataBinecuvantare: toDbDate(pick("dataBinecuvantare")),
    ...personDerived({
      ...v,
      telefon: "",
      email: "",
      botezBiserica: "",
      botezOficiant: "",
    }),
  };
}

/**
 * The secretary's decision on a submission ("De verificat"): accept everything, the selected fields,
 * or reject with a note. One transaction: the person's fields (with personDerived), the children's,
 * new children created in the adult's family (statut by Statut art. 28), the family settled, the
 * consents of the general link and of new children, and the audit ("Actualizare date <campanie>").
 */
export interface Decision {
  /** "toate" | "selectate" | "respinge" */
  decizie: string;
  nota: string;
  /** Checked boxes: "s:<field>", "c:<childId>:<field>", "n:<index>". */
  chosen: Set<string>;
  /** General link: a person id, or "nou" for a new person. */
  persoana?: string | null;
}

export async function applyDecision(
  ctx: Ctx,
  id: string,
  d: Decision,
): Promise<void> {
  const decision = d.decizie;
  const note = d.nota;
  await ctx.db.$transaction(async (tx) => {
    const s = await tx.dataUpdateSubmission.findUnique({
      where: { id },
      include: {
        campaign: { select: { nume: true, privacyTextVersion: true } },
      },
    });
    if (!s || s.status !== "PENDING")
      throw new ActionError("Răspunsul a fost deja verificat.");
    const sursa = `Actualizare date ${s.campaign.nume}`;
    const decided = { decidedAt: new Date(), decidedById: ctx.user.id, note };
    if (decision === "respinge") {
      await tx.dataUpdateSubmission.update({
        where: { id },
        data: { status: "REJECTED", ...decided },
      });
      await writeAudit(tx, ctx.user, {
        entity: "CAMPAIGN",
        entityId: s.campaignId,
        entityLabel: s.campaign.nume,
        action: "UPDATE",
        fields: [],
        extra: { observatie: "răspuns respins" },
      });
      return;
    }
    if (decision !== "toate" && decision !== "selectate")
      throw new ActionError("Alegeți o decizie.");
    const all = decision === "toate";
    const chosen = d.chosen;
    const take = (key: string) => all || chosen.has(key);
    const p = s.proposed as unknown as DataUpdateProposal;

    // The person: the link's adult, the general link's match, a person chosen, or a new one.
    let personId = s.personId;
    if (s.via === "GENERAL") {
      const target = String(d.persoana ?? personId ?? "");
      if (target === NEW_PERSON) personId = null;
      else {
        parseOrThrow(idSchema, target);
        if (
          !(await tx.person.findUnique({
            where: { id: target },
            select: { id: true },
          }))
        )
          throw new ValidationError({
            persoana: "Persoana aleasă nu mai există.",
          });
        personId = target;
      }
    }
    let total = 0;
    let accepted = 0;
    let adult: Awaited<ReturnType<typeof tx.person.findUniqueOrThrow>>;
    if (personId) {
      const before = await tx.person.findUniqueOrThrow({
        where: { id: personId },
      });
      const changes = selfChanges(selfSnapshot(before), p.self);
      const fields = new Set(
        changes.filter((c) => take(`s:${c.field}`)).map((c) => c.field),
      );
      total += changes.length;
      accepted += fields.size;
      adult = before;
      if (fields.size) {
        adult = await tx.person.update({
          where: { id: personId },
          data: selfData(selfSnapshot(before), p.self, fields),
        });
        await writeAudit(tx, ctx.user, {
          entity: "PERSON",
          entityId: personId,
          entityLabel: memberName(adult),
          action: "UPDATE",
          fields: PERSON_FIELDS,
          before,
          after: adult,
          extra: { sursa },
        });
      }
    } else {
      // "Creează persoană nouă" (general link): everything the person wrote, as a Prieten.
      adult = await tx.person.create({
        data: {
          ...selfData(null, p.self, new Set()),
          statut: "PRIETEN",
          churchId: ctx.user.churchId,
        },
      });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: adult.id,
        entityLabel: memberName(adult),
        action: "CREATE",
        fields: PERSON_FIELDS,
        after: adult,
        extra: { sursa },
      });
      personId = adult.id;
    }

    // Children of the register.
    for (const c of p.children.filter((x) => x.id)) {
      const before = await tx.person.findUnique({ where: { id: c.id! } });
      if (!before) continue;
      const changes = childChanges(childSnapshot(before), c);
      const fields = new Set(
        changes
          .filter((ch) => take(`c:${c.id}:${ch.field}`))
          .map((ch) => ch.field),
      );
      total += changes.length;
      accepted += fields.size;
      if (!fields.size) continue;
      const after = await tx.person.update({
        where: { id: c.id! },
        data: childData(childSnapshot(before), c, fields),
      });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: after.id,
        entityLabel: memberName(after),
        action: "UPDATE",
        fields: PERSON_FIELDS,
        before,
        after,
        extra: { sursa },
      });
    }

    // New children: in the adult's family (one is created around the adult when needed).
    const newChildren = p.children
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.id);
    total += newChildren.length;
    const created: { id: string; consents: ChildData["consents"] }[] = [];
    let familyId = adult.familyId;
    for (const { c, i } of newChildren) {
      if (!take(`n:${i}`)) continue;
      accepted++;
      if (!familyId) {
        await createFamilyFor(tx, ctx.user, adult);
        familyId = (
          await tx.person.findUniqueOrThrow({
            where: { id: adult.id },
            select: { familyId: true },
          })
        ).familyId;
      }
      const believers = await tx.person.count({
        where: {
          familyId,
          statut: "MEMBRU",
          dataIesire: null,
          OR: [
            { rudenie: { in: BELIEVER_RELATIONS } },
            { headOf: { isNot: null } },
          ],
        },
      });
      // Statut art. 28: an unbaptised child of a believers' family is an aparținător (kind a).
      const child = await tx.person.create({
        data: {
          ...childData(null, c, new Set()),
          churchId: ctx.user.churchId,
          familyId,
          rudenie: c.gen === "F" ? "Fiică" : c.gen === "M" ? "Fiu" : "",
          statut:
            believers || adult.statut === "MEMBRU" ? "APARTINATOR" : "PRIETEN",
        },
      });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: child.id,
        entityLabel: memberName(child),
        action: "CREATE",
        fields: PERSON_FIELDS,
        after: child,
        extra: { sursa },
      });
      created.push({ id: child.id, consents: c.consents });
    }
    if (familyId && created.length) {
      await markEdited(tx, familyId);
      await settleFamily(tx, ctx.user, familyId);
    }

    // Consents: the general link's answers, and new children's (a personal link wrote the others already).
    const base = {
      churchId: ctx.user.churchId,
      submissionId: id,
      textVersion: s.campaign.privacyTextVersion,
    };
    if (s.via === "GENERAL")
      await writeOnlineConsents(tx, {
        ...base,
        personId,
        answers: p.consents,
        nota: true,
      });
    for (const c of created)
      await writeOnlineConsents(tx, {
        ...base,
        personId: c.id,
        answers: c.consents,
        nota: false,
        givenByPersonId: personId,
      });

    await tx.dataUpdateSubmission.update({
      where: { id },
      data: { status: decisionStatus(total, accepted), personId, ...decided },
    });
    await writeAudit(tx, ctx.user, {
      entity: "CAMPAIGN",
      entityId: s.campaignId,
      entityLabel: s.campaign.nume,
      action: "UPDATE",
      fields: [],
      extra: {
        persoana: memberName(adult),
        observatie: `răspuns aprobat (${accepted} din ${total})`,
      },
    });
  });
}
