import "server-only";
import { baptismSentence } from "@/lib/baptism";
import type { DataCopy } from "@/lib/data-copy";
import { fromDbDate, todayIso } from "@/lib/dates";
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
      family: { select: { nume: true, members: { select: { id: true, nume: true, prenume: true, rudenie: true } } } },
      roles: { include: { role: { select: { nume: true } } } },
      groups: { include: { group: { select: { nume: true } } } },
      aliases: { select: { alias: true } },
      application: { select: { createdAt: true, status: true, kind: true } },
      documents: { select: { nr: true, anRegistru: true, tip: true, data: true, titlu: true }, orderBy: [{ data: "asc" }, { nr: "asc" }] },
      meetings: { where: { status: "PRESENT" }, select: { meeting: { select: { tip: true, data: true, nr: true, anRegistru: true } } } },
    },
  });
  if (!p) return null;
  const measures = withDiscipline
    ? await ctx.db.disciplinaryMeasure.findMany({ where: { personId }, orderBy: { dataInceput: "asc" } })
    : [];
  const baptism = baptismSentence({ ...p, data: d(p.dataBotez) });
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
          ["Data căsătoriei", d(p.dataCasatoriei)],
          ["Numele tatălui", p.numeTata],
          ["Numele mamei", p.numeMama],
          ["Familie", p.family ? `${p.family.nume}${p.rudenie ? ` — ${p.rudenie}` : ""}` : ""],
          ["Membrii familiei", p.family ? p.family.members.filter((m) => m.id !== p.id).map((m) => `${memberName(m)}${m.rudenie ? ` (${m.rudenie})` : ""}`).join(", ") : ""],
          ["Data decesului", p.modIesire === "DECES" ? d(p.dataIesire) : ""],
        ],
      },
      { titlu: "Date de contact", campuri: [["Telefon", p.telefon], ["E-mail", p.email], ["Adresă", p.adresa]] },
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
        titlu: "Prezență la ședințe",
        tabel: {
          coloane: ["Data", "Ședința", "Proces-verbal"],
          randuri: p.meetings
            .map((m) => m.meeting)
            .sort((a, b) => a.data.getTime() - b.data.getTime())
            .map((m) => [d(m.data), m.tip, m.nr !== null ? `nr. ${m.nr}/${m.anRegistru}` : ""]),
        },
      },
      {
        titlu: "Documente eliberate",
        tabel: { coloane: ["Nr.", "Data", "Tip", "Titlu"], randuri: p.documents.map((x) => [`${x.nr}/${x.anRegistru}`, d(x.data), DOCUMENT_TYPE_LABEL[x.tip], x.titlu]) },
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
