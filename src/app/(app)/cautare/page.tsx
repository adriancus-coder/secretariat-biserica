import type { Metadata } from "next";
import Link from "next/link";
import { GlobalSearch } from "@/components/global-search";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, stringParam } from "@/components/ui/pager";
import { permissions } from "@/lib/permissions";
import { SEARCH_GROUPS, SEARCH_MIN, searchData, searchPageGroup, type SearchGroupKey } from "@/server/global-search";
import { requireUser } from "@/server/session";
import { tenantDb } from "@/server/tenant-db";

export const metadata: Metadata = { title: "Căutare" };

/**
 * GLOBAL-SEARCH: the complete results (`?q=`), or one group's (`&grup=`). Every signed-in user: the pages
 * he may open; the church's data only with `read` (never for the Rugăciune role).
 */
export default async function SearchPage({ searchParams }: PageProps<"/cautare">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = stringParam(sp.q).slice(0, 100);
  const rawGroup = stringParam(sp.grup);
  const only = (SEARCH_GROUPS as readonly string[]).includes(rawGroup) ? (rawGroup as SearchGroupKey) : undefined;
  const ctx = { user, db: tenantDb(user.churchId) };
  const pages = !only || only === "pagini" ? searchPageGroup(ctx, q, 50) : null;
  const data = permissions.read(user) && only !== "pagini" ? await searchData(ctx, q, only ? 100 : 20, only) : [];
  const groups = [...(pages ? [pages] : []), ...data];
  return (
    <>
      <PageHead title="Căutare" sub={only ? "Toate rezultatele grupei" : "Pagini, setări și datele bisericii"} />
      <div className="mb-4">
        <GlobalSearch initial={q} autoFocus={!q} variant="page" />
      </div>
      {only ? (
        <p className="mb-3">
          <Link href={hrefWith("/cautare", { q }, {})}>‹ Toate grupele</Link>
        </p>
      ) : null}
      {q.trim().length < SEARCH_MIN ? (
        <p className="hint">Scrieți cel puțin {SEARCH_MIN} litere.</p>
      ) : groups.length ? (
        groups.map((g) => (
          <section key={g.key} className="card" aria-label={g.label}>
            <h3>
              {g.label} ({g.total})
            </h3>
            <div className="list">
              {g.items.map((h) => (
                <Link key={h.href + h.title} href={h.href} className="item">
                  <div className="body">
                    <div className="t">{h.title}</div>
                    {h.subtitle ? <div className="m">{h.subtitle}</div> : null}
                  </div>
                </Link>
              ))}
            </div>
            {g.total > g.items.length ? (
              <p className="mt-2">
                <Link href={hrefWith("/cautare", { q }, { grup: g.key })}>Vezi toate ({g.total})</Link>
              </p>
            ) : null}
          </section>
        ))
      ) : (
        <EmptyState title="Niciun rezultat">Încercați alte cuvinte (diacriticele nu contează).</EmptyState>
      )}
    </>
  );
}
