import "server-only";
import { meetingPrint, type MeetingPrint, type PrintSpec, type SignatureCell } from "@/domain/print";
import { memberName } from "@/lib/format";
import { roleSigners, tableSigners } from "@/lib/minutes-signatures";
import { shownAbsentees } from "@/lib/attendance";
import { minutesAttendance } from "@/lib/general-assembly";
import { dotDateTime } from "@/lib/dates";
import { resolveLayout, type PageLayout } from "@/lib/page-layout";
import { renderDocx } from "../docx/render";
import type { ChurchSettings } from "../queries/church";
import type { getMeeting } from "../queries/meetings";
import { renderPdf } from "./render";

type MeetingRecord = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

/**
 * The minutes as a print spec: rendered as PDF (/pdf/proces-verbal/[id], e-mails) or as Word, in the
 * meeting's page layout (its own, else the church's default); `layout` previews unsaved changes.
 */
export function meetingSpec(m: MeetingRecord, church: ChurchSettings, layout?: PageLayout): PrintSpec {
  const lines = minutesAttendance({ ...m, present: m.prezenti.length, absent: m.absenti.length }, church);
  const byNumber = m.numarPrezenti != null;
  const spec = meetingPrint(
    {
      nr: m.nr,
      tip: m.tip,
      data: m.data,
      prezenti: byNumber ? [] : m.prezenti,
      absenti: shownAbsentees(m.numarPrezenti, m.absenti),
      numarPrezenti: m.numarPrezenti,
      invitati: m.invitati,
      ordine: m.ordine,
      puncte: m.puncte,
      puncteRich: m.puncteRich,
      observatii: m.observatii,
      observatiiRich: m.observatiiRich,
      formulaIncheiere: m.formulaIncheiere,
      formulaRich: m.formulaRich,
      ...lines,
      sedintaInchisa: m.sedintaInchisa,
      ...minutesSignatures(m.prezenti, m.roleSignatures, church),
      inchisLa: m.locked && m.lockedAt ? dotDateTime(m.lockedAt) : null,
    },
    church,
  );
  return { ...spec, layout: layout ?? resolveLayout(church.pvLayout, m.layout) };
}

type SignatureRecord = { signedAt: Date; png: Buffer | null; paper: boolean };

/**
 * MINUTES-SIGNATURES: the signature table (those present, without the Secretar and the Pastor of the
 * „Întocmit” block, `tableSigners`) and the bottom places as signed in the app. Shared by the PDF, Word,
 * e-mail and the preview of unsaved minutes.
 */
export function minutesSignatures(
  present: readonly { nume: string; prenume: string; signature?: SignatureRecord | null }[],
  roles: Partial<Record<"SECRETAR" | "PASTOR", SignatureRecord & { nume: string }>>,
  church: { secretar: string; pastor: string },
): Pick<MeetingPrint, "semnaturi" | "semnatari"> {
  const semnaturi: SignatureCell[] = tableSigners(present, church).map((p) => ({
    name: memberName(p),
    image: p.signature?.png ? new Uint8Array(p.signature.png) : null,
    signedAt: p.signature && !p.signature.paper ? dotDateTime(p.signature.signedAt) : null,
    ...(p.signature?.paper ? { paper: true } : {}),
  }));
  const semnatari: MeetingPrint["semnatari"] = {};
  for (const r of roleSigners(church)) {
    const s = roles[r.rol];
    if (!s) continue;
    semnatari[r.rol] = {
      name: s.nume || r.name,
      image: s.png && !s.paper ? new Uint8Array(s.png) : null,
      note: s.paper ? "semnat pe hârtie" : `semnat ${dotDateTime(s.signedAt)}`,
    };
  }
  return { semnaturi, semnatari };
}

/** The minutes PDF, as served by /pdf/proces-verbal/[id] and attached to e-mails. */
export function renderMeetingPdf(m: MeetingRecord, church: ChurchSettings, layout?: PageLayout): Promise<Buffer> {
  return renderPdf(meetingSpec(m, church, layout));
}

/** The minutes as an editable Word file (/pdf/proces-verbal/[id]/word), same content as the PDF. */
export function renderMeetingDocx(m: MeetingRecord, church: ChurchSettings, layout?: PageLayout): Promise<Buffer> {
  return renderDocx(meetingSpec(m, church, layout));
}

/** `PV-<nr>-<AAAA>-<church slug>.pdf`; unnumbered minutes use the date: `PV-<AAAA-LL-ZZ>-<slug>.pdf`. */
export function meetingPdfFileName(m: { nr: number | null; anRegistru: number | null; data: string }, churchSlug: string): string {
  return m.nr !== null ? `PV-${m.nr}-${m.anRegistru}-${churchSlug}.pdf` : `PV-${m.data}-${churchSlug}.pdf`;
}
