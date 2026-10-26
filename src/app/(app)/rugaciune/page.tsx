import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { loadPrayerPage } from "@/server/queries/prayer";
import { requireCtx } from "@/server/session";
import { PrayerWeekCard } from "./prayer-week-card";

export const metadata: Metadata = { title: "Rugăciune" };

/**
 * The weekly prayer for families: the family of the week (surname and the parents' first names; the
 * children only with the parents' consent), mark / cancel / skip, the message to copy and the last 12
 * weeks. Nothing else from the register: no search, no list, no contact data. The only register page
 * of the "Rugăciune" role.
 */
export default async function PrayerPage({ searchParams }: PageProps<"/rugaciune">) {
  const ctx = await requireCtx("rugaciune");
  const sp = await searchParams;
  const skip = Math.max(0, Math.min(500, Number.parseInt(typeof sp.sari === "string" ? sp.sari : "0", 10) || 0));
  const d = await loadPrayerPage(ctx, skip);
  const label = d.marked?.label ?? d.next?.label ?? null;
  return (
    <>
      <PageHead title="Rugăciunea săptămânală" sub={`Săptămâna din ${fmt(d.week)}`} />
      {d.review ? (
        <div className="alert" role="note">
          {d.review.href ? (
            <>
              Datele familiei trebuie verificate înainte de trimitere. <Link href={d.review.href} className="underline">Deschide familia</Link>
            </>
          ) : (
            "Verificați textul înainte de trimitere."
          )}
        </div>
      ) : null}
      <PrayerWeekCard
        key={`${d.week}:${d.marked?.key ?? d.next?.key ?? ""}`}
        week={d.week}
        unitKey={d.marked?.key ?? d.next?.key ?? null}
        label={label}
        nextKey={d.next?.key ?? null}
        marked={Boolean(d.marked)}
        skipHref={d.total > 1 ? `/rugaciune?sari=${skip + 1}` : null}
        message={d.message}
      />
      <section className="card">
        <h3>Ultimele săptămâni</h3>
        {d.history.length ? (
          <ul className="list-plain space-y-2">
            {d.history.map((h) => (
              <li key={h.week} className="flex flex-wrap gap-x-3">
                <span className="hint !mt-0 tabular-nums">{fmt(h.week)}</span>
                <span>{h.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nicio săptămână marcată încă.</p>
        )}
      </section>
      <p className="hint">
        Se arată doar numele familiilor din rotație ({d.total}). Familiile care au cerut să nu fie pomenite nu apar; prenumele copiilor apar
        doar cu acordul părinților.
        {permissions.admin(ctx.user) ? (
          <>
            {" "}
            Textul mesajului se schimbă din <Link href="/setari#rugaciune">Setări</Link>.
          </>
        ) : null}
      </p>
    </>
  );
}
