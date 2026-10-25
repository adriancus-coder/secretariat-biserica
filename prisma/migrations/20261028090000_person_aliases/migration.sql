-- Other written forms of a person's name, remembered from manual matches (minutes import).
-- CreateTable
CREATE TABLE "person_aliases" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "person_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_aliases_churchId_idx" ON "person_aliases"("churchId");

-- CreateIndex
CREATE INDEX "person_aliases_personId_idx" ON "person_aliases"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "person_aliases_churchId_alias_key" ON "person_aliases"("churchId", "alias");

-- AddForeignKey
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

