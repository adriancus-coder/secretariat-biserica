-- Submissions of the data-update campaign and the consents (privacy notice and four optional ones).
-- CreateEnum
CREATE TYPE "SubmissionVia" AS ENUM ('PERSONAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('INFO_NOTE', 'PHOTOS', 'BIRTHDAY', 'CONTACT', 'DIRECTORY');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('ONLINE', 'PAPER', 'STAFF');

-- CreateTable
CREATE TABLE "data_update_submissions" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "linkId" TEXT,
    "personId" TEXT,
    "via" "SubmissionVia" NOT NULL,
    "proposed" JSONB NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_update_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "textVersion" TEXT NOT NULL DEFAULT '',
    "givenAt" TIMESTAMP(3) NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "givenByPersonId" TEXT,
    "submissionId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_update_submissions_churchId_status_idx" ON "data_update_submissions"("churchId", "status");

-- CreateIndex
CREATE INDEX "data_update_submissions_campaignId_idx" ON "data_update_submissions"("campaignId");

-- CreateIndex
CREATE INDEX "data_update_submissions_personId_idx" ON "data_update_submissions"("personId");

-- CreateIndex
CREATE INDEX "consents_churchId_kind_idx" ON "consents"("churchId", "kind");

-- CreateIndex
CREATE INDEX "consents_personId_kind_idx" ON "consents"("personId", "kind");

-- CreateIndex
CREATE INDEX "consents_submissionId_idx" ON "consents"("submissionId");

-- AddForeignKey
ALTER TABLE "data_update_submissions" ADD CONSTRAINT "data_update_submissions_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_submissions" ADD CONSTRAINT "data_update_submissions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "data_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_submissions" ADD CONSTRAINT "data_update_submissions_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "data_update_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_submissions" ADD CONSTRAINT "data_update_submissions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_submissions" ADD CONSTRAINT "data_update_submissions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_givenByPersonId_fkey" FOREIGN KEY ("givenByPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "data_update_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

