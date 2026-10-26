-- CORRESPONDENCE-REGISTER (Statut art. 43 alin. 7): the registry of incoming and outgoing letters (metadata only).
-- CreateEnum
CREATE TYPE "CorrespondenceDirection" AS ENUM ('INTRARE', 'IESIRE');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CORRESPONDENCE';

-- CreateTable
CREATE TABLE "correspondence" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nr" INTEGER NOT NULL,
    "an" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "directie" "CorrespondenceDirection" NOT NULL,
    "dela" TEXT NOT NULL DEFAULT '',
    "catre" TEXT NOT NULL DEFAULT '',
    "subiect" TEXT NOT NULL,
    "rezolvare" TEXT NOT NULL DEFAULT '',
    "documentId" TEXT,
    "raspunsLaId" TEXT,
    "personId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "correspondence_churchId_data_idx" ON "correspondence"("churchId", "data");

-- CreateIndex
CREATE INDEX "correspondence_personId_idx" ON "correspondence"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "correspondence_churchId_an_nr_key" ON "correspondence"("churchId", "an", "nr");

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_raspunsLaId_fkey" FOREIGN KEY ("raspunsLaId") REFERENCES "correspondence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

