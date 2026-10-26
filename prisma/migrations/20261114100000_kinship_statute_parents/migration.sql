-- AlterEnum
ALTER TYPE "KinshipSource" ADD VALUE 'NUME_PARINTI';

-- AlterTable
ALTER TABLE "person_parents" ADD COLUMN     "externalParentId" TEXT,
ALTER COLUMN "parentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "kin_external_parents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "gen" "Gender" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "kin_external_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kin_proposal_ignores" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "kin_proposal_ignores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kin_external_parents_churchId_idx" ON "kin_external_parents"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "kin_proposal_ignores_churchId_key_key" ON "kin_proposal_ignores"("churchId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "person_parents_externalParentId_childId_key" ON "person_parents"("externalParentId", "childId");

-- AddForeignKey
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_externalParentId_fkey" FOREIGN KEY ("externalParentId") REFERENCES "kin_external_parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kin_external_parents" ADD CONSTRAINT "kin_external_parents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kin_external_parents" ADD CONSTRAINT "kin_external_parents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kin_proposal_ignores" ADD CONSTRAINT "kin_proposal_ignores_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kin_proposal_ignores" ADD CONSTRAINT "kin_proposal_ignores_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Exactly one parent: a person of the register or a parent outside it.
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_one_parent" CHECK (num_nonnulls("parentId", "externalParentId") = 1);
