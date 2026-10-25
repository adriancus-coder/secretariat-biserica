import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { ParamSelect } from "@/components/ui/param-select";
import { SearchBox } from "@/components/ui/search-box";
import { todayIso } from "@/lib/dates";
import { initial } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { COMMITTEE_FILTER, NO_FAMILY_FILTER } from "@/lib/roles";
import { listQuery } from "@/lib/person-nav";
import { idSchema } from "@/lib/validation";
import { getChurch } from "@/server/queries/church";
import {
  listFamilies,
  listPersons,
  PERSON_FILTER_LABEL,
  PERSON_FILTERS,
  type PersonFilter,
} from "@/server/queries/persons";
import { listRoleGroups } from "@/server/queries/roles";
import { selectionIds } from "@/server/queries/categories";
import { CATEGORIES } from "@/domain/categories";
import { parseCategorySelection, selectionLabel } from "@/lib/category-params";
import { requireCtx } from "@/server/session";
import { PersonRow } from "./person-row";

export const metadata: Metadata = { title: "Persoane" };

export default async function PersonsPage({ searchParams }: PageProps<"/persoane">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const filter: PersonFilter = (PERSON_FILTERS as readonly string[]).includes(stringParam(sp.filtru))
    ? (stringParam(sp.filtru) as PersonFilter)
    : "membri";
  const byFamily = stringParam(sp.vedere) === "familii";
  const q = stringParam(sp.q).slice(0, 100);
  const page = pageParam(sp.pagina);
  const today = todayIso();
  const canWrite = permissions.write(ctx.user.role);
  const groups = await listRoleGroups(ctx);
  const roles = groups.flatMap((g) => g.roles);
  const rawRole = stringParam(sp.functie);
  const functie =
    rawRole === COMMITTEE_FILTER || rawRole === NO_FAMILY_FILTER || (idSchema.safeParse(rawRole).success && roles.some((r) => r.id === rawRole))
      ? rawRole
      : "";
  // ?categorie=…&an=…: the persons behind a statistic (several categories = any of them).
  const selection = parseCategorySelection((k) => sp[k], Number(today.slice(0, 4)));
  const categoryIds = selection.keys.length ? await selectionIds(ctx, { ...selection, functie }) : null;
  const params = {
    filtru: filter === "membri" || categoryIds ? undefined : filter,
    vedere: byFamily ? "familii" : undefined,
    q: q || undefined,
    functie: functie || undefined,
    categorie: selection.keys.join(",") || undefined,
    an: selection.keys.length && selection.year ? String(selection.year) : undefined,
    mod: selection.keys.length > 1 && selection.mode === "toate" ? "toate" : undefined,
  };

  // Person pages opened from here follow this list with "‹ Anterior" / "Următorul ›".
  const din = listQuery(params);
  const church = byFamily ? await getChurch(ctx) : null;
  const data = byFamily
    ? await listFamilies(ctx, { filter, q, page, functie, ids: categoryIds }, church!.nomen.rudenie)
    : await listPersons(ctx, { filter, q, page, functie, ids: categoryIds });
  const exportQuery = new URLSearchParams();
  for (const k of selection.keys) exportQuery.append("categorie", k);
  if (selection.year) exportQuery.set("an", String(selection.year));
  if (selection.mode === "toate") exportQuery.set("mod", "toate");
  if (functie && /^[A-Za-z0-9_-]+$/.test(functie)) exportQuery.set("functie", functie);
  const exportHref = `/persoane/export?${exportQuery}`;
  const categoryOptions = CATEGORIES.map((c) => ({ value: c.key, label: c.label, group: c.group }));
  const roleOptions = [
    { value: COMMITTEE_FILTER, label: "Comitet" },
    { value: NO_FAMILY_FILTER, label: "Fără familie" },
    ...groups.flatMap((g) => g.roles.filter((r) => r.holders > 0 || r.active).map((r) => ({ value: r.id, label: r.nume, group: g.nume }))),
  ];
  const empty = byFamily ? (data as Awaited<ReturnType<typeof listFamilies>>).groups.length === 0 : data.total === 0;

  return (
    <>
      <PageHead title="Persoane" sub={`${data.inRecord} în evidență`}>
        {canWrite ? (
          <Link href="/persoane/din-document" className="btn">
            Adaugă din document
          </Link>
        ) : null}
        {canWrite ? (
          <Link href="/persoane/nou" className="btn btn-primary">
            + Adaugă
          </Link>
        ) : null}
      </PageHead>

      {categoryIds ? (
        <div className="category-head">
          <h2>
            {selectionLabel(selection)} ({categoryIds.length})
          </h2>
          <p className="hint !mt-0">
            {selection.year ? `Anul ${selection.year}` : "Situația la zi"}
            {q || functie ? " · filtrată și după căutare sau funcție" : ""} ·{" "}
            <Link href={hrefWith("/persoane", params, { categorie: null, an: null, mod: null, pagina: null })}>Arată toată lista</Link>
          </p>
          {permissions.export(ctx.user.role) ? (
            <Link href={exportHref} className="btn btn-sm mt-2">
              Exportă lista
            </Link>
          ) : null}
        </div>
      ) : (
        <nav className="segs" aria-label="Filtru">
          {PERSON_FILTERS.map((f) => (
            <Link
              key={f}
              href={hrefWith("/persoane", params, { filtru: f === "membri" ? null : f, pagina: null })}
              aria-current={filter === f ? "true" : undefined}
            >
              {PERSON_FILTER_LABEL[f]}
            </Link>
          ))}
        </nav>
      )}

      <div className="toolbar">
        <Suspense>
          <SearchBox placeholder="Caută nume, telefon, e-mail" />
        </Suspense>
        <Suspense>
          <ParamSelect param="categorie" label="Categorie din statistică" emptyLabel="Toate categoriile" options={categoryOptions} />
        </Suspense>
        {roleOptions.length ? (
          <Suspense>
            <ParamSelect param="functie" label="Filtru: comitet, familie, funcție sau slujire" emptyLabel="Toți (fără filtru)" options={roleOptions} />
          </Suspense>
        ) : null}
        <Link
          href={hrefWith("/persoane", params, { vedere: byFamily ? null : "familii", pagina: null })}
          className="btn btn-sm self-center"
        >
          {byFamily ? "Listă" : "Pe familii"}
        </Link>
      </div>

      {empty ? (
        <EmptyState title={data.anyPerson ? "Niciun rezultat" : "Registrul e gol"}>
          {data.anyPerson ? "Schimbați căutarea sau filtrul." : "Adăugați prima persoană cu butonul de mai sus."}
        </EmptyState>
      ) : byFamily ? (
        <FamilyList data={data as Awaited<ReturnType<typeof listFamilies>>} today={today} din={din} />
      ) : (
        <AlphaList items={(data as Awaited<ReturnType<typeof listPersons>>).items} today={today} din={din} />
      )}

      <Pager
        pathname="/persoane"
        params={params}
        page={data.page}
        pages={data.pages}
        summary={
          byFamily
            ? `${(data as Awaited<ReturnType<typeof listFamilies>>).families} familii, ${data.total} persoane`
            : `${data.total} persoane`
        }
      />
    </>
  );
}

