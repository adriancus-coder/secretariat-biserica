import { generatedRoute } from "@/server/generated";

/** "Comunicarea sancțiunii" (Statut art. 27 alin. 10) with the appeal deadline. `disciplina` + step-up. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/comunicare">) {
  return generatedRoute("disciplina-comunicare", req, (await params).id);
}
