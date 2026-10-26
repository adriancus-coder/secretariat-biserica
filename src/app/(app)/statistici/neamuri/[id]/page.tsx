import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { neamTree, type KinGraph, type TreeNode } from "@/lib/kinship";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { EXTERNAL_PREFIX } from "@/lib/kinship-parents";
import { loadKinship } from "@/server/kinship";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Neam" };

/** One person of the tree: a link with the family; inactive persons only for write roles, marked. */
function Who({ g, id, families, full }: { g: KinGraph; id: string; families: Map<string, string>; full: boolean }) {
  const p = g.person.get(id)!;
  if (p.external)
    return (
      <span>
        {p.nume} <span className="tag ml-1">nu e în registru</span>
      </span>
    );
  if (!p.active && !full) return <span className="hint">persoană care nu mai este în evidență</span>;
  return (
    <span>
      <Link href={`/persoane/${id}`}>{`${p.nume} ${p.prenume}`.trim()}</Link>
      {!p.active ? <span className="tag ml-1">nu mai este în evidență</span> : null}
      {p.familyId && families.get(p.familyId) ? <span className="hint inline"> · {families.get(p.familyId)}</span> : null}
    </span>
  );
}

function Branch({ node, g, families, full }: { node: TreeNode; g: KinGraph; families: Map<string, string>; full: boolean }) {
  return (
    <li>
      <div className="kin-node">
        <Who g={g} id={node.id} families={families} full={full} />
        {node.spouses.map((s) => (
          <span key={s} className="kin-spouse">
            {" "}
            și <Who g={g} id={s} families={families} full={full} />
          </span>
        ))}
      </div>
      {node.children.length ? (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.id} node={c} g={g} families={families} full={full} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** A neam as an indented tree, generation by generation (phones first, no graphics library). */
export default async function NeamPage({ params }: PageProps<"/statistici/neamuri/[id]">) {
  const ctx = await requireCtx();
  // The neam's id is its root: a person, or a parent outside the register ("x:<id>").
  const id = decodeURIComponent((await params).id);
  if (!idSchema.safeParse(id.startsWith(EXTERNAL_PREFIX) ? id.slice(EXTERNAL_PREFIX.length) : id).success) notFound();
  const kin = await loadKinship(ctx.db);
  const neam = kin.neamuri.find((n) => n.id === id);
  if (!neam) notFound();
  const full = permissions.write(ctx.user.role);
  const trees = neamTree(kin.graph, neam);
  return (
    <>
      <BackLink href="/statistici/neamuri">Neamuri</BackLink>
      <PageHead title={neam.name} sub={`${neam.persons} persoane în evidență · ${neam.membri} membri · ${neam.families} familii · ${neam.generations} generații`} />
      <section className="card">
        <ul className="kin-tree" aria-label={`Arborele: ${neam.name}`}>
          {trees.map((t) => (
            <Branch key={t.id} node={t} g={kin.graph} families={kin.families} full={full} />
          ))}
        </ul>
        <p className="hint mt-3">Fiecare nivel de indentare este o generație. Soții apar împreună; copiii sub părinți, de la cel mai mare.</p>
      </section>
    </>
  );
}
