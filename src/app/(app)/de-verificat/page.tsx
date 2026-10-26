import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { formatAddress } from "@/lib/address";
import { dotDateTime } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { NameRow } from "@/components/ui/name-row";
import type { DataUpdateProposal } from "@/lib/schemas/data-update";
import { ADDRESS_REVIEW_REASON, addressReviewWhere } from "@/server/queries/address-review";
import { FAMILY_REVIEW_TITLE, familiesToReview } from "@/server/queries/family-review";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "De verificat" };

/** Data-update submissions waiting for the secretary (personal and general links). */
export default async function ReviewQueuePage() {
  const ctx = await requireCtx("write");
  const rows = await ctx.db.dataUpdateSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { updatedAt: "asc" },
    include: { campaign: { select: { nume: true } }, person: { select: { nume: true, prenume: true } } },
  });
  const ADDRESS_LIMIT = 200;
  const [addressTotal, addresses, families] = await Promise.all([
    ctx.db.person.count({ where: addressReviewWhere }),
    ctx.db.person.findMany({ where: addressReviewWhere, orderBy: { sortKey: "asc" }, take: ADDRESS_LIMIT, select: { id: true, nume: true, prenume: true, adresa: true, localitate: true } }),
    familiesToReview(ctx.db),
  ]);
  return (
    <>
      <PageHead title="De verificat" sub="Datele trimise prin campania de actualizare ajung în evidență doar după aprobare" />
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => {
            const p = r.proposed as unknown as DataUpdateProposal;
            return (
              <li key={r.id}>
                <Link href={`/de-verificat/${r.id}`} className="item">
                  <span className="grow min-w-0">
                    <NameRow
                      name={<b>{r.person ? memberName(r.person) : `${p.self.prenume} ${p.self.nume}`.trim()}</b>}
                      detail={`${r.campaign.nume} · ${r.via === "PERSONAL" ? "link personal" : r.person ? "link general, potrivit" : "link general, nepotrivit"} · ${dotDateTime(r.updatedAt)}${p.children.length ? ` · ${p.children.length} ${p.children.length === 1 ? "copil" : "copii"}` : ""}`}
                    />
                  </span>
                  <span className={r.via === "GENERAL" && !r.person ? "tag tag-warn" : "tag"}>{r.via === "PERSONAL" ? "Personal" : "General"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        addresses.length || families.length ? null : <EmptyState title="Nimic de verificat" />
      )}
      {addresses.length ? (
        <section className="mt-6" aria-labelledby="adrese-de-verificat">
          <h2 id="adrese-de-verificat" className="text-base font-semibold mb-1">
            Adrese de verificat ({addressTotal})
          </h2>
          <p className="hint mb-3">{ADDRESS_REVIEW_REASON}. Adăugați codul poștal în fișa persoanei; localitatea se completează singură.</p>
          <ul className="list">
            {addresses.map((p) => (
              <li key={p.id}>
                <Link href={`/persoane/${p.id}/editare`} className="item">
                  <span className="grow min-w-0">
                    <NameRow name={<b>{memberName(p)}</b>} detail={`${ADDRESS_REVIEW_REASON} · ${formatAddress(p)}`} />
                  </span>
                  <span className="tag tag-warn">Adresă</span>
                </Link>
              </li>
            ))}
          </ul>
          {addressTotal > addresses.length ? <p className="hint mt-2">Primele {addresses.length} din {addressTotal}.</p> : null}
        </section>
      ) : null}
      {families.length ? (
        <section className="mt-6" aria-labelledby="familii-de-verificat">
          <h2 id="familii-de-verificat" className="text-base font-semibold mb-1">
            {FAMILY_REVIEW_TITLE} ({families.length})
          </h2>
          <p className="hint mb-3">Rudeniile decid cine apare în mesajul rugăciunii săptămânale. Corectați-le în fișa familiei; nimic nu se schimbă singur.</p>
          <ul className="list">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/familii/${f.id}`} className="item">
                  <span className="grow min-w-0">
                    <NameRow name={<b>{f.nume}</b>} detail={f.reasons.join(" · ")} />
                  </span>
                  <span className="tag tag-warn">Rudenii</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
