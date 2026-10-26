-- CreateEnum
CREATE TYPE "PersonProposalKind" AS ENUM ('REABILITARE', 'EXCLUDERE');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PROPUSA', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'PROPUSA';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "propunere" JSONB,
ADD COLUMN     "propusDeId" TEXT,
ADD COLUMN     "propusLa" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "person_proposals" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "kind" "PersonProposalKind" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPUSA',
    "personId" TEXT,
    "nume" TEXT NOT NULL,
    "formular" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propusDeId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "motivRespingere" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "person_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_proposals_churchId_status_createdAt_idx" ON "person_proposals"("churchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "person_proposals_personId_idx" ON "person_proposals"("personId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_propusDeId_fkey" FOREIGN KEY ("propusDeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_proposals" ADD CONSTRAINT "person_proposals_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_proposals" ADD CONSTRAINT "person_proposals_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_proposals" ADD CONSTRAINT "person_proposals_propusDeId_fkey" FOREIGN KEY ("propusDeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_proposals" ADD CONSTRAINT "person_proposals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

