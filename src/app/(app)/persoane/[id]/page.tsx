import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { ageAt, fromDbDate, todayIso } from "@/lib/dates";
import { fmt, memberName } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL, ENTRY_LABEL, EXIT_LABEL, GENDER_LABEL, STATUS_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { deletePersonAction } from "@/server/actions/persons";
import { getPersonDetail } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { statusTagClass } from "../person-row";

export async function generateMetadata({ params }: PageProps<"/persoane/[id]">): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireCtx();
  const d = await getPersonDetail(ctx, id);
  return { title: d ? memberName(d.person) : "Persoană" };
}

export default async function PersonPage({ params }: PageProps<"/persoane/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const detail = await getPersonDetail(ctx, id);
  if (!detail) notFound();
  const { person: x, family, groups, notes, notesCount, documents, audit } = detail;
  const canWrite = permissions.write(ctx.user.role);
  const today = todayIso();

  const dn = fromDbDate(x.dataNasterii);
  const dm = fromDbDate(x.dataMembru);
  const db = fromDbDate(x.dataBotez);
  const dbin = fromDbDate(x.dataBinecuvantare);
  const di = fromDbDate(x.dataIesire);
  // Aceleași rânduri ca fișa din prototip (showMember).
  const rows: [string, string][] = (
    [
      ["Statut", STATUS_LABEL[x.statut]],
      ["Gen", x.gen ? GENDER_LABEL[x.gen] : ""],
      ["Familie", x.familie ? x.familie + (x.rudenie ? ` — ${x.rudenie}` : "") : ""],
      ["Data nașterii", dn ? `${fmt(dn)} (${ageAt(dn, today)} ani)` : ""],
      ["Telefon", x.telefon],
      ["E-mail", x.email],
      ["Adresă", x.adresa],
      [
        "Intrare în biserică",
        dm
          ? fmt(dm) +
            (x.modIntrare ? ` — ${ENTRY_LABEL[x.modIntrare]}` : "") +
            (x.bisericaProvenienta ? ` de la ${x.bisericaProvenienta}` : "")
          : "",
      ],
      ["Botezat în apă", db ? fmt(db) + (x.locBotez ? `, ${x.locBotez}` : "") : ""],
      ["Binecuvântat ca copil", dbin ? fmt(dbin) : ""],
      [
        "Ieșire",
        di ? fmt(di) + (x.modIesire ? ` — ${EXIT_LABEL[x.modIesire]}` : "") + (x.bisericaDestinatie ? ` la ${x.bisericaDestinatie}` : "") : "",
      ],
      ["Slujire", x.slujire],
      ["Note", x.note],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <>
      <BackLink href="/persoane">Persoane</BackLink>
      <PageHead title={memberName(x)} sub={<span className={statusTagClass(x.statut)}>{STATUS_LABEL[x.statut]}</span>}>
        {canWrite ? (
          <>
            <Link href={`/documente/nou?persoana=${x.id}`} className="btn">
              Document
            </Link>
            <Link href={`/persoane/${x.id}/editare`} className="btn btn-primary">
              Editează
            </Link>
          </>
        ) : null}
      </PageHead>

      <dl className="detail mb-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="two">
        {family.length ? (
          <div className="card">
            <h3>Familia</h3>
            {family.map((m) => (
              <Link key={m.id} href={`/persoane/${m.id}`} className="pill">
                {memberName(m)}
                {m.rudenie ? ` · ${m.rudenie}` : ""}
                {m.dataIesire ? " (ieșit)" : ""}
              </Link>
            ))}
            {canWrite ? (
              <div className="mt-2">
                <Link href={`/persoane/nou?familie=${encodeURIComponent(x.familie)}`} className="btn btn-sm">
                  + Membru de familie
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {groups.length ? (
          <div className="card">
            <h3>Grupuri</h3>
            {groups.map((g) => (
              <Link key={g.id} href={`/grupuri/${g.id}`} className="pill">
                {g.nume}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="card">
          <h3>Mențiuni ({notesCount})</h3>
          {notes.length ? (
            <ul>
              {notes.map((n) => (
                <li key={n.id} className="py-1.5 border-b border-line last:border-0">
                  <Link href={`/mentiuni/${n.id}`} className="no-underline text-ink block">
                    <span className="hint">
                      {fmt(fromDbDate(n.data))} · {n.tip}
                    </span>
                    <br />
                    <span className="whitespace-pre-wrap">{n.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Nicio mențiune.</div>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {canWrite ? (
              <Link href={`/mentiuni/nou?persoana=${x.id}`} className="btn btn-sm">
                + Mențiune
              </Link>
            ) : null}
            {notesCount > notes.length ? (
              <Link href={`/mentiuni?persoana=${x.id}`} className="btn btn-sm btn-ghost">
                Toate mențiunile
              </Link>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h3>Documente eliberate ({documents.length})</h3>
          {documents.length ? (
            <ul>
              {documents.map((d) => (
                <li key={d.id} className="py-1">
                  <Link href={`/documente/${d.id}`}>
                    Nr. {d.nr}/{d.anRegistru}
                  </Link>{" "}
                  — {d.titlu || DOCUMENT_TYPE_LABEL[d.tip]} <span className="hint inline">({fmt(fromDbDate(d.data))})</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Niciun document.</div>
          )}
        </div>
      </div>

      {permissions.audit(ctx.user.role) ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}

      {canWrite ? (
        <div className="actions">
          <DeleteButton
            action={deletePersonAction.bind(null, x.id)}
            confirmMessage="Ștergeți persoana din registru? Prezența la ședințe și apartenența la grupuri se vor șterge; mențiunile și documentele rămân."
          />
        </div>
      ) : null}
    </>
  );
}
