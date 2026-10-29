import { generatedRoute } from "@/server/generated";

/** "Convocare la audiere" (Statut art. 272 lit. a). `disciplina` + step-up. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/convocare">) {
  return generatedRoute("disciplina-convocare", req, (await params).id);
}
