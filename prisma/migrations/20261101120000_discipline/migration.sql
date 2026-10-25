-- Disciplinary measures (Statut art. 27, 271, 272), administrators only; the domicile exception on documents.
-- CreateEnum
CREATE TYPE "DisciplinaryForm" AS ENUM ('MUSTRARE_PERSONALA', 'MUSTRARE_COMITET', 'RETRAGERE_DREPTURI', 'SUSPENDARE', 'EXCLUDERE');

-- CreateEnum
CREATE TYPE "DisciplinaryState" AS ENUM ('CERCETARE', 'APLICATA', 'INCHEIATA');

-- CreateEnum
CREATE TYPE "DisciplinaryForum" AS ENUM ('LOCAL', 'COMUNITATE');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'DISCIPLINE';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "exceptieDomiciliu" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "disciplinary_measures" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "forma" "DisciplinaryForm" NOT NULL,
    "stare" "DisciplinaryState" NOT NULL DEFAULT 'CERCETARE',
    "dataInceput" DATE NOT NULL,
    "dataSfarsit" DATE,
    "meetingId" TEXT,
    "motiv" TEXT NOT NULL DEFAULT '',
    "decisByForum" "DisciplinaryForum" NOT NULL DEFAULT 'LOCAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinary_measures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disciplinary_measures_churchId_personId_idx" ON "disciplinary_measures"("churchId", "personId");

-- CreateIndex
CREATE INDEX "disciplinary_measures_personId_idx" ON "disciplinary_measures"("personId");

-- CreateIndex
CREATE INDEX "disciplinary_measures_meetingId_idx" ON "disciplinary_measures"("meetingId");

-- AddForeignKey
ALTER TABLE "disciplinary_measures" ADD CONSTRAINT "disciplinary_measures_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_measures" ADD CONSTRAINT "disciplinary_measures_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_measures" ADD CONSTRAINT "disciplinary_measures_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_measures" ADD CONSTRAINT "disciplinary_measures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

