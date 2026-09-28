import "server-only";
import { randomUUID } from "node:crypto";
import { normalizeDocumentNumbers, type Backup, type BDocument } from "@/domain/backup";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { noteSearchText, personDerived } from "@/lib/person-derived";
import { writeAudit } from "./audit";
import type { Ctx } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const byName = { orderBy: { createdAt: "asc" as const } };

/** Toate datele bisericii, pentru export. */
export async function loadBackup(ctx: Ctx): Promise<Backup> {
  const [persons, meetings, events, documents, groups, notes, church] = await Promise.all([
    ctx.db.person.findMany({ orderBy: [{ sortKey: "asc" }, { id: "asc" }] }),
    ctx.db.meeting.findMany({ ...byName, include: { prezenti: { select: { personId: true } } } }),
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
      familie: p.familie,
      rudenie: p.rudenie,
      dataNasterii: fromDbDate(p.dataNasterii),
      telefon: p.telefon,
      email: p.email,
      adresa: p.adresa,
      dataMembru: fromDbDate(p.dataMembru),
      modIntrare: p.modIntrare,
      bisericaProvenienta: p.bisericaProvenienta,
      dataBotez: fromDbDate(p.dataBotez),
      locBotez: p.locBotez,
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
      discutii: m.discutii,
      hotarari: m.hotarari,
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

export type ImportMode = "merge" | "replace";

export interface ImportSummary {
  persoane: number;
  sedinte: number;
  evenimente: number;
  documente: number;
  grupuri: number;
  mentiuni: number;
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

/** Importă o copie de siguranță validată, într-o singură tranzacție. */
export async function importBackup(ctx: Ctx, backup: Backup, mode: ImportMode): Promise<ImportSummary> {
  const churchId = ctx.user.churchId;
  const warnings: string[] = [];
  return ctx.db.$transaction(
    async (tx) => {
      if (mode === "replace") {
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
        familie: m.familie,
        rudenie: m.rudenie,
        dataNasterii: toDbDate(m.dataNasterii),
        telefon: m.telefon,
        email: m.email,
        adresa: m.adresa,
        dataMembru: toDbDate(m.dataMembru),
        modIntrare: m.modIntrare,
        bisericaProvenienta: m.bisericaProvenienta,
        dataBotez: toDbDate(m.dataBotez),
        locBotez: m.locBotez,
        dataBinecuvantare: toDbDate(m.dataBinecuvantare),
        dataIesire: toDbDate(m.dataIesire),
        modIesire: m.modIesire,
        bisericaDestinatie: m.bisericaDestinatie,
        slujire: m.slujire,
        note: m.note,
        ...personDerived(m),
      });
      const newPersons: Prisma.PersonCreateManyInput[] = [];
      for (const m of backup.members) {
        const id = people.map.get(m.id)!;
        if (people.existing.has(m.id)) await tx.person.update({ where: { id }, data: personData(m) });
        else newPersons.push({ ...personData(m), id, churchId, createdAt: ts(m.createdAt) });
      }
      await chunked(newPersons, 500, (c) => tx.person.createMany({ data: c }));

      // Ședințe
      const meet = await planIds(tx, TABLES.meetings, backup.meetings.map((m) => m.id), churchId);
      for (const m of backup.meetings) {
        const id = meet.map.get(m.id)!;
        const data = {
          titlu: m.titlu,
          tip: m.tip,
          data: toDbDate(m.data)!,
          ora: m.ora,
          loc: m.loc,
          presedinte: m.presedinte,
          invitati: m.invitati,
          ordine: m.ordine,
          discutii: m.discutii,
          hotarari: m.hotarari,
        };
        const prezenti = [...new Set(m.prezenti.map(pid).filter((x): x is string => x !== null))];
        if (meet.existing.has(m.id)) {
          await tx.meeting.update({ where: { id }, data: { ...data, prezenti: { deleteMany: {}, create: prezenti.map((personId) => ({ personId })) } } });
        } else {
          await tx.meeting.create({
            data: { ...data, id, churchId, createdAt: ts(m.createdAt), prezenti: { create: prezenti.map((personId) => ({ personId })) } },
          });
        }
      }

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

      const remapped = [people, meet, evs, docs, grs, nts].reduce(
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
          inregistrari: `${summary.persoane} persoane, ${summary.sedinte} ședințe, ${summary.evenimente} evenimente, ${summary.documente} documente, ${summary.grupuri} grupuri, ${summary.mentiuni} mențiuni`,
        },
      });
      return summary;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
