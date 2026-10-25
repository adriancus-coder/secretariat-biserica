-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "passkeyPolicy" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_passkeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceName" TEXT NOT NULL DEFAULT '',
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "user_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_passkeys_credentialId_key" ON "user_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "user_passkeys_userId_idx" ON "user_passkeys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_challenges_challengeHash_key" ON "webauthn_challenges"("challengeHash");

-- CreateIndex
CREATE INDEX "webauthn_challenges_userId_idx" ON "webauthn_challenges"("userId");

-- AddForeignKey
ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

