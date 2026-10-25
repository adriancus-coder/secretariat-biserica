import type { Metadata } from "next";
import { baptismSentence } from "@/lib/baptism";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { ageAt, fromDbDate, todayIso } from "@/lib/dates";
import { fmt, memberName } from "@/lib/format";
import { APARTINATOR_KIND_LABEL, DOCUMENT_TYPE_LABEL, ENTRY_LABEL, EXIT_LABEL, GENDER_LABEL, STATUS_LABEL } from "@/lib/labels";
import { apartinatorKind } from "@/lib/apartinator";
import { permissions } from "@/lib/permissions";
import { getPersonDetail, parseListSpec, personNeighbors } from "@/server/queries/persons";
import { PersonNav } from "@/components/person-nav";
import { listHref, withDin } from "@/lib/person-nav";
import { requireCtx } from "@/server/session";
import { statusTagClass } from "../person-row";
import { NoFamilyActions } from "./family-actions";
import { PersonRemoval } from "./person-removal";
import { PersonAliases } from "./person-aliases";
import { canBeHead } from "@/lib/families";
import { familyOptions } from "@/server/queries/families";
import { getChurch } from "@/server/queries/church";
import { returnedAction } from "@/server/actions/statute";

export async function generateMetadata({ params }: PageProps<"/persoane/[id]">): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireCtx();
  const d = await getPersonDetail(ctx, id);
  return { title: d ? memberName(d.person) : "Persoană" };
}

