import { notFound } from "next/navigation";
import { meetingPrint } from "@/domain/print";
import { quorumLine } from "@/lib/attendance";
import { dotDateTime } from "@/lib/dates";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export async function GET(_req: Request, { params }: RouteContext<"/pdf/proces-verbal/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  const pdf = await renderPdf(
    meetingPrint(
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
    ),
  );
  return pdfResponse(pdf, pdfFileName(m.nr !== null ? `PV-${m.nr}-${m.anRegistru}-${m.tip}` : `proces-verbal-${m.data}-${m.titlu || m.tip}`));
}
