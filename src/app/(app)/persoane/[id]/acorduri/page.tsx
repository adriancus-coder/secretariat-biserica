import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { consentState, CONSENT_STATE_LABEL, currentConsents } from "@/lib/consents";
import { ageAt, dotDateTime, fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { CONSENT_KINDS, CONSENT_LABEL, CONSENT_SOURCE_LABEL } from "@/lib/labels";
import { idSchema } from "@/lib/validation";
import { withdrawConsentAction } from "@/server/actions/consents";
import { requireCtx } from "@/server/session";
import { PaperConsentForm } from "./paper-form";

export const metadata: Metadata = { title: "Acorduri GDPR" };

/** A person's consents: current answers, withdrawal and paper forms (secretariat). */
export default async function ConsentsPage({ params }: PageProps<"/persoane/[id]/acorduri">) {
  const ctx = await requireCtx("write");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const person = await ctx.db.person.findUnique({ where: { id }, select: { id: true, nume: true, prenume: true, dataNasterii: true, familyId: true } });
  if (!person) notFound();
  const rows = await ctx.db.consent.findMany({ where: { personId: id }, include: { givenBy: { select: { nume: true, prenume: true } } } });
  const cur = currentConsents(rows);
  const dn = fromDbDate(person.dataNasterii);
  const minor = dn !== null && ageAt(dn, todayIso()) < 18;
  const parents =
    minor && person.familyId
      ? (await ctx.db.person.findMany({ where: { familyId: person.familyId, id: { not: id }, dataIesire: null }, select: { id: true, nume: true, prenume: true, dataNasterii: true } }))
          .filter((p) => !p.dataNasterii || ageAt(fromDbDate(p.dataNasterii)!, todayIso()) >= 18)
          .map((p) => ({ id: p.id, name: memberName(p) }))
      : [];
  return (
    <>
      <BackLink href={`/persoane/${id}`}>{memberName(person)}</BackLink>
      <PageHead title="Acorduri GDPR" sub="Nota de informare și cele patru acorduri opționale" />
      <div className="card">
        <ul className="list">
          {CONSENT_KINDS.map((k) => {
            const r = cur[k];
            const st = consentState(r);
            return (
              <li key={k} className="item flex-wrap gap-2">
                <span className="grow min-w-0">
                  <b>{CONSENT_LABEL[k]}</b>: {k === "INFO_NOTE" && st === "DA" ? "confirmată" : CONSENT_STATE_LABEL[st]}
                  {r ? (
                    <span className="hint block">
                      {dotDateTime(r.givenAt).slice(0, 10)} · {CONSENT_SOURCE_LABEL[r.source]}
                      {r.givenBy ? ` · dat de ${memberName(r.givenBy)}` : ""}
                      {r.withdrawnAt ? ` · retras la ${dotDateTime(r.withdrawnAt).slice(0, 10)}` : ""}
                    </span>
                  ) : null}
                </span>
                {r && !r.withdrawnAt && r.granted ? (
                  <form action={withdrawConsentAction.bind(null, id, k)}>
                    <button type="submit" className="btn btn-sm">
                      Retrage acordul
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card">
        <h3>Înregistrează acord pe hârtie</h3>
        <PaperConsentForm personId={id} parents={parents} />
      </div>
    </>
  );
}
