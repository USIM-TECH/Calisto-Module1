-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('whatsapp', 'instagram', 'messenger', 'x', 'telegram', 'website');

-- CreateEnum
CREATE TYPE "WebhookDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('new', 'qualified', 'unqualified', 'needs_review');

-- CreateEnum
CREATE TYPE "CrmStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "ResponseStyle" AS ENUM ('casual', 'professional', 'warm', 'concierge');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "responseStyle" "ResponseStyle",
    "senderName" TEXT,
    "leadName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "preferredService" TEXT,
    "location" TEXT,
    "qualificationStatus" "QualificationStatus" NOT NULL,
    "crmStatus" "CrmStatus" NOT NULL,
    "crmRecordId" TEXT,
    "lastIntent" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "messageId" TEXT NOT NULL,
    "text" TEXT,
    "messageType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "path" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DedupeKey" (
    "key" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DedupeKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Lead_updatedAt_idx" ON "Lead"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_channel_sourceId_key" ON "Lead"("channel", "sourceId");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_timestamp_idx" ON "ConversationMessage"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "DedupeKey_seenAt_idx" ON "DedupeKey"("seenAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
