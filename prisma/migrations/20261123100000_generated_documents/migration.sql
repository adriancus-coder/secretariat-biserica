-- GENERATED-EDIT: edited versions of generated documents (GeneratedDocument), registered disciplinary acts
-- (Document.confidential) and the audit entity GENERATED.
-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'GENERATED';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "titlu" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL,
    "layout" JSONB,
    "sourceHash" TEXT NOT NULL,
    "documentId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_documents_churchId_idx" ON "generated_documents"("churchId");

-- CreateIndex
CREATE INDEX "generated_documents_documentId_idx" ON "generated_documents"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_churchId_sourceKey_key" ON "generated_documents"("churchId", "sourceKey");

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

