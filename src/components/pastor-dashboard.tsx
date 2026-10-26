import Link from "next/link";
import type { DashCard } from "@/lib/pastor-dashboard";

/** Acasă for pastors: one card per thing that waits for them, each opening its list. */
export function PastorDashboard({ cards }: { cards: DashCard[] }) {
  return (
    <section className="pastor-dash mb-4" aria-label="Pentru pastor">
      {cards.map((c) => (
        <Link key={c.title} href={c.href} className={`dash-card${c.alert ? " dash-alert" : ""}`}>
          <span className="dash-title">{c.title}</span>
          <b className="dash-value">{c.value}</b>
          <span className="dash-detail">{c.detail}</span>
        </Link>
      ))}
    </section>
  );
}
