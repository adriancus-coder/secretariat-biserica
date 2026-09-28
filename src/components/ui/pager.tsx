import Link from "next/link";

/** Construiește un href păstrând parametrii existenți și suprascriind câțiva. */
export function hrefWith(
  pathname: string,
  current: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === "string" && v !== "") sp.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function Pager({
  pathname,
  params,
  page,
  pages,
  summary,
}: {
  pathname: string;
  params: Record<string, string | string[] | undefined>;
  page: number;
  pages: number;
  summary?: string;
}) {
  if (pages <= 1) return summary ? <div className="pager">{summary}</div> : null;
  return (
    <nav className="pager" aria-label="Paginare">
      {page > 1 ? (
        <Link className="btn btn-sm" href={hrefWith(pathname, params, { pagina: page - 1 === 1 ? null : page - 1 })}>
          ‹ Înapoi
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled="true">
          ‹ Înapoi
        </span>
      )}
      <span>
        Pagina {page} din {pages}
        {summary ? ` · ${summary}` : ""}
      </span>
      {page < pages ? (
        <Link className="btn btn-sm" href={hrefWith(pathname, params, { pagina: page + 1 })}>
          Înainte ›
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled="true">
          Înainte ›
        </span>
      )}
    </nav>
  );
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(typeof v === "string" ? v : 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function stringParam(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}