export default async function PersonPage({ params, searchParams }: PageProps<"/persoane/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const din = typeof sp.din === "string" ? sp.din : undefined;
  const ctx = await requireCtx();
  const detail = await getPersonDetail(ctx, id);
  if (!detail) notFound();
  const nav = await personNeighbors(ctx, id, parseListSpec(din), (await getChurch(ctx)).nomen.rudenie);
  const { person: x, family, groups, responsibleFor, roles, notes, notesCount, documents, audit, aliases } = detail;
  const canWrite = permissions.write(ctx.user.role);
  const today = todayIso();

  const dn = fromDbDate(x.dataNasterii);
  const dm = fromDbDate(x.dataMembru);
  const db = fromDbDate(x.dataBotez);
  const dbin = fromDbDate(x.dataBinecuvantare);
  const di = fromDbDate(x.dataIesire);
  const kind = apartinatorKind({ statut: x.statut, dataNasterii: dn, baptised: Boolean(db || x.botezAn) }, family, x.family?.headId ?? null, today);
  // Aceleași rânduri ca fișa din prototip (showMember).
  const pvLink = (m: { id: string; nr: number | null; anRegistru: number | null; data: Date; tip: string } | null) =>
    m ? (
      <Link href={`/procese-verbale/${m.id}`}>
        {m.nr !== null ? `PV nr. ${m.nr}/${m.anRegistru}` : "Procesul-verbal"} ({m.tip}, {fmt(fromDbDate(m.data)!)})
      </Link>
    ) : null;
  const dcas = fromDbDate(x.dataCasatoriei);
  const dcr = fromDbDate(x.dataCerereRetragere);
  const plecat = fromDbDate(x.plecatDin);
  const parents = [x.numeTata && `tatăl ${x.numeTata}`, x.numeMama && `mama ${x.numeMama}`].filter(Boolean).join(", ");
  const rows: [string, React.ReactNode][] = (
    [
      ["Statut", STATUS_LABEL[x.statut] + (kind ? ` — ${kind}) ${APARTINATOR_KIND_LABEL[kind]} (Statut art. 28)` : "")],
      ["Gen", x.gen ? GENDER_LABEL[x.gen] : ""],
      ["Familie", x.family ? x.family.nume + (x.family.headId === x.id ? " — capul familiei" : x.rudenie ? ` — ${x.rudenie}` : "") : ""],
      ["Data nașterii", dn ? `${fmt(dn)} (${ageAt(dn, today)} ani)` : ""],
      ["Telefon", x.telefon],
      ["E-mail", x.email],
      ["Adresă", x.adresa],
      ["Data căsătoriei", dcas ? fmt(dcas) : ""],
      ["Părinți", parents],
      [
        "Intrare în biserică",
        dm ? (
          <>
            {fmt(dm) + (x.modIntrare ? ` — ${ENTRY_LABEL[x.modIntrare]}` : "") + (x.bisericaProvenienta ? ` de la ${x.bisericaProvenienta}` : "")}
            {x.intrareMeeting ? <> · {pvLink(x.intrareMeeting)}</> : null}
          </>
        ) : (
          ""
        ),
      ],
      ["Botez în apă", baptismSentence({ ...x, data: db ? fmt(db) : "" })],
      ["Binecuvântat ca copil", dbin ? fmt(dbin) : ""],
      [
        "Ieșire",
        di ? (
          <>
            {x.modIesire === "DECES"
              ? `Decedat${x.gen === "F" ? "ă" : ""} la ${fmt(di)}`
              : fmt(di) + (x.modIesire ? ` — ${EXIT_LABEL[x.modIesire]}` : "") + (x.bisericaDestinatie ? ` la ${x.bisericaDestinatie}` : "")}
            {dcr ? ` (cerere scrisă din ${fmt(dcr)})` : ""}
            {x.iesireMeeting ? <> · {pvLink(x.iesireMeeting)}</> : null}
          </>
        ) : (
          ""
        ),
      ],
      ["Plecat temporar", plecat ? `din ${fmt(plecat)}${x.plecatUnde ? `, ${x.plecatUnde}` : ""}` : ""],
      ["Note", x.note],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v);

  return (
    <>
      <BackLink href={listHref(din)}>Persoane</BackLink>
      <PersonNav
        prevHref={nav.prev ? withDin(`/persoane/${nav.prev}`, din) : null}
        nextHref={nav.next ? withDin(`/persoane/${nav.next}`, din) : null}
        position={nav.position}
        total={nav.total}
      />
      <PageHead title={memberName(x)} sub={<span className={statusTagClass(x.statut)}>{STATUS_LABEL[x.statut]}</span>}>
        {canWrite ? (
          <>
            <Link href={`/documente/nou?persoana=${x.id}`} className="btn">
              Document
            </Link>
            <Link href={withDin(`/persoane/${x.id}/editare`, din)} className="btn btn-primary">
              Editează
            </Link>
          </>
        ) : null}
      </PageHead>

      {x.inComitet || roles.length ? (
        <div className="mb-3 grid gap-1.5">
          {x.inComitet ? (
            <div>
              <span className="pill pill-accent">Comitet</span>
            </div>
          ) : null}
          {groupRoles(roles).map((g) => (
            <div key={g.id} aria-label={g.nume}>
              <span className="hint inline mr-1">{g.nume}:</span>
              {g.roles.map((r) => (
                <span key={r.nume} className="pill">
                  {r.nume}
                  {r.since ? ` · din ${fmt(r.since)}` : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {x.application ? (
        <p className="hint mb-3">
          Creat din <Link href={`/cereri/${x.application.id}`}>cererea din {fmt(x.application.createdAt.toISOString().slice(0, 10))}</Link>
        </p>
      ) : null}
      <dl className="detail mb-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="whitespace-pre-wrap">
              {v}
              {k === "Plecat temporar" && canWrite ? (
                <form action={returnedAction.bind(null, x.id)} className="inline ml-2">
                  <button type="submit" className="btn btn-sm">
                    S-a întors
                  </button>
                </form>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="two">
        {!x.family ? (
          <div className="card">
            <h3>Familie</h3>
            {x.familieVeche ? (
              <p className="mb-3">
                Familie în evidența veche: <b>{x.familieVeche}</b>
              </p>
            ) : (
              <p className="hint mb-3">Nu face parte dintr-o familie.</p>
            )}
            {canWrite ? (
              <NoFamilyActions
                personId={x.id}
                canHead={canBeHead({ statut: x.statut, dataNasterii: dn }, today)}
                families={await familyOptions(ctx)}
                rudenie={(await getChurch(ctx)).nomen.rudenie}
              />
            ) : null}
          </div>
        ) : null}
        {x.family ? (
          <div className="card">
            <h3>
              <Link href={`/familii/${x.family.id}`} className="text-ink">
                {x.family.nume}
              </Link>
            </h3>
            {!family.length ? <p className="hint">Singurul membru al familiei.</p> : null}
            {family.map((m) => (
              <Link key={m.id} href={`/persoane/${m.id}`} className="pill">
                {memberName(m)}
                {m.rudenie ? ` · ${m.rudenie}` : ""}
                {m.dataIesire ? " (ieșit)" : ""}
              </Link>
            ))}
            {canWrite ? (
              <div className="mt-2">
                <Link href={`/persoane/nou?familie=${x.family.id}`} className="btn btn-sm">
                  + Membru de familie
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {groups.length || responsibleFor.length ? (
          <div className="card">
            <h3>Grupuri</h3>
            {responsibleFor.length ? (
              <p className="mb-2">
                Responsabil pentru:{" "}
                {responsibleFor.map((g, i) => (
                  <span key={g.id}>
                    {i ? ", " : ""}
                    <Link href={`/grupuri/${g.id}`}>{g.nume}</Link>
                  </span>
                ))}
              </p>
            ) : null}
            {groups.map((g) => (
              <Link key={g.id} href={`/grupuri/${g.id}`} className="pill">
                {g.nume}
                {g.auto ? " (automat)" : ""}
              </Link>
            ))}
          </div>
        ) : null}

        {aliases.length ? <PersonAliases aliases={aliases} canWrite={canWrite} /> : null}

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

      {permissions.admin(ctx.user.role) && x.nume !== "Persoană ștearsă" ? (
        <div className="actions">
          <PersonRemoval personId={x.id} name={memberName(x)} />
        </div>
      ) : null}
    </>
  );
}

/** The person's roles, one entry per group, in display order. */
function groupRoles<R extends { group: { id: string; nume: string } }>(roles: R[]) {
  const out: { id: string; nume: string; roles: R[] }[] = [];
  for (const r of roles) {
    const g = out.find((x) => x.id === r.group.id);
    if (g) g.roles.push(r);
    else out.push({ id: r.group.id, nume: r.group.nume, roles: [r] });
  }
  return out;
}
