-- Group members kept in sync from the group's roles (AUTO) or added by hand (MANUAL, every existing row).
-- CreateEnum
CREATE TYPE "GroupMemberSource" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "sursa" "GroupMemberSource" NOT NULL DEFAULT 'MANUAL';


-- First sync of the groups linked to roles (as syncRoleGroups does): the current holders of the
-- group's ministry or leader role — persons in the register, not "Fost membru", not anonymised, the
-- role without a past end date — are AUTO members; their existing rows become AUTO, missing ones are
-- added. Every other row stays MANUAL.
WITH holders AS (
  SELECT DISTINCT g."id" AS "groupId", p."id" AS "personId"
  FROM "groups" g
  JOIN "person_roles" pr ON pr."roleId" IN (g."functieId", g."functieLiderId")
  JOIN "persons" p ON p."id" = pr."personId" AND p."churchId" = g."churchId"
  WHERE p."statut" <> 'FOST_MEMBRU' AND p."dataIesire" IS NULL AND p."nume" <> 'Persoană ștearsă'
    AND (pr."until" IS NULL OR pr."until" >= CURRENT_DATE)
)
UPDATE "group_members" gm SET "sursa" = 'AUTO'
FROM holders h WHERE gm."groupId" = h."groupId" AND gm."personId" = h."personId";

INSERT INTO "group_members" ("groupId", "personId", "sursa")
SELECT DISTINCT g."id", p."id", 'AUTO'::"GroupMemberSource"
FROM "groups" g
JOIN "person_roles" pr ON pr."roleId" IN (g."functieId", g."functieLiderId")
JOIN "persons" p ON p."id" = pr."personId" AND p."churchId" = g."churchId"
WHERE p."statut" <> 'FOST_MEMBRU' AND p."dataIesire" IS NULL AND p."nume" <> 'Persoană ștearsă'
  AND (pr."until" IS NULL OR pr."until" >= CURRENT_DATE)
ON CONFLICT ("groupId", "personId") DO NOTHING;
