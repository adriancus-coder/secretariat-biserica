import type { Metadata } from "next";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { CONSENT_LABEL, OPTIONAL_CONSENTS } from "@/lib/labels";
import type { DataUpdateProposal } from "@/lib/schemas/data-update";
import { personalIdentityOk, resolvePersonalLink } from "@/server/data-update";
import { tenantDb } from "@/server/tenant-db";
import { InvalidLink } from "../../shared";

export const metadata: Metadata = { title: "Date trimise", robots: { index: false } };

/** Confirmation of a personal link, with a summary while the identity is still confirmed. */
export default async function PersonalSentPage({ params }: PageProps<"/actualizare/[token]/trimis">) {
  const { token } = await params;
  const r = await resolvePersonalLink(token);
  if (r.state !== "ok") return <InvalidLink />;
  const show = await personalIdentityOk(r.link);
  const pending = show
    ? await tenantDb(r.link.churchId).dataUpdateSubmission.findFirst({ where: { linkId: r.link.id, status: "PENDING" }, orderBy: { updatedAt: "desc" } })
    : null;
  const p = pending ? (pending.proposed as unknown as DataUpdateProposal) : null;
  return (
    <>
      <h2 className="text-2xl mb-2">Mulțumim!</h2>
      <p className="mb-3">Datele au fost trimise. Secretariatul le verifică înainte să ajungă în evidență.</p>
      {p ? (
        <div className="card">
          <h3>Ce ați trimis</h3>
          <ul className="list-disc pl-5 mb-2">
            <li>
              {p.self.prenume} {p.self.nume}
              {p.self.telefon ? ` · ${p.self.telefon}` : ""}
              {p.self.email ? ` · ${p.self.email}` : ""}
            </li>
            {p.children.map((c, i) => (
              <li key={i}>
                Copil: {c.prenume} {c.nume}
                {c.dataNasterii ? `, născut(ă) la ${fmt(c.dataNasterii)}` : ""}
              </li>
            ))}
          </ul>
          <p className="hint">
            Acorduri: {OPTIONAL_CONSENTS.map((k) => `${CONSENT_LABEL[k]}: ${p.consents[k] ? "Da" : "Nu"}`).join(" · ")}
          </p>
        </div>
      ) : null}
      <p className="hint mt-3">
        Puteți modifica datele până la {fmt(r.campaign.deadline)}: <Link href={`/actualizare/${token}`}>deschideți din nou formularul</Link>.
      </p>
    </>
  );
}
