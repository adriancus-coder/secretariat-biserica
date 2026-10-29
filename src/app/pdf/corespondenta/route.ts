import { generatedRoute } from "@/server/generated";

/** „Registru de intrare-ieșire <an>” (the page's year, filter, search and sort). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("corespondenta", req);
}
