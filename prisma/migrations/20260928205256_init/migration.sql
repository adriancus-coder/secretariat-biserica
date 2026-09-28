-- Extensie pentru căutarea rapidă după fragmente de text (index GIN pe persons.searchText).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SECRETAR', 'VIZUALIZARE');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('MEMBRU', 'APARTINATOR', 'PRIETEN', 'COPIL', 'FOST_MEMBRU');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "EntryMode" AS ENUM ('BOTEZ', 'TRANSFER', 'NASCUT_IN_BISERICA', 'REPRIMIRE', 'ALTUL');

-- CreateEnum
CREATE TYPE "ExitMode" AS ENUM ('TRANSFER', 'RETRAGERE', 'DECES', 'EXCLUDERE', 'ALTUL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('adeverinta', 'botez', 'binecuvantare', 'recomandare', 'scrisoare', 'raport');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('PERSON', 'DOCUMENT', 'MEETING', 'EVENT', 'GROUP', 'NOTE', 'SETTINGS', 'USER', 'IMPORT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "churches" (
    "id" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "adresa" TEXT NOT NULL DEFAULT '',
    "orgNr" TEXT NOT NULL DEFAULT '',
    "telefon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "pastor" TEXT NOT NULL DEFAULT '',
    "secretar" TEXT NOT NULL DEFAULT '',
    "tipuriSedinte" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipuriEvenimente" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipuriMentiuni" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gradeRudenie" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "churches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIZUALIZARE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLoginAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "prenume" TEXT NOT NULL DEFAULT '',
    "statut" "PersonStatus" NOT NULL DEFAULT 'MEMBRU',
    "gen" "Gender",
    "familie" TEXT NOT NULL DEFAULT '',
    "rudenie" TEXT NOT NULL DEFAULT '',
    "dataNasterii" DATE,
    "telefon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "adresa" TEXT NOT NULL DEFAULT '',
    "dataMembru" DATE,
    "modIntrare" "EntryMode",
    "bisericaProvenienta" TEXT NOT NULL DEFAULT '',
    "dataBotez" DATE,
    "locBotez" TEXT NOT NULL DEFAULT '',
    "dataBinecuvantare" DATE,
    "dataIesire" DATE,
    "modIesire" "ExitMode",
    "bisericaDestinatie" TEXT NOT NULL DEFAULT '',
    "slujire" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "sortKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "titlu" TEXT NOT NULL DEFAULT '',
    "tip" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "ora" TEXT NOT NULL DEFAULT '',
    "loc" TEXT NOT NULL DEFAULT '',
    "presedinte" TEXT NOT NULL DEFAULT '',
    "invitati" TEXT NOT NULL DEFAULT '',
    "ordine" TEXT NOT NULL DEFAULT '',
    "discutii" TEXT NOT NULL DEFAULT '',
    "hotarari" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "meetingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("meetingId","personId")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "titlu" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "ora" TEXT NOT NULL DEFAULT '',
    "loc" TEXT NOT NULL DEFAULT '',
    "invitat" TEXT NOT NULL DEFAULT '',
    "responsabil" TEXT NOT NULL DEFAULT '',
    "descriere" TEXT NOT NULL DEFAULT '',
    "agapaActiva" BOOLEAN NOT NULL DEFAULT false,
    "agapaResponsabil" TEXT NOT NULL DEFAULT '',
    "agapaPersoane" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_contributions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pozitie" INTEGER NOT NULL,
    "cine" TEXT NOT NULL DEFAULT '',
    "ce" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "tip" "DocumentType" NOT NULL,
    "nr" INTEGER NOT NULL,
    "anRegistru" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "personId" TEXT,
    "persoana" TEXT NOT NULL DEFAULT '',
    "catre" TEXT NOT NULL DEFAULT '',
    "scop" TEXT NOT NULL DEFAULT '',
    "titlu" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "anRaport" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "responsabil" TEXT NOT NULL DEFAULT '',
    "descriere" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("groupId","personId")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tip" TEXT NOT NULL,
    "personId" TEXT,
    "familie" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "entity" "AuditEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "action" "AuditAction" NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_churchId_idx" ON "users"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_churchId_createdAt_idx" ON "invitations"("churchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE INDEX "persons_churchId_sortKey_idx" ON "persons"("churchId", "sortKey");

-- CreateIndex
CREATE INDEX "persons_churchId_familie_idx" ON "persons"("churchId", "familie");

-- CreateIndex
CREATE INDEX "persons_churchId_statut_idx" ON "persons"("churchId", "statut");

-- CreateIndex
CREATE INDEX "persons_searchText_idx" ON "persons" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "meetings_churchId_data_idx" ON "meetings"("churchId", "data");

-- CreateIndex
CREATE INDEX "meeting_attendees_personId_idx" ON "meeting_attendees"("personId");

-- CreateIndex
CREATE INDEX "events_churchId_data_idx" ON "events"("churchId", "data");

-- CreateIndex
CREATE INDEX "event_contributions_eventId_pozitie_idx" ON "event_contributions"("eventId", "pozitie");

-- CreateIndex
CREATE INDEX "documents_churchId_data_idx" ON "documents"("churchId", "data");

-- CreateIndex
CREATE INDEX "documents_personId_idx" ON "documents"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_churchId_anRegistru_nr_key" ON "documents"("churchId", "anRegistru", "nr");

-- CreateIndex
CREATE INDEX "groups_churchId_nume_idx" ON "groups"("churchId", "nume");

-- CreateIndex
CREATE INDEX "group_members_personId_idx" ON "group_members"("personId");

-- CreateIndex
CREATE INDEX "notes_churchId_data_idx" ON "notes"("churchId", "data");

-- CreateIndex
CREATE INDEX "notes_personId_idx" ON "notes"("personId");

-- CreateIndex
CREATE INDEX "audit_logs_churchId_entity_entityId_createdAt_idx" ON "audit_logs"("churchId", "entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_churchId_createdAt_idx" ON "audit_logs"("churchId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_contributions" ADD CONSTRAINT "event_contributions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
