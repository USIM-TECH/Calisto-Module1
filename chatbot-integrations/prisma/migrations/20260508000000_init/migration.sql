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
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "leadName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "preferredService" TEXT,
    "responseStyle" "ResponseStyle",
    "qualificationStatus" "QualificationStatus" NOT NULL,
    "crmStatus" "CrmStatus" NOT NULL,
    "crmRecordId" TEXT,
    "lastIntent" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelIdentity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "senderName" TEXT,
    "username" TEXT,
    "conversationId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channelIdentityId" TEXT NOT NULL,
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
    "customerId" TEXT,
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
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_updatedAt_idx" ON "Customer"("updatedAt");

-- CreateIndex
CREATE INDEX "ChannelIdentity_customerId_idx" ON "ChannelIdentity"("customerId");

-- CreateIndex
CREATE INDEX "ChannelIdentity_username_idx" ON "ChannelIdentity"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIdentity_channel_sourceId_key" ON "ChannelIdentity"("channel", "sourceId");

-- CreateIndex
CREATE INDEX "Interest_customerId_capturedAt_idx" ON "Interest"("customerId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_customerId_kind_value_key" ON "Interest"("customerId", "kind", "value");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_channelIdentityId_idx" ON "Conversation"("channelIdentityId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_timestamp_idx" ON "ConversationMessage"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_customerId_idx" ON "WebhookEvent"("customerId");

-- CreateIndex
CREATE INDEX "DedupeKey_seenAt_idx" ON "DedupeKey"("seenAt");

-- AddForeignKey
ALTER TABLE "ChannelIdentity" ADD CONSTRAINT "ChannelIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interest" ADD CONSTRAINT "Interest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelIdentityId_fkey" FOREIGN KEY ("channelIdentityId") REFERENCES "ChannelIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

