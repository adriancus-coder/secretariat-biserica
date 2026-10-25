-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('PASTOR', 'SECRETAR');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('SALVATA', 'UNICA');

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "semnaturaUnica" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "semnaturaUnicaTipuri" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signaturePng" BYTEA,
ADD COLUMN     "signatureSavedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "document_signatures" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "imagePng" BYTEA NOT NULL,
    "mode" "SignatureMode" NOT NULL,
    "passkeyCredentialId" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_signatures_userId_idx" ON "document_signatures"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_documentId_role_key" ON "document_signatures"("documentId", "role");

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

