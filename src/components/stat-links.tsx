import Link from "next/link";
import type { CategoryContext } from "@/domain/categories";
import { categoryHref } from "@/lib/category-params";

const FIGURES: [key: string, label: string][] = [
  ["toti", "în evidență"],
  ["membri", "membri"],
  ["apartinatori", "aparținători"],
  ["prieteni", "prieteni"],
  ["copii-minori", "copii minori"],
  ["copii-membri", "copii ai membrilor"],
  ["botezati", "botezați"],
  ["intrati-botez", "botezați în an"],
  ["intrati-transfer", "transferați"],
  ["reprimiti", "reprimiți"],
  ["binecuvantati", "binecuvântați"],
  ["iesiti-an", "ieșiri"],
];

/** The figures of a year as links to their lists (the dare de seamă page). */
export function StatLinks({ ctx, year }: { ctx: CategoryContext; year: number }) {
  return (
    <ul className="stat-links">
      {FIGURES.map(([key, label]) => (
        <li key={key}>
          <Link href={categoryHref(key, year)}>
            <b>{ctx.ids(key)?.length ?? 0}</b> {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
