import Link from "next/link";
import type { AgeFilter, GenderAge, GenderAgeCounts } from "@/domain/categories";
import { AGE_FILTER_LABEL, GENDER_FILTER_LABEL } from "@/lib/category-params";
import { hrefWith } from "./pager";

/**
 * GENDER-AGE-FILTERS: „Gen: Toți · Bărbați · Femei” and „Vârstă: Toți · Adulți · Minori”, each with its
 * number, kept in the URL (`gen`, `varsta`); „fără gen completat: N” beside them when there are any.
 */
export function GenderAgeFilters({
  pathname,
  params,
  current,
  counts,
}: {
  pathname: string;
  /** The list's other parameters (kept by every link). */
  params: Record<string, string | undefined>;
  current: GenderAge;
  counts: GenderAgeCounts;
}) {
  const link = (over: Record<string, string | null>) => hrefWith(pathname, params, { ...over, pagina: null });
  const genders = ["toti", "M", "F"] as const;
  const ages: AgeFilter[] = ["toti", "adulti", "minori"];
  return (
    <div className="ga-filters">
      <nav className="segs" aria-label="Gen">
        <span className="ga-label">Gen:</span>
        {genders.map((g) => (
          <Link key={g} href={link({ gen: g === "toti" ? null : g })} aria-current={current.gen === g ? "true" : undefined}>
            {current.gen === g ? "✓ " : ""}
            {GENDER_FILTER_LABEL[g]} ({counts.gen[g]})
          </Link>
        ))}
      </nav>
      <nav className="segs" aria-label="Vârstă">
        <span className="ga-label">Vârstă:</span>
        {ages.map((a) => (
          <Link key={a} href={link({ varsta: a === "toti" ? null : a })} aria-current={current.varsta === a ? "true" : undefined}>
            {current.varsta === a ? "✓ " : ""}
            {AGE_FILTER_LABEL[a]} ({counts.varsta[a]})
          </Link>
        ))}
      </nav>
      {counts.faraGen > 0 || current.gen === "fara" ? (
        <p className="hint !mt-0 mb-3">
          {current.gen === "fara" ? (
            <>
              Doar persoanele fără gen completat · <Link href={link({ gen: null })}>Arată toate genurile</Link>
            </>
          ) : (
            <Link href={link({ gen: "fara" })}>fără gen completat: {counts.faraGen}</Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
