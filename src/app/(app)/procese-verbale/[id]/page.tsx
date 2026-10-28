import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { RichView } from "@/components/rich-editor/rich-view";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { isGeneralAssembly, minutesAttendance, AG_KIND_LABEL } from "@/lib/general-assembly";
import { fmt } from "@/lib/format";
import { minutesNumber } from "@/lib/minutes";
import { permissions } from "@/lib/permissions";
import { assignMeetingNumberAction, deleteMeetingAction } from "@/server/actions/meetings";
import { dotDateTime } from "@/lib/dates";
import { CLOSED_SESSION_LINE, fmtDot } from "@/domain/print";
import { Signatures } from "./signatures";
import { ExcusedForm } from "./excused";
import { SendMinutesButton, ShareMinutesButton, type Recipient } from "./send-minutes";
import { defaultSendSubject } from "@/lib/schemas/meeting-send";
import { minutesLines, isEmailConfigured } from "@/server/email";
import { meetingPdfFileName } from "@/server/pdf/meeting";
import { getChurch } from "@/server/queries/church";
import { AssignNumberButton } from "./assign-number";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { DownloadLink } from "@/components/ui/download";
import { MIME } from "@/lib/download";

export const metadata: Metadata = { title: "Proces-verbal" };

export default async function MeetingPage({ params }: PageProps<"/procese-verbale/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [x, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const lines = minutesAttendance({ ...x, present: x.prezenti.length, absent: x.absenti.length }, church);
  const ag = isGeneralAssembly(x.tip, church.tipuriAG);
  const committeeMeeting = church.attendanceRules[x.tip] === "COMITET";
  const numberLabel = minutesNumber(x);
  // A closed meeting is read-only (the server refuses edits too).
  const canEdit = canWrite && !x.locked;
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "MEETING", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  const dataLabel = fmtDot(x.data);
  const recipients = canWrite ? sendRecipients(church, x.prezenti) : [];

  return (
    <>
      <BackLink href="/procese-verbale">Procese-verbale</BackLink>
      <PageHead
        title={x.titlu || x.tip}
        sub={
          <>
            {numberLabel ?? <span className="tag tag-warn">fără număr</span>} · {x.tip}
            {x.locked ? <span className="tag tag-ok ml-1.5">închis{x.lockedAt ? ` la ${dotDateTime(x.lockedAt)}` : ""}</span> : null}
          </>
        }
      >
        <DownloadLink file={`/pdf/proces-verbal/${x.id}`} filename="proces-verbal.pdf" mime={MIME.pdf} inline>
          Tipărește (PDF)
        </DownloadLink>
        <DownloadLink file={`/pdf/proces-verbal/${x.id}/word`} filename="proces-verbal.docx" mime={MIME.docx}>
          Deschide în Word
        </DownloadLink>
        {canWrite ? (
          <Link href={`/procese-verbale/${x.id}/asezare`} className="btn">
            Așezare în pagină
          </Link>
        ) : null}
        <ShareMinutesButton meetingId={x.id} fileName={meetingPdfFileName(x, church.slug)} title={numberLabel ?? `Proces-verbal ${dataLabel}`} />
        {canWrite ? (
          <SendMinutesButton
            meetingId={x.id}
            configured={isEmailConfigured()}
            recipients={recipients}
            subject={defaultSendSubject({ ...x, dataLabel }, church.nume)}
            frame={{ start: `Bună ziua, ${minutesLines({ tip: x.tip, dataLabel, withPdf: true }).join(" ")}`, end: `Cu stimă, Secretariatul bisericii ${church.nume} — trimis din Secretariat Biserică` }}
          />
        ) : null}
        {canWrite && ag ? (
          <Link href={`/documente/nou?tip=convocare&sedinta=${x.id}`} className="btn">
            Convocare (document)
          </Link>
        ) : null}
        {canEdit && !numberLabel ? <AssignNumberButton action={assignMeetingNumberAction.bind(null, x.id)} /> : null}
        {canEdit ? (
          <Link href={`/procese-verbale/${x.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>

      <dl className="detail mb-4">
        <dt>Data și locul</dt>
        <dd>
          {fmt(x.data)}
          {x.ora ? `, ora ${x.ora}` : ""}
          {x.loc ? ` · ${x.loc}` : ""}
        </dd>
        <dt>Tip</dt>
        <dd>
          {x.tip}
          {x.tipAG ? ` ${AG_KIND_LABEL[x.tipAG]}` : ""}
        </dd>
        {x.presedinte ? (
          <>
            <dt>Președinte de ședință</dt>
            <dd>{x.presedinte}</dd>
          </>
        ) : null}
        {x.numarPrezenti != null ? (
          <>
            {/* ATTENDANCE-COUNT: only the number, no names and no absentees. */}
            <dt>Prezenți</dt>
            <dd>
              {x.numarPrezenti} <span className="text-sm text-ink-2">(consemnați doar ca număr)</span>
            </dd>
          </>
        ) : (
          <>
            <dt>Prezenți ({x.prezenti.length})</dt>
            <dd>{x.prezenti.length ? <PersonLinks list={x.prezenti} /> : "—"}</dd>
          </>
        )}
        {x.absenti.length ? (
          <>
            <dt>Absenți ({x.absenti.length})</dt>
            <dd>
              <PersonLinks list={x.absenti} />
              {x.absenti.some((p) => p.motivat) ? (
                <span className="block text-sm text-ink-2">
                  Motivați: {x.absenti.filter((p) => p.motivat).map((p) => p.name).join(", ")}
                </span>
              ) : null}
            </dd>
          </>
        ) : null}
        {x.invitati ? (
          <>
            <dt>Invitați</dt>
            <dd>{x.invitati}</dd>
          </>
        ) : null}
        {lines.adunare ? (
          <>
            <dt>Adunare Generală</dt>
            <dd>{lines.adunare}</dd>
          </>
        ) : null}
        {ag && x.convocareText ? (
          <>
            <dt>Anunțul convocării</dt>
            <dd className="whitespace-pre-wrap">{x.convocareText}</dd>
          </>
        ) : null}
        {lines.cvorum ? (
          <>
            <dt>Cvorum</dt>
            <dd>{lines.cvorum}</dd>
          </>
        ) : null}
        {x.ordine ? (
          <>
            <dt>Ordinea de zi</dt>
            <dd className="whitespace-pre-wrap">{x.ordine}</dd>
          </>
        ) : null}
        <dt>Puncte discutate și aprobate</dt>
        <dd>
          {x.puncte.length ? (
            <ol className="list-decimal pl-5 space-y-1">
              {x.puncte.map((p, i) => {
                const doc = x.puncteRich?.[i];
                return (
                  <li key={i} className={doc ? undefined : "whitespace-pre-wrap"}>
                    {doc ? <RichView doc={doc} /> : p}
                    {lines.voturi?.[i] ? <span className="block text-sm text-ink-2">{lines.voturi[i]}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            "—"
          )}
        </dd>
        {x.sedintaInchisa ? (
          <>
            <dt>Ședință închisă</dt>
            <dd>{CLOSED_SESSION_LINE}</dd>
          </>
        ) : null}
        {x.observatii ? (
          <>
            <dt>Observații</dt>
            <dd className={x.observatiiRich ? undefined : "whitespace-pre-wrap"}>{x.observatiiRich ? <RichView doc={x.observatiiRich} /> : x.observatii}</dd>
          </>
        ) : null}
        <dt>Formula de încheiere</dt>
        <dd>{x.formulaRich ? <RichView doc={x.formulaRich} /> : x.formulaIncheiere}</dd>
      </dl>

      {canEdit && committeeMeeting && x.absenti.length ? (
        <ExcusedForm meetingId={x.id} absent={x.absenti.map((p) => ({ id: p.id, name: p.name, motivat: p.motivat }))} />
      ) : null}

      <Signatures
        meetingId={x.id}
        locked={x.locked}
        canWrite={canWrite}
        canUnlock={permissions.admin(ctx.user.role)}
        emptyText={x.numarPrezenti != null ? "Prezența a fost consemnată doar ca număr: nu se adună semnăturile celor prezenți." : undefined}
        rows={x.prezenti.map((p) => ({
          id: p.id,
          name: p.name,
          image: p.signature ? `data:image/png;base64,${p.signature.png.toString("base64")}` : null,
          signedAt: p.signature ? dotDateTime(p.signature.signedAt) : null,
        }))}
      />

      {x.sends.length ? (
        <div className="card">
          <h3>Trimiteri</h3>
          <ul className="send-list">
            {x.sends.map((s) => (
              <li key={s.id}>
                {s.status === "SENT" ? "Trimis" : <span className="tag tag-warn">Netrimis</span>} la{" "}
                {/* The addresses only for those who may send; viewers see how many. */}
                {canWrite ? s.to.join(", ") : s.to.length === 1 ? "o adresă" : `${s.to.length} adrese`}
                <span className="block text-xs text-ink-3">
                  {dotDateTime(s.sentAt)}
                  {s.sentBy ? ` · ${s.sentBy.name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}

      {canEdit ? (
        <div className="actions">
          <DeleteButton action={deleteMeetingAction.bind(null, x.id)} confirmMessage="Ștergeți procesul-verbal?" />
        </div>
      ) : null}
    </>
  );
}

/** Pastor and Secretar (preselected) and the attendees with an e-mail address, without duplicates. */
function sendRecipients(
  church: { pastor: string; secretar: string; pastorEmail: string; secretarEmail: string },
  attendees: { name: string; email: string }[],
): Recipient[] {
  const list: Recipient[] = [];
  const add = (email: string, label: string, preselected: boolean) => {
    const e = email.trim().toLowerCase();
    if (e && !list.some((r) => r.email === e)) list.push({ email: e, label, preselected });
  };
  add(church.pastorEmail, church.pastor ? `Pastor · ${church.pastor}` : "Pastor", true);
  add(church.secretarEmail, church.secretar ? `Secretar · ${church.secretar}` : "Secretar", true);
  for (const p of attendees) add(p.email, p.name, false);
  return list;
}

function PersonLinks({ list }: { list: { id: string; name: string }[] }) {
  return list.map((p, i) => (
    <span key={p.id}>
      {i ? ", " : ""}
      <Link href={`/persoane/${p.id}`} className="text-ink">
        {p.name}
      </Link>
    </span>
  ));
}
