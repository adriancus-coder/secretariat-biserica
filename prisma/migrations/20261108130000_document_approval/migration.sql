-- CreateEnum
CREATE TYPE "DocumentState" AS ENUM ('CIORNA', 'DE_SEMNAT', 'APROBAT', 'RESPINS');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "aprobatDeUserId" TEXT,
ADD COLUMN     "aprobatLa" TIMESTAMP(3),
ADD COLUMN     "motivRespingere" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stare" "DocumentState" NOT NULL DEFAULT 'CIORNA',
ADD COLUMN     "trimisLaSemnatLa" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_aprobatDeUserId_fkey" FOREIGN KEY ("aprobatDeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Documents registered before the approval flow are historical: approved, without signatures.
UPDATE "documents" SET "stare" = 'APROBAT';
