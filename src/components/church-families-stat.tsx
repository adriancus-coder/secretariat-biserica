import Link from "next/link";
import { CHURCH_FAMILIES_LABEL, OTHER_FAMILIES_HINT, otherFamiliesLine } from "@/lib/labels";

/**
 * FAMILIES-WORDING: the church's families, with the other families of the register as a small link under
 * the figure (never a card of their own, so the row keeps its three cards).
 */
export function ChurchFamiliesStat({ count, others }: { count: number; others: number }) {
  const line = otherFamiliesLine(others);
  return (
    <div className="stat stat-families">
      <Link href="/familii" className="stat-main">
        <b>{count}</b>
        <span>{CHURCH_FAMILIES_LABEL}</span>
      </Link>
      {line ? (
        <Link href="/familii?filtru=alte" className="stat-more" title={OTHER_FAMILIES_HINT}>
          {line}
        </Link>
      ) : null}
    </div>
  );
}
