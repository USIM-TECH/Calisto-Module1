-- CreateTable
CREATE TABLE `ChannelAccount` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `channel` ENUM('whatsapp', 'instagram', 'messenger', 'x', 'telegram', 'website') NOT NULL,
    `nativeId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `credentialsEncrypted` TEXT NOT NULL,
    `verifyToken` VARCHAR(191) NULL,
    `metaAppId` VARCHAR(191) NULL,
    `apiVersion` VARCHAR(191) NULL,
    `webhookStatus` ENUM('pending', 'active', 'error') NOT NULL DEFAULT 'pending',
    `webhookUrl` VARCHAR(191) NULL,
    `webhookError` TEXT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChannelAccount_channel_nativeId_key`(`channel`, `nativeId`),
    INDEX `ChannelAccount_channel_enabled_idx`(`channel`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `ChannelIdentity` ADD COLUMN `channelAccountId` VARCHAR(191) NULL;

-- DropIndex
DROP INDEX `ChannelIdentity_channel_sourceId_key` ON `ChannelIdentity`;

-- CreateIndex
CREATE UNIQUE INDEX `ChannelIdentity_channel_sourceId_channelAccountId_key` ON `ChannelIdentity`(`channel`, `sourceId`, `channelAccountId`);

-- CreateIndex
CREATE INDEX `ChannelIdentity_channelAccountId_idx` ON `ChannelIdentity`(`channelAccountId`);

-- AddForeignKey
ALTER TABLE `ChannelIdentity` ADD CONSTRAINT `ChannelIdentity_channelAccountId_fkey` FOREIGN KEY (`channelAccountId`) REFERENCES `ChannelAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
