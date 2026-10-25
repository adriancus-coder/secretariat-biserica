import { importedBaptism, type BaptismFields } from "@/lib/baptism-backup";
import type { BAlias } from "@/lib/aliases-backup";
import { storedLayout } from "@/lib/page-layout";
import "server-only";
import { randomUUID } from "node:crypto";
import { normalizeDocumentNumbers, type Backup, type BDocument } from "@/domain/backup";
import type { Prisma } from "@/generated/prisma/client";
import type { BApplication } from "@/lib/application-backup";
import type { MeetingExtra } from "@/lib/meeting-backup";
import { DEFAULT_CLOSING, pointsText, splitDecisions } from "@/lib/minutes";
import { defaultFamilyName, pickHead } from "@/lib/families";
import type { BFamily, ParsedFamilies } from "@/lib/families-backup";
import type { BPersonRole, BRole, BRoleGroup, ParsedRoles } from "@/lib/roles-backup";
import { roleKey } from "@/lib/roles";
import { noteWithSlujire } from "@/lib/slujire";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { noteSearchText, personDerived } from "@/lib/person-derived";
import { writeAudit } from "./audit";
import { normalizeSignature } from "./signature-image";
import type { Ctx } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const byName = { orderBy: { createdAt: "asc" as const } };

/** Member id → baptism church / locality / officiant, for the export (see addMemberBaptism). */
export async function loadBaptism(ctx: Ctx): Promise<Map<string, BaptismFields>> {
  const rows = await ctx.db.person.findMany({ select: { id: true, botezBiserica: true, botezLocalitate: true, botezOficiant: true, botezAn: true, dataBotez: true } });
  // The year is written only for a baptism known by its year alone (the date carries it otherwise).
  return new Map(rows.map(({ id, dataBotez, botezAn, ...b }) => [id, { ...b, botezAn: dataBotez ? null : botezAn }]));
}