function AlphaList({ items, today, din }: { items: Awaited<ReturnType<typeof listPersons>>["items"]; today: string; din: string }) {
  const out: React.ReactNode[] = [];
  let last = "";
  for (const p of items) {
    const letter = initial(p.nume);
    if (letter !== last) {
      last = letter;
      out.push(
        <div key={`l-${p.id}`} className="letter">
          {letter}
        </div>,
      );
    }
    out.push(<PersonRow key={p.id} p={p} byFamily={false} today={today} din={din} />);
  }
  return <div className="list">{out}</div>;
}

function FamilyList({ data, today, din }: { data: Awaited<ReturnType<typeof listFamilies>>; today: string; din: string }) {
  return (
    <div className="list">
      {data.groups.map((g) => (
        <section key={g.familyId ?? "fara-familie"} aria-label={g.label}>
          <div className="letter">
            {g.familyId ? (
              <Link href={`/familii/${g.familyId}`} className="text-inherit no-underline hover:underline">
                {g.label}
              </Link>
            ) : (
              g.label
            )}{" "}
            <span className="hint inline">· {g.count}</span>
          </div>
          {g.members.map((p) => (
            <PersonRow key={p.id} p={p} byFamily today={today} din={din} />
          ))}
        </section>
      ))}
    </div>
  );
}
