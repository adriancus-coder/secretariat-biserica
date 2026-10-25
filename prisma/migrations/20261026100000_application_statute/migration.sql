-- CreateEnum
CREATE TYPE "ChurchDocumentKind" AS ENUM ('STATUT_CULT', 'STATUT_INTERN');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentStatutCult" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentStatutIntern" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "church_documents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "kind" "ChurchDocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "pdf" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "church_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "church_documents_churchId_idx" ON "church_documents"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "church_documents_churchId_kind_key" ON "church_documents"("churchId", "kind");

-- AddForeignKey
ALTER TABLE "church_documents" ADD CONSTRAINT "church_documents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_documents" ADD CONSTRAINT "church_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

