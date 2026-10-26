-- CreateEnum
CREATE TYPE "KinshipSource" AS ENUM ('FAMILIE', 'MANUAL', 'CAMPANIE');

-- CreateTable
CREATE TABLE "person_parents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "source" "KinshipSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "person_parents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_parents_churchId_idx" ON "person_parents"("churchId");

-- CreateIndex
CREATE INDEX "person_parents_childId_idx" ON "person_parents"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "person_parents_parentId_childId_key" ON "person_parents"("parentId", "childId");

-- AddForeignKey
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_childId_fkey" FOREIGN KEY ("childId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_parents" ADD CONSTRAINT "person_parents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
