-- Person form polish: role groups, the committee as a person flag, the old "Slujire" text moved into
-- the note, and the families created automatically marked as such.
-- Keep the defaults in sync with DEFAULT_ROLE_GROUPS in src/lib/roles.ts.

-- 1. Role groups: "Funcții" and "Slujiri" for every church.
CREATE TABLE "role_groups" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "role_groups_churchId_sortOrder_idx" ON "role_groups"("churchId", "sortOrder");
CREATE UNIQUE INDEX "role_groups_churchId_nume_key" ON "role_groups"("churchId", "nume");
ALTER TABLE "role_groups" ADD CONSTRAINT "role_groups_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "role_groups" ("id", "churchId", "nume", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid()::text, c."id", g.nume, g.ord, true, CURRENT_TIMESTAMP
FROM "churches" c
CROSS JOIN (VALUES ('Funcții', 0), ('Slujiri', 1)) AS g(nume, ord);

-- 2. The committee becomes a flag on the person: active persons holding a committee role today.
ALTER TABLE "persons" ADD COLUMN "inComitet" BOOLEAN NOT NULL DEFAULT false;
UPDATE "persons" p SET "inComitet" = true
WHERE p."dataIesire" IS NULL AND p."statut" <> 'FOST_MEMBRU'
  AND EXISTS (
    SELECT 1 FROM "person_roles" pr JOIN "church_roles" r ON r."id" = pr."roleId"
    WHERE pr."personId" = p."id" AND r."inCommittee" AND (pr."until" IS NULL OR pr."until" >= CURRENT_DATE)
  );
-- "Membru comitet" leaves the nomenclature: its holders now carry the flag (person_roles cascade).
DELETE FROM "church_roles" WHERE lower("nume") = 'membru comitet';

-- 3. Every role belongs to a group: the "Slujiri" names there, everything else in "Funcții".
ALTER TABLE "church_roles" ADD COLUMN "groupId" TEXT;
UPDATE "church_roles" r SET "groupId" = g."id"
FROM "role_groups" g
WHERE g."churchId" = r."churchId"
  AND g."nume" = CASE
    WHEN lower(translate(r."nume", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt'))
      IN ('lauda si inchinare', 'cor', 'media', 'copii', 'tineret', 'evanghelizare', 'intretinere') THEN 'Slujiri'
    ELSE 'Funcții'
  END;
-- The default entries a church does not have yet (compared without case and diacritics).
INSERT INTO "church_roles" ("id", "churchId", "nume", "sortOrder", "active", "updatedAt", "groupId")
SELECT gen_random_uuid()::text, g."churchId", d.nume, 1000 + d.ord, true, CURRENT_TIMESTAMP, g."id"
FROM "role_groups" g
JOIN (VALUES
  ('Funcții', 'Pastor', 0),
  ('Funcții', 'Prezbiter', 1),
  ('Funcții', 'Diacon', 2),
  ('Funcții', 'Secretar', 3),
  ('Funcții', 'Casier', 4),
  ('Slujiri', 'Laudă și închinare', 5),
  ('Slujiri', 'Cor', 6),
  ('Slujiri', 'Media', 7),
  ('Slujiri', 'Copii', 8),
  ('Slujiri', 'Tineret', 9),
  ('Slujiri', 'Evanghelizare', 10),
  ('Slujiri', 'Întreținere', 11)
) AS d(grp, nume, ord) ON d.grp = g."nume"
WHERE NOT EXISTS (
  SELECT 1 FROM "church_roles" r
  WHERE r."churchId" = g."churchId"
    AND lower(translate(r."nume", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) = lower(translate(d.nume, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt'))
);
ALTER TABLE "church_roles" ALTER COLUMN "groupId" SET NOT NULL;
CREATE INDEX "church_roles_groupId_idx" ON "church_roles"("groupId");
ALTER TABLE "church_roles" ADD CONSTRAINT "church_roles_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "role_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "church_roles" DROP COLUMN "inCommittee";

-- 4. The free "Slujire / responsabilități" text leaves the form: it is kept at the top of the note.
UPDATE "persons"
SET "note" = 'Slujire (vechi): ' || "slujire" || CASE WHEN "note" <> '' THEN E'\n' || "note" ELSE '' END
WHERE "slujire" <> '';

-- 5. Families created automatically: still with the default name of their head and never touched in
--    the app (no audit entry).
ALTER TABLE "families" ADD COLUMN "autoCreated" BOOLEAN NOT NULL DEFAULT false;
UPDATE "families" f SET "autoCreated" = true
WHERE EXISTS (SELECT 1 FROM "persons" h WHERE h."id" = f."headId" AND f."nume" = 'Fam. ' || btrim(h."prenume" || ' ' || h."nume"))
  AND NOT EXISTS (SELECT 1 FROM "audit_logs" a WHERE a."entity" = 'FAMILY' AND a."entityId" = f."id");
