import { formatAddress } from "@/lib/address";
import "server-only";
import { PERSONAL_HISTORY_NOTE } from "@/lib/attendance";
import { DIRECTION_LABEL } from "@/lib/correspondence";
import { EVENT_ROLE_LABEL, type EventPersonRole } from "@/lib/event-persons";
import { baptismSentence } from "@/lib/baptism";
import type { DataCopy } from "@/lib/data-copy";
import { fromDbDate, todayIso } from "@/lib/dates";
import { unmarriedLabel } from "@/lib/marital";
import { prayerChangeText } from "@/lib/prayer";
import { relativeName, relatives } from "@/lib/kinship";
import { loadKinship } from "./kinship";
import { fmtDot } from "@/domain/print";
import { memberName } from "@/lib/format";
import {
  APPLICATION_STATUS_LABEL,
  DISCIPLINARY_FORM_LABEL,
  DISCIPLINARY_STATE_LABEL,
  DOCUMENT_TYPE_LABEL,
  ENTRY_LABEL,
  EXIT_LABEL,
  GENDER_LABEL,
  STATUS_LABEL,
} from "@/lib/labels";
import type { Ctx } from "./session";

const d = (v: Date | null | undefined) => (v ? fmtDot(fromDbDate(v)!) : "");

/** The data copy of one person (administrators; discipline only when asked and allowed by the caller). */
export async function loadDataCopy(ctx: Ctx, personId: string, withDiscipline: boolean): Promise<DataCopy | null> {
  const p = await ctx.db.person.findUnique({
    where: { id: personId },
    include: {
      family: {
        select: {
          nume: true,
          members: { select: { id: true, nume: true, prenume: true, rudenie: true } },
          prayerOptOut: true,
          prayerIncludeChildren: true,
          prayerChangedAt: true,
          prayerSource: true,
          prayerWeeks: { select: { weekStart: true }, orderBy: { weekStart: "asc" } },
        },
      },
      prayerWeeks: { select: { weekStart: true }, orderBy: { weekStart: "asc" } },
      roles: { include: { role: { select: { nume: true } } } },
      groups: { include: { group: { select: { nume: true } } } },
      aliases: { select: { alias: true } },
      application: { select: { createdAt: true, status: true, kind: true } },
      // A registered disciplinary act only with the discipline part of the copy.
      documents: { where: withDiscipline ? {} : { confidential: false }, select: { nr: true, anRegistru: true, tip: true, data: true, titlu: true }, orderBy: [{ data: "asc" }, { nr: "asc" }] },
      correspondence: { select: { nr: true, an: true, data: true, directie: true, subiect: true }, orderBy: [{ data: "asc" }, { nr: "asc" }] },
      eventRoles: { select: { rol: true, aplicatInRegistruLa: true, event: { select: { titlu: true, tip: true, data: true } } } },
      meetings: { where: { status: "PRESENT" }, select: { meeting: { select: { tip: true, data: true, nr: true, anRegistru: true } } } },
    },
  });
  if (!p) return null;
  const measures = withDiscipline
    ? await ctx.db.disciplinaryMeasure.findMany({ where: { personId }, orderBy: { dataInceput: "asc" } })
    : [];
  // Kinship: parents (a parent outside the register by the name written on the file), siblings, children.
  const kin = await loadKinship(ctx.db);
  const rel = kin.graph.person.has(personId) ? relatives(kin.graph, personId) : null;
  const kinRows = (group: "parinti" | "frati" | "copii") =>
    (rel?.[group] ?? []).map((id) => {
      const k = kin.graph.person.get(id)!;
      return [relativeName(group, k.gen), k.external ? `${k.nume} (nu e în registru)` : memberName(k)];
    });
  const baptism = baptismSentence({ ...p, data: d(p.dataBotez) });
  // The weekly prayer: the family's choice (or the person's, without a family) and the weeks announced.
  const prayer = p.family ?? p;
  const prayerWeeks = (p.family?.prayerWeeks ?? p.prayerWeeks).map((w) => d(w.weekStart));
  return {
    persoana: memberName(p),
    generatLa: todayIso(),
    sectiuni: [
      {
        titlu: "Date de registru (Statut art. 14 alin. 3 lit. a)",
        campuri: [
          ["Nume", p.nume],
          ["Prenume", p.prenume],
          ["Gen", p.gen ? GENDER_LABEL[p.gen] : ""],
          ["Data nașterii", d(p.dataNasterii)],
          ["Botez în apă", baptism],
          ["Data căsătoriei", p.dataCasatoriei ? d(p.dataCasatoriei) : p.necasatorit ? unmarriedLabel(p.gen) : ""],
          ["Numele tatălui", p.numeTata],
          ["Numele mamei", p.numeMama],
          ["Familie", p.family ? `${p.family.nume}${p.rudenie ? ` — ${p.rudenie}` : ""}` : ""],
          ["Membrii familiei", p.family ? p.family.members.filter((m) => m.id !== p.id).map((m) => `${memberName(m)}${m.rudenie ? ` (${m.rudenie})` : ""}`).join(", ") : ""],
          ["Data decesului", p.modIesire === "DECES" ? d(p.dataIesire) : ""],
        ],
      },
      { titlu: "Date de contact", campuri: [["Telefon", p.telefon], ["E-mail", p.email], ["Adresă", formatAddress(p)]] },
      {
        titlu: "Viața bisericii",
        campuri: [
          ["Statut", STATUS_LABEL[p.statut]],
          ["Intrare", p.dataMembru ? `${d(p.dataMembru)}${p.modIntrare ? ` — ${ENTRY_LABEL[p.modIntrare]}` : ""}${p.bisericaProvenienta ? `, de la ${p.bisericaProvenienta}` : ""}` : ""],
          ["Ieșire", p.dataIesire ? `${d(p.dataIesire)}${p.modIesire ? ` — ${EXIT_LABEL[p.modIesire]}` : ""}${p.bisericaDestinatie ? `, la ${p.bisericaDestinatie}` : ""}` : ""],
          ["Binecuvântare ca copil", d(p.dataBinecuvantare)],
          ["Membru în comitet", p.inComitet ? "da" : ""],
          ["Funcții și slujiri", p.roles.map((r) => `${r.role.nume}${r.since ? ` din ${d(r.since)}` : ""}${r.until ? ` până la ${d(r.until)}` : ""}`).join(", ")],
          ["Grupuri", p.groups.map((g) => g.group.nume).join(", ")],
          ["Plecat temporar", p.plecatDin ? `din ${d(p.plecatDin)}${p.plecatUnde ? `, ${p.plecatUnde}` : ""}` : ""],
          ["Alte forme ale numelui", p.aliases.map((a) => a.alias).join(", ")],
          ["Cerere de membru", p.application ? `${d(p.application.createdAt)} — ${APPLICATION_STATUS_LABEL[p.application.status]}` : ""],
          ["Note", p.note],
        ],
      },
      {
        titlu: "Rugăciunea săptămânală pentru familii",
        campuri: [
          ["Nu dorește să fie pomenită", prayer.prayerOptOut ? "da" : "nu"],
          ["Copiii pot fi pomeniți cu numele", prayer.prayerIncludeChildren ? "da" : "nu"],
          ["Ultima modificare", prayerChangeText(prayer.prayerChangedAt, prayer.prayerSource) ?? ""],
          ["Săptămânile în care a fost anunțată", prayerWeeks.join(", ")],
        ],
      },
      {
        titlu: "Părinți și frați",
        tabel: { coloane: ["Legătura", "Persoana"], randuri: [...kinRows("parinti"), ...kinRows("frati")] },
      },
      {
        titlu: "Copii din registru",
        tabel: { coloane: ["Legătura", "Persoana"], randuri: kinRows("copii") },
      },
      {
        titlu: "Prezență la ședințe",
        // ATTENDANCE-COUNT: only the meetings recorded by name can name the person.
        campuri: [["Notă", PERSONAL_HISTORY_NOTE]],
        tabel: {
          coloane: ["Data", "Ședința", "Proces-verbal"],
          randuri: p.meetings
            .map((m) => m.meeting)
            .sort((a, b) => a.data.getTime() - b.data.getTime())
            .map((m) => [d(m.data), m.tip, m.nr !== null ? `nr. ${m.nr}/${m.anRegistru}` : ""]),
        },
      },
      {
        // EVENT-PERSONS: the calendar events naming the person (blessing, baptism, wedding, funeral).
        titlu: "Evenimente din calendar",
        tabel: {
          coloane: ["Data", "Eveniment", "Rol", "Trecut în registru"],
          randuri: [...p.eventRoles]
            .sort((a, b) => a.event.data.getTime() - b.event.data.getTime())
            .map((r) => [d(r.event.data), `${r.event.titlu} (${r.event.tip})`, EVENT_ROLE_LABEL[r.rol as EventPersonRole], r.aplicatInRegistruLa ? "da" : "nu"]),
        },
      },
      {
        titlu: "Documente eliberate",
        tabel: { coloane: ["Nr.", "Data", "Tip", "Titlu"], randuri: p.documents.map((x) => [`${x.nr}/${x.anRegistru}`, d(x.data), DOCUMENT_TYPE_LABEL[x.tip], x.titlu]) },
      },
      {
        // CORRESPONDENCE-REGISTER: the entries and exits of the register linked to the person (no letter text is kept).
        titlu: "Corespondență (registru de intrare-ieșire)",
        tabel: { coloane: ["Nr.", "Data", "Intrare / ieșire", "Subiect"], randuri: p.correspondence.map((x) => [`${x.nr}/${x.an}`, d(x.data), DIRECTION_LABEL[x.directie], x.subiect]) },
      },
      ...(withDiscipline
        ? [
            {
              titlu: "Măsuri disciplinare (Statut art. 27)",
              tabel: {
                coloane: ["Data", "Forma", "Stare", "Încheiată la"],
                randuri: measures.map((m) => [d(m.dataInceput), DISCIPLINARY_FORM_LABEL[m.forma], DISCIPLINARY_STATE_LABEL[m.stare], d(m.dataSfarsit)]),
              },
            },
          ]
        : []),
    ],
  };
}