/** Toate datele bisericii, pentru export. */
export async function loadBackup(ctx: Ctx): Promise<Backup> {
  const [persons, meetings, events, documents, groups, notes, church] = await Promise.all([
    ctx.db.person.findMany({ orderBy: [{ sortKey: "asc" }, { id: "asc" }], include: { family: { select: { nume: true } } } }),
    ctx.db.meeting.findMany({ ...byName, include: { prezenti: { where: { status: "PRESENT" }, select: { personId: true } } } }),
    ctx.db.event.findMany({ ...byName, include: { contributii: { orderBy: { pozitie: "asc" } } } }),
    ctx.db.document.findMany({ orderBy: [{ anRegistru: "asc" }, { nr: "asc" }] }),
    ctx.db.group.findMany({ ...byName, include: { membri: { select: { personId: true } } } }),
    ctx.db.note.findMany(byName),
    ctx.db.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    members: persons.map((p) => ({
      id: p.id,
      nume: p.nume,
      prenume: p.prenume,
      statut: p.statut,
      gen: p.gen,
      // The prototype's text field carries the family's display name; `families` has the records.
      familie: p.family?.nume ?? "",
      rudenie: p.rudenie,
      dataNasterii: fromDbDate(p.dataNasterii),
      telefon: p.telefon,
      email: p.email,
      adresa: p.adresa,
      dataMembru: fromDbDate(p.dataMembru),
      modIntrare: p.modIntrare,
      bisericaProvenienta: p.bisericaProvenienta,
      dataBotez: fromDbDate(p.dataBotez),
      locBotez: p.botezLocalitate,
      dataBinecuvantare: fromDbDate(p.dataBinecuvantare),
      dataIesire: fromDbDate(p.dataIesire),
      modIesire: p.modIesire,
      bisericaDestinatie: p.bisericaDestinatie,
      slujire: p.slujire,
      note: p.note,
      createdAt: day(p.createdAt),
    })),
    meetings: meetings.map((m) => ({
      id: m.id,
      titlu: m.titlu,
      tip: m.tip,
      data: fromDbDate(m.data)!,
      ora: m.ora,
      loc: m.loc,
      presedinte: m.presedinte,
      prezenti: m.prezenti.map((p) => p.personId),
      invitati: m.invitati,
      ordine: m.ordine,
      // The prototype's free texts, for older readers: the points as "1. …" lines, the observations as discussions.
      discutii: m.observatii,
      hotarari: pointsText(m.puncte),
      createdAt: day(m.createdAt),
    })),
    events: events.map((e) => ({
      id: e.id,
      titlu: e.titlu,
      tip: e.tip,
      data: fromDbDate(e.data)!,
      ora: e.ora,
      loc: e.loc,
      invitat: e.invitat,
      responsabil: e.responsabil,
      descriere: e.descriere,
      agapa: {
        activ: e.agapaActiva,
        responsabil: e.agapaResponsabil,
        persoane: e.agapaPersoane,
        contributii: e.contributii.map((c) => ({ cine: c.cine, ce: c.ce })),
      },
      createdAt: day(e.createdAt),
    })),
    documents: documents.map((x) => ({
      id: x.id,
      tip: x.tip,
      nr: x.nr,
      data: fromDbDate(x.data)!,
      membruId: x.personId,
      persoana: x.persoana,
      catre: x.catre,
      scop: x.scop,
      titlu: x.titlu,
      text: x.text,
      an: x.anRaport,
      createdAt: day(x.createdAt),
    })),
    groups: groups.map((g) => ({
      id: g.id,
      nume: g.nume,
      responsabil: g.responsabil,
      descriere: g.descriere,
      membri: g.membri.map((m) => m.personId),
      createdAt: day(g.createdAt),
    })),
    notes: notes.map((n) => ({
      id: n.id,
      data: fromDbDate(n.data)!,
      tip: n.tip,
      persoanaId: n.personId,
      familie: n.familie,
      text: n.text,
      createdAt: day(n.createdAt),
    })),
    settings: {
      nume: church.nume,
      adresa: church.adresa,
      orgnr: church.orgNr,
      telefon: church.telefon,
      email: church.email,
      pastor: church.pastor,
      secretar: church.secretar,
      nomen: {
        tipuriSedinte: church.tipuriSedinte,
        tipuriEvenimente: church.tipuriEvenimente,
        tipuriMentiuni: church.tipuriMentiuni,
        rudenie: church.gradeRudenie,
      },
    },
  };
}

/** Membership applications, for the `applications` collection of the export. */
export async function loadApplications(ctx: Ctx): Promise<BApplication[]> {
  const rows = await ctx.db.application.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return rows.map((a) => ({
    id: a.id,
    status: a.status,
    kind: a.kind,
    nume: a.nume,
    prenume: a.prenume,
    gen: a.gen,
    dataNasterii: fromDbDate(a.dataNasterii),
    telefon: a.telefon,
    email: a.email,
    adresa: a.adresa,
    familie: a.familie,
    rudenie: a.rudenie,
    bisericaProvenienta: a.bisericaProvenienta,
    dataBotez: fromDbDate(a.dataBotez),
    botezAn: a.botezAn,
    botezBiserica: a.botezBiserica,
    botezLocalitate: a.botezLocalitate,
    botezOficiant: a.botezOficiant,
    mesaj: a.mesaj,
    consent: a.consent,
    consentStatutCult: a.consentStatutCult,
    consentStatutIntern: a.consentStatutIntern,
    consentAt: a.consentAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    membruId: a.personId,
    motiv: a.rejectReason,
  }));
}

/** Church roles and the roles held by each person, for the `roles` collection and members' `functii`. */
export async function loadRoles(ctx: Ctx): Promise<{
  groups: BRoleGroup[];
  roles: Omit<BRole, "comitet">[];
  functii: Map<string, BPersonRole[]>;
  committee: Set<string>;
}> {
  const [groups, rows, committee] = await Promise.all([
    ctx.db.roleGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { nume: "asc" }] }),
    ctx.db.churchRole.findMany({
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { nume: "asc" }],
      include: { group: { select: { nume: true } }, holders: { select: { personId: true, since: true, until: true } } },
    }),
    ctx.db.person.findMany({ where: { inComitet: true }, select: { id: true } }),
  ]);
  const functii = new Map<string, BPersonRole[]>();
  for (const r of rows) {
    for (const h of r.holders) {
      const list = functii.get(h.personId) ?? [];
      list.push({ nume: r.nume, din: fromDbDate(h.since), pana: fromDbDate(h.until) });
      functii.set(h.personId, list);
    }
  }
  return {
    groups: groups.map((g) => ({ id: g.id, nume: g.nume, ordine: g.sortOrder, activ: g.active })),
    roles: rows.map((r) => ({ id: r.id, nume: r.nume, ordine: r.sortOrder, grup: r.group.nume, activ: r.active })),
    functii,
    committee: new Set(committee.map((p) => p.id)),
  };
}

