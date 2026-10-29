import { generatedRoute } from "@/server/generated";

/** Darea de seamă tipărită direct, fără înregistrare în registru (ca în prototip). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("dare-de-seama", req);
}
