import { generatedRoute } from "@/server/generated";

/** The A5 poster of a campaign's general link (the same layout as the application poster). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/afis-actualizare/[id]">) {
  return generatedRoute("afis-actualizare", req, (await params).id);
}