/** Meeting id → the fields beyond the prototype's format (absentees, numbering, points …), for the export. */
export async function loadMeetingExtras(ctx: Ctx): Promise<Map<string, MeetingExtra>> {
  const rows = await ctx.db.meeting.findMany({
    select: {
      id: true,
      asteptati: true,
      nr: true,
      puncte: true,
      observatii: true,
      formulaIncheiere: true,
      layout: true,
      locked: true,
      lockedAt: true,
      prezenti: { where: { status: "ABSENT" }, select: { personId: true } },
      signatures: { select: { personId: true, imagePng: true, signedAt: true } },
    },
  });
  return new Map(
    rows.map((m) => [
      m.id,
      {
        absenti: m.prezenti.map((p) => p.personId),
        asteptati: m.asteptati,
        nr: m.nr,
        puncte: m.puncte,
        observatii: m.observatii,
        formulaIncheiere: m.formulaIncheiere,
        semnaturi: m.signatures.map((s) => ({
          persoanaId: s.personId,
          imagine: Buffer.from(s.imagePng).toString("base64"),
          semnatLa: s.signedAt.toISOString(),
        })),
        inchisLa: m.locked ? (m.lockedAt ?? new Date()).toISOString() : null,
        ...(m.layout ? { asezare: storedLayout(m.layout) } : {}),
      },
    ]),
  );
}

/** Families and each person's family, for the `families` collection and members' `familyId`. */
export async function loadFamilies(ctx: Ctx): Promise<{ families: BFamily[]; familyOf: Map<string, string> }> {
  const rows = await ctx.db.family.findMany({ orderBy: [{ nume: "asc" }, { id: "asc" }], include: { members: { select: { id: true } } } });
  const familyOf = new Map<string, string>();
  for (const f of rows) for (const m of f.members) familyOf.set(m.id, f.id);
  return { families: rows.map((f) => ({ id: f.id, nume: f.nume, capId: f.headId, adresa: f.adresa, note: f.note, automata: f.autoCreated })), familyOf };
}

/** Other forms of persons' names, for the `aliases` collection. */
export async function loadAliases(ctx: Ctx): Promise<{ personId: string; alias: string }[]> {
  return ctx.db.personAlias.findMany({ orderBy: { alias: "asc" }, select: { personId: true, alias: true } });
}

export type ImportMode = "merge" | "replace";

/** Collections outside the prototype's format; null/absent = not in the file (existing data is kept). */
export interface ImportExtras {
  applications?: BApplication[] | null;
  roles?: ParsedRoles | null;
  families?: ParsedFamilies | null;
  /** Meeting id → the fields beyond the prototype's format, as in the file (see parseMeetingExtras). */
  meetings?: ReadonlyMap<string, MeetingExtra>;
  /**
   * Older files (no `families` collection): create one family per family text (true), or keep the
   * text on the person only (false, the default: "Nu crea familii din text").
   */
  textFamilies?: boolean;
  /** Member id → baptism church / locality / officiant, as in the file (see parseMemberBaptism). */
  baptism?: ReadonlyMap<string, BaptismFields>;
  /** Other forms of persons' names (see parseAliasesJson); null = not in the file. */
  aliases?: BAlias[] | null;
}

export interface ImportSummary {
  persoane: number;
  sedinte: number;
  evenimente: number;
  documente: number;
  grupuri: number;
  mentiuni: number;
  cereri: number;
  /** Families imported from the file, or created from the family text of an older file. */
  familii: number;
  /** Roles held by persons, as imported. */
  functii: number;
  setari: boolean;
  avertismente: string[];
}

const TABLES = {
  persons: "persons",
  meetings: "meetings",
  events: "events",
  documents: "documents",
  groups: "groups",
  notes: "notes",
  applications: "applications",
  families: "families",
} as const;

/**
 * Împarte id-urile din fișier în: existente în această biserică (se actualizează) și noi
 * (se creează). Un id care aparține altei biserici nu este niciodată atins: primește un id nou.
 */
async function planIds(tx: Tx, table: (typeof TABLES)[keyof typeof TABLES], ids: string[], churchId: string) {
  const map = new Map<string, string>();
  const existing = new Set<string>();
  if (!ids.length) return { map, existing };
  const rows = await tx.$queryRawUnsafe<{ id: string; churchId: string }[]>(
    `SELECT id, "churchId" FROM "${table}" WHERE id = ANY($1::text[])`,
    ids,
  );
  const owner = new Map(rows.map((r) => [r.id, r.churchId]));
  for (const id of ids) {
    const o = owner.get(id);
    if (o === undefined) map.set(id, id);
    else if (o === churchId) {
      map.set(id, id);
      existing.add(id);
    } else map.set(id, randomUUID());
  }
  return { map, existing };
}

const ts = (d: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : undefined);

async function chunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/**
 * Importă o copie de siguranță validată, într-o singură tranzacție.
 * An extra collection missing from the file (applications, roles) leaves the existing rows as they
 * are, even in replace mode.
 */
