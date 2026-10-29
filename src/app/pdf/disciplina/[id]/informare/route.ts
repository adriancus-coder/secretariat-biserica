import { generatedRoute } from "@/server/generated";

/** "Informare privind excluderea" (Statut art. 27 alin. 5). `disciplina` + step-up. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/informare">) {
  return generatedRoute("disciplina-informare", req, (await params).id);
}
