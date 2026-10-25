-- Data-update campaigns and their personal links (tokens are never stored, only their hashes).
-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "data_campaigns" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "generalLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "generalNonce" TEXT,
    "generalTokenHash" TEXT,
    "privacyTextVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "data_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_update_links" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "failedChecks" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_update_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_campaigns_generalTokenHash_key" ON "data_campaigns"("generalTokenHash");

-- CreateIndex
CREATE INDEX "data_campaigns_churchId_createdAt_idx" ON "data_campaigns"("churchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "data_update_links_tokenHash_key" ON "data_update_links"("tokenHash");

-- CreateIndex
CREATE INDEX "data_update_links_churchId_idx" ON "data_update_links"("churchId");

-- CreateIndex
CREATE INDEX "data_update_links_personId_idx" ON "data_update_links"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "data_update_links_campaignId_personId_key" ON "data_update_links"("campaignId", "personId");

-- AddForeignKey
ALTER TABLE "data_campaigns" ADD CONSTRAINT "data_campaigns_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_campaigns" ADD CONSTRAINT "data_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_links" ADD CONSTRAINT "data_update_links_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_links" ADD CONSTRAINT "data_update_links_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "data_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_update_links" ADD CONSTRAINT "data_update_links_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

