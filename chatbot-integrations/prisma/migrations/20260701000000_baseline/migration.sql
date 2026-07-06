-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `leadName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `preferredService` VARCHAR(191) NULL,
    `responseStyle` ENUM('casual', 'professional', 'warm', 'concierge') NULL,
    `qualificationStatus` ENUM('new', 'qualified', 'unqualified', 'needs_review') NOT NULL,
    `crmStatus` ENUM('pending', 'synced', 'failed') NOT NULL,
    `crmRecordId` VARCHAR(191) NULL,
    `lastIntent` VARCHAR(191) NULL,
    `lastMessageAt` DATETIME(3) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_phone_idx`(`phone`),
    INDEX `Customer_email_idx`(`email`),
    INDEX `Customer_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChannelIdentity` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `channel` ENUM('whatsapp', 'instagram', 'messenger', 'x', 'telegram', 'website') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `senderName` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,

    INDEX `ChannelIdentity_customerId_idx`(`customerId`),
    INDEX `ChannelIdentity_username_idx`(`username`),
    UNIQUE INDEX `ChannelIdentity_channel_sourceId_key`(`channel`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interest` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL,

    INDEX `Interest_customerId_capturedAt_idx`(`customerId`, `capturedAt`),
    UNIQUE INDEX `Interest_customerId_kind_value_key`(`customerId`, `kind`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CurrentInterest` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CurrentInterest_customerId_idx`(`customerId`),
    UNIQUE INDEX `CurrentInterest_customerId_kind_key`(`customerId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportCase` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `caseType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportCase_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `channelIdentityId` VARCHAR(191) NOT NULL,
    `channel` ENUM('whatsapp', 'instagram', 'messenger', 'x', 'telegram', 'website') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Conversation_customerId_idx`(`customerId`),
    INDEX `Conversation_channelIdentityId_idx`(`channelIdentityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `text` TEXT NULL,
    `messageType` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `metadata` JSON NOT NULL,

    INDEX `ConversationMessage_conversationId_timestamp_idx`(`conversationId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('whatsapp', 'instagram', 'messenger', 'x', 'telegram', 'website') NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `payload` JSON NOT NULL,

    INDEX `WebhookEvent_receivedAt_idx`(`receivedAt`),
    INDEX `WebhookEvent_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DedupeKey` (
    `key` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL,

    INDEX `DedupeKey_seenAt_idx`(`seenAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `productId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `productType` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `priceMyr` DOUBLE NOT NULL,
    `description` TEXT NULL,
    `frameMaterial` VARCHAR(191) NULL,
    `frameShape` VARCHAR(191) NULL,
    `frameColor` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `uvProtection` VARCHAR(191) NULL,
    `polarized` VARCHAR(191) NULL,
    `lensColor` VARCHAR(191) NULL,
    `frameStyle` VARCHAR(191) NULL,
    `lensType` VARCHAR(191) NULL,
    `lensFeature` VARCHAR(191) NULL,
    `lensDuration` VARCHAR(191) NULL,
    `multifocal` VARCHAR(191) NULL,
    `storeLocation` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `stockStatus` VARCHAR(191) NOT NULL DEFAULT 'in_stock',
    `rating` DOUBLE NULL,
    `bestseller` BOOLEAN NOT NULL DEFAULT false,
    `newArrival` BOOLEAN NOT NULL DEFAULT false,
    `imageUrl` VARCHAR(191) NULL,
    `fallbackImageUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_productType_idx`(`productType`),
    INDEX `Product_brand_idx`(`brand`),
    INDEX `Product_priceMyr_idx`(`priceMyr`),
    PRIMARY KEY (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Preset` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Preset_name_key`(`name`),
    INDEX `Preset_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductPreset` (
    `productId` VARCHAR(191) NOT NULL,
    `presetId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductPreset_presetId_idx`(`presetId`),
    INDEX `ProductPreset_productId_idx`(`productId`),
    PRIMARY KEY (`productId`, `presetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `fallbackImageUrl` VARCHAR(191) NULL,
    `mapUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Store_city_idx`(`city`),
    INDEX `Store_state_idx`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeDocument` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnowledgeDocument_source_key`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeChunk` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `chunkHash` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnowledgeChunk_chunkHash_key`(`chunkHash`),
    INDEX `KnowledgeChunk_documentId_idx`(`documentId`),
    INDEX `KnowledgeChunk_source_idx`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChannelIdentity` ADD CONSTRAINT `ChannelIdentity_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interest` ADD CONSTRAINT `Interest_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CurrentInterest` ADD CONSTRAINT `CurrentInterest_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportCase` ADD CONSTRAINT `SupportCase_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_channelIdentityId_fkey` FOREIGN KEY (`channelIdentityId`) REFERENCES `ChannelIdentity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationMessage` ADD CONSTRAINT `ConversationMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookEvent` ADD CONSTRAINT `WebhookEvent_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductPreset` ADD CONSTRAINT `ProductPreset_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductPreset` ADD CONSTRAINT `ProductPreset_presetId_fkey` FOREIGN KEY (`presetId`) REFERENCES `Preset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeChunk` ADD CONSTRAINT `KnowledgeChunk_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `KnowledgeDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

