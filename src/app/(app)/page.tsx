import { PageHead } from "@/components/ui/page-head";
import { requireUser } from "@/server/session";

export default async function HomePage() {
  const user = await requireUser();
  return <PageHead title={user.churchName} sub="Tabloul de bord urmează." />;
}
