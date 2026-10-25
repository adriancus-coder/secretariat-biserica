import "server-only";
import { meetingPrint, type PrintSpec } from "@/domain/print";
import { quorumLine } from "@/lib/attendance";
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
  const spec = meetingPrint(
    {
      nr: m.nr,
      tip: m.tip,
      data: m.data,
      prezenti: m.prezenti,
      absenti: m.absenti,
      invitati: m.invitati,
      ordine: m.ordine,
      puncte: m.puncte,
      observatii: m.observatii,
      formulaIncheiere: m.formulaIncheiere,
      cvorum: quorumLine(m.asteptati, m.absenti.length),
      semnaturi: m.prezenti.map((p) => ({
        name: `${p.prenume} ${p.nume}`.trim(),
        image: p.signature ? new Uint8Array(p.signature.png) : null,
        signedAt: p.signature ? dotDateTime(p.signature.signedAt) : null,
      })),
      inchisLa: m.locked && m.lockedAt ? dotDateTime(m.lockedAt) : null,
    },
    church,
  );
  return { ...spec, layout: layout ?? resolveLayout(church.pvLayout, m.layout) };
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
