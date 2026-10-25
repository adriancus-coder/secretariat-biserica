-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CHURCH_ROLE';

-- CreateTable
CREATE TABLE "church_roles" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "inCommittee" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_roles" (
    "personId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "since" DATE,
    "until" DATE,

    CONSTRAINT "person_roles_pkey" PRIMARY KEY ("personId","roleId")
);

-- CreateIndex
CREATE INDEX "church_roles_churchId_sortOrder_idx" ON "church_roles"("churchId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "church_roles_churchId_nume_key" ON "church_roles"("churchId", "nume");

-- CreateIndex
CREATE INDEX "person_roles_roleId_idx" ON "person_roles"("roleId");

-- AddForeignKey
ALTER TABLE "church_roles" ADD CONSTRAINT "church_roles_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "church_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the default roles for every existing church (new churches get them at signup).
-- Keep in sync with DEFAULT_CHURCH_ROLES in src/lib/roles.ts.
INSERT INTO "church_roles" ("id", "churchId", "nume", "sortOrder", "inCommittee", "active", "updatedAt")
SELECT gen_random_uuid()::text, c."id", d.nume, d.ord, d.committee, true, CURRENT_TIMESTAMP
FROM "churches" c
CROSS JOIN (VALUES
  ('Pastor', 0, true),
  ('Prezbiter', 1, true),
  ('Diacon', 2, true),
  ('Secretar', 3, true),
  ('Casier', 4, true),
  ('Membru comitet', 5, true),
  ('Lider tineret', 6, false),
  ('Lider cor', 7, false),
  ('Lider copii', 8, false),
  ('Responsabil media', 9, false)
) AS d(nume, ord, committee);
