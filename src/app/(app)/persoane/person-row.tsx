import Link from "next/link";
import { ageAt } from "@/lib/dates";
import { initial, memberName } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import type { PersonListItem } from "@/server/queries/persons";

export function statusTagClass(statut: string): string {
  return statut === "MEMBRU" ? "tag tag-ok" : statut === "FOST_MEMBRU" ? "tag tag-warn" : "tag";
}

/** Rândul din listă, ca în prototip: inițială, nume, (familie / rudenie) · telefon · vârstă, statut. */
export function PersonRow({ p, byFamily, today }: { p: PersonListItem; byFamily: boolean; today: string }) {
  const meta = [
    p.rudenie && byFamily ? p.rudenie : p.familie ? `Fam. ${p.familie}` : "",
    p.telefon,
    p.dataNasterii ? `${ageAt(p.dataNasterii, today)} ani` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/persoane/${p.id}`} className="item">
      <div className="av" aria-hidden="true">
        {initial(p.nume)}
      </div>
      <div className="body">
        <div className="t">{memberName(p)}</div>
        <div className="m">{meta}</div>
      </div>
      <span className={statusTagClass(p.statut)}>{STATUS_LABEL[p.statut]}</span>
    </Link>
  );
}