export async function importBackup(ctx: Ctx, backup: Backup, mode: ImportMode, extras: ImportExtras = {}): Promise<ImportSummary> {
  const churchId = ctx.user.churchId;
  const applications = extras.applications ?? null;
  const rolesIn = extras.roles ?? null;
  const famIn = extras.families ?? null;
  const warnings: string[] = [];
  return ctx.db.$transaction(
    async (tx) => {
      if (mode === "replace") {
        if (applications) await tx.application.deleteMany({});
        if (rolesIn?.roles) await tx.churchRole.deleteMany({});
        if (rolesIn?.groups) await tx.roleGroup.deleteMany({ where: { roles: { none: {} } } });
        await tx.family.deleteMany({});
        await tx.note.deleteMany({});
        await tx.document.deleteMany({});
        await tx.group.deleteMany({});
        await tx.event.deleteMany({});
        await tx.meeting.deleteMany({});
        await tx.person.deleteMany({});
      }

      // Persoane
      const people = await planIds(tx, TABLES.persons, backup.members.map((m) => m.id), churchId);
      const pid = (id: string | null) => (id ? (people.map.get(id) ?? null) : null);
      const personData = (m: Backup["members"][number]) => ({
        nume: m.nume,
        prenume: m.prenume,
        statut: m.statut,
        gen: m.gen,
        rudenie: m.rudenie,
        dataNasterii: toDbDate(m.dataNasterii),
        telefon: m.telefon,
        email: m.email,
        adresa: m.adresa,
        dataMembru: toDbDate(m.dataMembru),
        modIntrare: m.modIntrare,
        bisericaProvenienta: m.bisericaProvenienta,
        dataBotez: toDbDate(m.dataBotez),
        ...importedBaptism(extras.baptism?.get(m.id), m.locBotez, m.dataBotez),
        dataBinecuvantare: toDbDate(m.dataBinecuvantare),
        dataIesire: toDbDate(m.dataIesire),
        modIesire: m.modIesire,
        bisericaDestinatie: m.bisericaDestinatie,
        slujire: m.slujire,
        note: noteWithSlujire(m.note, m.slujire),
        ...personDerived({ ...m, ...importedBaptism(extras.baptism?.get(m.id), m.locBotez, m.dataBotez) }),
      });
      const newPersons: Prisma.PersonCreateManyInput[] = [];
      for (const m of backup.members) {
        const id = people.map.get(m.id)!;
        if (people.existing.has(m.id)) await tx.person.update({ where: { id }, data: personData(m) });
        else newPersons.push({ ...personData(m), id, churchId, createdAt: ts(m.createdAt) });
      }
      await chunked(newPersons, 500, (c) => tx.person.createMany({ data: c }));

      // Familii
      const today = todayIso();
      let familii = 0;
      let fams: Awaited<ReturnType<typeof planIds>> | null = null;
      const touchedFamilies = new Set<string>();
      if (famIn?.families) {
        fams = await planIds(tx, TABLES.families, famIn.families.map((f) => f.id), churchId);
        for (const f of famIn.families) {
          const id = fams.map.get(f.id)!;
          const data = { nume: f.nume, adresa: f.adresa, note: f.note, autoCreated: f.automata };
          if (fams.existing.has(f.id)) await tx.family.update({ where: { id }, data });
          else await tx.family.create({ data: { ...data, id, churchId } });
          touchedFamilies.add(id);
        }
        // Every person in the file gets the family the file gives (or none).
        const byFamily = new Map<string | null, string[]>();
        for (const m of backup.members) {
          const famFile = famIn.memberFamily.get(m.id);
          const famId = famFile ? fams.map.get(famFile)! : null;
          byFamily.set(famId, [...(byFamily.get(famId) ?? []), people.map.get(m.id)!]);
        }
        for (const [familyId, ids] of byFamily) await chunked(ids, 500, (c) => tx.person.updateMany({ where: { id: { in: c } }, data: { familyId } }));
        for (const f of famIn.families) {
          const head = pid(f.capId);
          const id = fams.map.get(f.id)!;
          if (!head || !(byFamily.get(id) ?? []).includes(head)) continue;
          // A person heads one family only.
          await tx.family.updateMany({ where: { headId: head, id: { not: id } }, data: { headId: null } });
          await tx.family.update({ where: { id }, data: { headId: head } });
        }
        familii = famIn.families.length;
      } else if (!extras.textFamilies) {
        // Older file, default: families are built from their heads in the app, never from text.
        // The text stays on the person (familieVeche) until the person is placed in a family.
        for (const m of backup.members) {
          const text = m.familie.trim();
          if (text) await tx.person.update({ where: { id: people.map.get(m.id)! }, data: { familieVeche: text.slice(0, 120) } });
        }
        if (backup.members.some((m) => m.familie.trim())) {
          warnings.push("Familiile din fișier nu au fost create (opțiunea „Nu crea familii din text”); textul apare pe fișa fiecărei persoane.");
        }
      } else {
        // Older file, on request: one family per family text, marked as created automatically.
        const groups = new Map<string, Backup["members"]>();
        for (const m of backup.members) {
          const key = m.familie.trim();
          if (key) groups.set(key, [...(groups.get(key) ?? []), m]);
        }
        for (const list of groups.values()) {
          const ids = list.map((m) => people.map.get(m.id)!);
          const existing = await tx.person.findFirst({ where: { id: { in: ids }, familyId: { not: null } }, select: { familyId: true } });
          let familyId = existing?.familyId ?? null;
          if (!familyId) {
            const head = pickHead(
              list.map((m) => ({ ...m, id: people.map.get(m.id)! })),
              today,
            );
            familyId = (
              await tx.family.create({
                data: {
                  churchId,
                  nume: head ? defaultFamilyName(head) : `Fam. ${list[0].familie.trim()}`.slice(0, 120),
                  headId: head?.id ?? null,
                  adresa: head?.adresa ?? "",
                  autoCreated: true,
                },
              })
            ).id;
            familii++;
          }
          await tx.person.updateMany({ where: { id: { in: ids }, familyId: null }, data: { familyId } });
          touchedFamilies.add(familyId);
        }
      }
      // Families without a head get one (pickHead); empty ones are removed.
      for (const familyId of touchedFamilies) {
        const f = await tx.family.findUnique({ where: { id: familyId }, select: { headId: true } });
        const members = await tx.person.findMany({
          where: { familyId },
          select: { id: true, statut: true, rudenie: true, gen: true, dataNasterii: true, createdAt: true },
        });
        if (!members.length) {
          await tx.family.delete({ where: { id: familyId } });
          continue;
        }
        if (f?.headId && members.some((m) => m.id === f.headId)) continue;
        const head = pickHead(
          members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), createdAt: m.createdAt.toISOString() })),
          today,
        );
        if (!head) continue;
        await tx.family.updateMany({ where: { headId: head.id }, data: { headId: null } });
        await tx.family.update({ where: { id: familyId }, data: { headId: head.id } });
      }

      // Funcții și slujiri: groups and roles matched by name (case and diacritics ignored); unknown
      // names create them. Roles without a group (older files) land in the first group.
      let functii = 0;
      if (rolesIn && (rolesIn.groups || rolesIn.roles || rolesIn.functii.size)) {
        const groups = new Map(
          (await tx.roleGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { nume: "asc" }], select: { id: true, nume: true, sortOrder: true } })).map(
            (g) => [roleKey(g.nume), g],
          ),
        );
        let nextGroupOrder = Math.max(-1, ...[...groups.values()].map((g) => g.sortOrder)) + 1;
        const ensureGroup = async (nume: string, from?: BRoleGroup): Promise<string> => {
          const found = groups.get(roleKey(nume));
          if (found) {
            if (from) await tx.roleGroup.update({ where: { id: found.id }, data: { sortOrder: from.ordine, active: from.activ } });
            return found.id;
          }
          const created = await tx.roleGroup.create({ data: { churchId, nume, sortOrder: from?.ordine ?? nextGroupOrder++, active: from?.activ ?? true } });
          groups.set(roleKey(nume), { id: created.id, nume, sortOrder: created.sortOrder });
          return created.id;
        };
        for (const g of rolesIn.groups ?? []) await ensureGroup(g.nume, g);
        const defaultGroup = async () => [...groups.values()].sort((x, y) => x.sortOrder - y.sortOrder)[0]?.id ?? (await ensureGroup("Funcții"));

        const known = new Map(
          (await tx.churchRole.findMany({ select: { id: true, nume: true, sortOrder: true } })).map((r) => [roleKey(r.nume), r]),
        );
        let nextOrder = Math.max(-1, ...[...known.values()].map((r) => r.sortOrder)) + 1;
        const ensureRole = async (nume: string, from?: BRole): Promise<string> => {
          const found = known.get(roleKey(nume));
          const groupId = from?.grup ? await ensureGroup(from.grup) : null;
          if (found) {
            if (from) await tx.churchRole.update({ where: { id: found.id }, data: { sortOrder: from.ordine, active: from.activ, ...(groupId ? { groupId } : {}) } });
            return found.id;
          }
          const created = await tx.churchRole.create({
            data: {
              churchId,
              nume,
              groupId: groupId ?? (await defaultGroup()),
              sortOrder: from?.ordine ?? nextOrder++,
              active: from?.activ ?? true,
            },
          });
          known.set(roleKey(nume), { id: created.id, nume, sortOrder: created.sortOrder });
          return created.id;
        };
        for (const r of rolesIn.roles ?? []) await ensureRole(r.nume, r);
        const committeeRoles = new Set((rolesIn.roles ?? []).filter((r) => r.comitet).map((r) => roleKey(r.nume)));
        const todayDb = toDbDate(today)!;
        for (const [memberId, list] of rolesIn.functii) {
          const personId = people.map.get(memberId);
          if (!personId) continue;
          const data = [];
          for (const f of list) data.push({ personId, roleId: await ensureRole(f.nume), since: toDbDate(f.din), until: toDbDate(f.pana) });
          await tx.personRole.deleteMany({ where: { personId } });
          await tx.personRole.createMany({ data });
          functii += data.length;
          // Older files: holding a committee role (today) means being on the committee.
          if (!rolesIn.committee.size && list.some((f) => committeeRoles.has(roleKey(f.nume)) && (!f.pana || toDbDate(f.pana)! >= todayDb))) {
            await tx.person.updateMany({ where: { id: personId, dataIesire: null }, data: { inComitet: true } });
          }
        }
        for (const [memberId, flag] of rolesIn.committee) {
          const personId = people.map.get(memberId);
          if (personId) await tx.person.update({ where: { id: personId }, data: { inComitet: flag } });
        }
      }

      // Ședințe
      const meet = await planIds(tx, TABLES.meetings, backup.meetings.map((m) => m.id), churchId);
      // Minutes numbers: kept when free in their year, otherwise the meeting stays without a number.
      const updatingMeetings = backup.meetings.filter((m) => meet.existing.has(m.id)).map((m) => meet.map.get(m.id)!);
      if (updatingMeetings.length) await tx.meeting.updateMany({ where: { id: { in: updatingMeetings } }, data: { nr: null, anRegistru: null } });
      const takenNumbers = new Set(
        (await tx.meeting.findMany({ where: { nr: { not: null } }, select: { nr: true, anRegistru: true } })).map((r) => `${r.anRegistru}:${r.nr}`),
      );
      const unnumbered: string[] = [];
      let badSignatures = 0;
      for (const m of backup.meetings) {
        const id = meet.map.get(m.id)!;
        const extra = extras.meetings?.get(m.id);
        // Points: from the app's own fields, or from the prototype's texts (as the minutes_numbering migration did).
        const split = extra?.puncte ? null : splitDecisions(m.hotarari, m.discutii);
        const year = Number(m.data.slice(0, 4));
        let nr = extra?.nr ?? null;
        if (nr !== null && takenNumbers.has(`${year}:${nr}`)) {
          unnumbered.push(`${nr}/${year}`);
          nr = null;
        }
        if (nr !== null) takenNumbers.add(`${year}:${nr}`);
        const data = {
          titlu: m.titlu,
          tip: m.tip,
          data: toDbDate(m.data)!,
          ora: m.ora,
          loc: m.loc,
          presedinte: m.presedinte,
          invitati: m.invitati,
          ordine: m.ordine,
          discutii: "",
          hotarari: "",
          puncte: extra?.puncte ?? split!.puncte,
          observatii: extra?.observatii ?? split?.observatii ?? "",
          formulaIncheiere: extra?.formulaIncheiere ?? DEFAULT_CLOSING,
          nr,
          anRegistru: nr !== null ? year : null,
          asteptati: extra?.asteptati ?? null,
          locked: Boolean(extra?.inchisLa),
          lockedAt: extra?.inchisLa ? new Date(extra.inchisLa) : null,
          ...(extra?.asezare ? { layout: { ...extra.asezare } as Prisma.InputJsonObject } : {}),
        };
        const prezenti = [...new Set(m.prezenti.map(pid).filter((x): x is string => x !== null))];
        const absenti = [...new Set((extra?.absenti ?? []).map(pid).filter((x): x is string => x !== null && !prezenti.includes(x)))];
        const rows = [
          ...prezenti.map((personId) => ({ personId, status: "PRESENT" as const })),
          ...absenti.map((personId) => ({ personId, status: "ABSENT" as const })),
        ];
        // Signatures: only of persons present, re-checked like a newly drawn one.
        const signatures = [];
        for (const s of extra?.semnaturi ?? []) {
          const personId = pid(s.persoanaId);
          if (!personId || !prezenti.includes(personId)) continue;
          try {
            signatures.push({ personId, imagePng: new Uint8Array(await normalizeSignature(s.imagine)), signedAt: new Date(s.semnatLa) });
          } catch {
            badSignatures++;
          }
        }
        if (meet.existing.has(m.id)) {
          await tx.meeting.update({
            where: { id },
            data: { ...data, prezenti: { deleteMany: {}, create: rows }, ...(extra?.semnaturi ? { signatures: { deleteMany: {}, create: signatures } } : {}) },
          });
        } else {
          await tx.meeting.create({
            data: { ...data, id, churchId, createdAt: ts(m.createdAt), prezenti: { create: rows }, signatures: { create: signatures } },
          });
        }
      }

      if (badSignatures) warnings.push(`${badSignatures} semnături nu erau imagini valide și nu au fost importate.`);
      if (unnumbered.length) warnings.push(`Procese-verbale rămase fără număr (numărul era deja folosit): ${unnumbered.join(", ")}.`);

      // Evenimente
      const evs = await planIds(tx, TABLES.events, backup.events.map((e) => e.id), churchId);
      for (const e of backup.events) {
        const id = evs.map.get(e.id)!;
        const data = {
          titlu: e.titlu,
          tip: e.tip,
          data: toDbDate(e.data)!,
          ora: e.ora,
          loc: e.loc,
          invitat: e.invitat,
          responsabil: e.responsabil,
          descriere: e.descriere,
          agapaActiva: e.agapa.activ,
          agapaResponsabil: e.agapa.responsabil,
          agapaPersoane: e.agapa.persoane,
        };
        const contributii = e.agapa.contributii.map((c, pozitie) => ({ ...c, pozitie }));
        if (evs.existing.has(e.id)) {
          await tx.event.update({ where: { id }, data: { ...data, contributii: { deleteMany: {}, create: contributii } } });
        } else {
          await tx.event.create({ data: { ...data, id, churchId, createdAt: ts(e.createdAt), contributii: { create: contributii } } });
        }
      }

      // Documente (numerotare unică pe an)
      const docs = await planIds(tx, TABLES.documents, backup.documents.map((x) => x.id), churchId);
      const updatingIds = backup.documents.filter((x) => docs.existing.has(x.id)).map((x) => x.id);
      const takenRows = await tx.document.findMany({ where: { id: { notIn: updatingIds } }, select: { anRegistru: true, nr: true } });
      const taken = new Map<number, Set<number>>();
      for (const r of takenRows) taken.set(r.anRegistru, (taken.get(r.anRegistru) ?? new Set()).add(r.nr));
      const { docs: numbered, renumbered } = normalizeDocumentNumbers(backup.documents, taken);
      if (renumbered.length) warnings.push(`Documente renumerotate (număr lipsă sau deja folosit): ${renumbered.join("; ")}.`);
      const docData = (x: BDocument) => ({
        tip: x.tip,
        nr: x.nr,
        anRegistru: Number(x.data.slice(0, 4)),
        data: toDbDate(x.data)!,
        personId: pid(x.membruId),
        persoana: x.persoana,
        catre: x.catre,
        scop: x.scop,
        titlu: x.titlu,
        text: x.text,
        anRaport: x.tip === "raport" ? (x.an ?? Number(x.data.slice(0, 4))) : x.an,
      });
      // Actualizările întâi pe numere temporare negative, ca să nu se ciocnească între ele.
      for (const x of numbered.filter((d) => docs.existing.has(d.id))) {
        await tx.document.update({ where: { id: docs.map.get(x.id)! }, data: { nr: -Math.abs(x.nr) - 1_000_000 } });
      }
      for (const x of numbered) {
        const id = docs.map.get(x.id)!;
        if (docs.existing.has(x.id)) await tx.document.update({ where: { id }, data: docData(x) });
        else await tx.document.create({ data: { ...docData(x), id, churchId, createdAt: ts(x.createdAt) } });
      }

      // Grupuri
      const grs = await planIds(tx, TABLES.groups, backup.groups.map((g) => g.id), churchId);
      for (const g of backup.groups) {
        const id = grs.map.get(g.id)!;
        const membri = [...new Set(g.membri.map(pid).filter((x): x is string => x !== null))];
        const data = { nume: g.nume, responsabil: g.responsabil, descriere: g.descriere };
        if (grs.existing.has(g.id)) {
          await tx.group.update({ where: { id }, data: { ...data, membri: { deleteMany: {}, create: membri.map((personId) => ({ personId })) } } });
        } else {
          await tx.group.create({ data: { ...data, id, churchId, createdAt: ts(g.createdAt), membri: { create: membri.map((personId) => ({ personId })) } } });
        }
      }

      // Mențiuni
      const nts = await planIds(tx, TABLES.notes, backup.notes.map((n) => n.id), churchId);
      const newNotes: Prisma.NoteCreateManyInput[] = [];
      for (const n of backup.notes) {
        const id = nts.map.get(n.id)!;
        const data = {
          data: toDbDate(n.data)!,
          tip: n.tip,
          personId: pid(n.persoanaId),
          familie: n.familie,
          text: n.text,
          searchText: noteSearchText(n),
        };
        if (nts.existing.has(n.id)) await tx.note.update({ where: { id }, data });
        else newNotes.push({ ...data, id, churchId, createdAt: ts(n.createdAt) });
      }
      await chunked(newNotes, 500, (c) => tx.note.createMany({ data: c }));

      // Cereri de membru
      const apps = await planIds(tx, TABLES.applications, (applications ?? []).map((a) => a.id), churchId);
      if (applications?.length) {
        // A person can be linked to one application only: keep links already used by other rows.
        const updating = applications.filter((a) => apps.existing.has(a.id)).map((a) => a.id);
        const usedRows = await tx.application.findMany({
          where: { personId: { not: null }, id: { notIn: updating } },
          select: { personId: true },
        });
        const used = new Set(usedRows.map((r) => r.personId));
        let unlinked = 0;
        for (const a of applications) {
          const id = apps.map.get(a.id)!;
          let personId = pid(a.membruId);
          if (personId && used.has(personId)) {
            personId = null;
            unlinked++;
          }
          if (personId) used.add(personId);
          const data = {
            status: a.status,
            kind: a.kind,
            nume: a.nume,
            prenume: a.prenume,
            gen: a.gen,
            dataNasterii: toDbDate(a.dataNasterii),
            telefon: a.telefon,
            email: a.email,
            adresa: a.adresa,
            familie: a.familie,
            rudenie: a.rudenie,
            bisericaProvenienta: a.bisericaProvenienta,
            dataBotez: toDbDate(a.dataBotez),
            botezAn: a.botezAn,
            botezBiserica: a.botezBiserica,
            botezLocalitate: a.botezLocalitate,
            botezOficiant: a.botezOficiant,
            mesaj: a.mesaj,
            consent: a.consent,
            consentStatutCult: a.consentStatutCult,
            consentStatutIntern: a.consentStatutIntern,
            consentAt: a.consentAt ? new Date(a.consentAt) : null,
            decidedAt: a.decidedAt ? new Date(a.decidedAt) : null,
            personId,
            rejectReason: a.motiv,
          };
          if (apps.existing.has(a.id)) await tx.application.update({ where: { id }, data });
          else await tx.application.create({ data: { ...data, id, churchId, createdAt: new Date(a.createdAt) } });
        }
        if (unlinked) warnings.push(`${unlinked} cereri au pierdut legătura cu persoana (persoana era deja legată de altă cerere).`);
      }

      // Setări
      if (backup.settings) {
        const s = backup.settings;
        await tx.church.update({
          where: { id: churchId },
          data: {
            ...(s.nume ? { nume: s.nume } : {}),
            adresa: s.adresa,
            orgNr: s.orgnr,
            telefon: s.telefon,
            email: s.email,
            pastor: s.pastor,
            secretar: s.secretar,
            tipuriSedinte: s.nomen.tipuriSedinte,
            tipuriEvenimente: s.nomen.tipuriEvenimente,
            tipuriMentiuni: s.nomen.tipuriMentiuni,
            gradeRudenie: s.nomen.rudenie,
          },
        });
      }

      // Other forms of names: attached to the imported persons (the latest file wins for a name).
      for (const a of extras.aliases ?? []) {
        const personId = pid(a.membru);
        if (!personId) continue;
        const existing = await tx.personAlias.findFirst({ where: { alias: a.alias } });
        if (existing) await tx.personAlias.update({ where: { id: existing.id }, data: { personId } });
        else await tx.personAlias.create({ data: { alias: a.alias, personId, createdById: ctx.user.id } as never });
      }

      const remapped = [people, meet, evs, docs, grs, nts, apps, ...(fams ? [fams] : [])].reduce(
        (n, p) => n + [...p.map].filter(([a, b]) => a !== b).length,
        0,
      );
      if (remapped) warnings.push(`${remapped} înregistrări au primit identificatori noi (id-urile din fișier erau deja folosite).`);

      const summary: ImportSummary = {
        persoane: backup.members.length,
        sedinte: backup.meetings.length,
        evenimente: backup.events.length,
        documente: backup.documents.length,
        grupuri: backup.groups.length,
        mentiuni: backup.notes.length,
        cereri: applications?.length ?? 0,
        familii,
        functii,
        setari: Boolean(backup.settings),
        avertismente: warnings,
      };
      await writeAudit(tx, ctx.user, {
        entity: "IMPORT",
        entityId: randomUUID(),
        entityLabel: mode === "replace" ? "Import (înlocuire completă)" : "Import (îmbinare)",
        action: "CREATE",
        fields: ["mod", "inregistrari"],
        after: {
          mod: mode === "replace" ? "înlocuire" : "îmbinare",
          inregistrari: `${summary.persoane} persoane, ${summary.sedinte} ședințe, ${summary.evenimente} evenimente, ${summary.documente} documente, ${summary.grupuri} grupuri, ${summary.mentiuni} mențiuni, ${summary.cereri} cereri, ${summary.familii} familii, ${summary.functii} funcții atribuite`,
        },
      });
      return summary;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
