-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PASTORAL';

-- CreateTable
CREATE TABLE "pastoral_notes" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastoral_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pastoral_notes_churchId_personId_idx" ON "pastoral_notes"("churchId", "personId");

-- AddForeignKey
ALTER TABLE "pastoral_notes" ADD CONSTRAINT "pastoral_notes_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_notes" ADD CONSTRAINT "pastoral_notes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_notes" ADD CONSTRAINT "pastoral_notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

