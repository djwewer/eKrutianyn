-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('MOTHER', 'FATHER', 'GUARDIAN');

-- AlterTable
ALTER TABLE "GuardianContact" ADD COLUMN     "relation" "GuardianRelation" NOT NULL DEFAULT 'GUARDIAN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "residence" TEXT,
ADD COLUMN     "skobDate" TIMESTAMP(3),
ADD COLUMN     "studyPlace" TEXT;

-- Backfill: contacts whose free-text role already said "мама"/"тато" become the
-- standard MOTHER / FATHER relation. Only the earliest such contact per junak
-- is converted (a junak has at most one mother and one father); the rest stay
-- GUARDIAN with their text role untouched.
UPDATE "GuardianContact" g
SET "relation" = 'MOTHER', "role" = NULL
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "junakId" ORDER BY "createdAt", id) AS rn
  FROM "GuardianContact"
  WHERE lower(trim("role")) IN ('мама', 'мати', 'матір', 'mother', 'mom')
) m
WHERE g.id = m.id AND m.rn = 1;

UPDATE "GuardianContact" g
SET "relation" = 'FATHER', "role" = NULL
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "junakId" ORDER BY "createdAt", id) AS rn
  FROM "GuardianContact"
  WHERE lower(trim("role")) IN ('тато', 'батько', 'father', 'dad')
) m
WHERE g.id = m.id AND m.rn = 1;
