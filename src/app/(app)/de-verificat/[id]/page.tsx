import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { childChanges, displayValue, prayerChanges, selfChanges, type FieldChange } from "@/lib/data-update-review";
import { answersForFamily } from "@/lib/prayer";
import { currentPrayer } from "@/server/review";
import { dotDateTime } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { CHILD_FIELDS, CHILD_LABEL, type DataUpdateProposal } from "@/lib/schemas/data-update";
import { CONSENT_LABEL, OPTIONAL_CONSENTS } from "@/lib/labels";
import { idSchema } from "@/lib/validation";
import { childSnapshot, selfSnapshot } from "@/server/data-update";
import { requireCtx } from "@/server/session";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "De verificat" };

/** One submission: actual → proposed per field, with a checkbox each (all checked). */
function Changes({ changes, prefix }: { changes: FieldChange<string>[]; prefix: string }) {
  if (!changes.length) return <p className="hint">Nicio modificare.</p>;
  return (
    <div className="table-scroll">
      <table className="review-table">
        <thead>
          <tr>
            <th>Ia</th>
            <th>Câmp</th>
            <th>Acum în evidență</th>
            <th>Propus</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field}>
              <td>
                <input type="checkbox" name={`${prefix}${c.field}`} defaultChecked aria-label={`Ia ${c.label}`} />
              </td>
              <th scope="row">{c.label}</th>
              <td className="review-old">{c.before}</td>
              <td className="review-new">{c.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const answers = (c: Record<string, boolean>) => OPTIONAL_CONSENTS.map((k) => `${CONSENT_LABEL[k]}: ${c[k] ? "Da" : "Nu"}`).join(" · ");

export default async function ReviewPage({ params }: PageProps<"/de-verificat/[id]">) {
  const ctx = await requireCtx("write");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const s = await ctx.db.dataUpdateSubmission.findUnique({ where: { id }, include: { campaign: { select: { nume: true } } } });
  if (!s) notFound();
  const p = s.proposed as unknown as DataUpdateProposal;
  const person = s.personId ? await ctx.db.person.findUnique({ where: { id: s.personId }, include: { family: { select: { headId: true } } } }) : null;
  // The weekly prayer answers, against the family's (or the person's) current choice.
  const prayer = p.prayer && person && answersForFamily(person) ? prayerChanges(await currentPrayer(ctx.db, person), p.prayer) : null;
  const registerChildren = await ctx.db.person.findMany({ where: { id: { in: p.children.map((c) => c.id).filter((x): x is string => Boolean(x)) } } });
  const candidates =
    s.via === "GENERAL"
      ? await ctx.db.person.findMany({ where: { dataIesire: null }, orderBy: [{ sortKey: "asc" }, { id: "asc" }], select: { id: true, nume: true, prenume: true, telefon: true } })
      : [];
  const pending = s.status === "PENDING";
  const title = person ? memberName(person) : `${p.self.prenume} ${p.self.nume}`.trim();
  return (
    <>
      <BackLink href="/de-verificat">De verificat</BackLink>
      <PageHead title={title} sub={`${s.campaign.nume} · ${s.via === "PERSONAL" ? "link personal" : "link general"} · ${dotDateTime(s.updatedAt)}`} />
      {!pending ? <p className="alert mb-3">Răspunsul a fost deja verificat.</p> : null}
      <ReviewForm id={s.id} readOnly={!pending}>
        {s.via === "GENERAL" ? (
          <div className="card">
            <h3>Persoana din evidență</h3>
            <p className="hint mb-2">
              La identificare a scris: „{p.typed?.nume}”, telefon „{p.typed?.telefon}”. {person ? "Se potrivește cu persoana de mai jos." : "Nu se potrivește cu nicio persoană (sau cu mai multe)."}
            </p>
            <label htmlFor="persoana" className="block font-medium mb-1">
              Aplică pentru
            </label>
            <select id="persoana" name="persoana" defaultValue={person?.id ?? "nou"}>
              <option value="nou">Creează persoană nouă</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {memberName(c)}
                  {c.telefon ? ` · ${c.telefon}` : ""}
                </option>
              ))}
            </select>
            <p className="hint mt-1">Diferențele de mai jos sunt față de persoana găsită; dacă alegeți alta, se aplică câmpurile bifate.</p>
          </div>
        ) : null}
        <div className="card">
          <h3>Datele persoanei</h3>
          <Changes changes={selfChanges(person ? selfSnapshot(person) : null, p.self)} prefix="s:" />
          <p className="hint mt-2">Acorduri: {answers(p.consents)}{s.via === "GENERAL" ? " — se înregistrează la aprobare." : ""}</p>
        </div>
        {prayer ? (
          <div className="card">
            <h3>Rugăciunea săptămânală</h3>
            <Changes changes={prayer} prefix="r:" />
            <p className="hint mt-2">Se aplică familiei. Dacă și celălalt părinte a răspuns, rămâne varianta mai restrictivă.</p>
          </div>
        ) : null}
        {p.children.length ? (
          <div className="card">
            <h3>Copii</h3>
            {p.children.map((c, i) => {
              const reg = c.id ? registerChildren.find((r) => r.id === c.id) : undefined;
              return (
                <div key={i} className="child-block">
                  <h4>
                    {reg ? <Link href={`/persoane/${reg.id}`}>{memberName(reg)}</Link> : `Copil nou: ${c.prenume} ${c.nume}`}
                  </h4>
                  {reg ? (
                    <Changes changes={childChanges(childSnapshot(reg), c)} prefix={`c:${c.id}:`} />
                  ) : (
                    <>
                      <ul className="hint mb-2">
                        {CHILD_FIELDS.map((f) => (
                          <li key={f}>
                            {CHILD_LABEL[f]}: {displayValue(f, c[f])}
                          </li>
                        ))}
                      </ul>
                      <label className="check">
                        <input type="checkbox" name={`n:${i}`} defaultChecked /> Creează copilul în familia persoanei
                      </label>
                    </>
                  )}
                  <p className="hint">Acorduri date de părinte: {answers(c.consents)}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </ReviewForm>
    </>
  );
}
