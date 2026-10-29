import { generatedRoute } from "@/server/generated";

/** „Inventarul bunurilor la <data>” (Statut art. 43 alin. 7); `poze=1` with the photos (not editable). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("patrimoniu", req);
}
