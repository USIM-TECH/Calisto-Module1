-- AlterTable
ALTER TABLE `ChannelAccount` ADD COLUMN `responseMode` ENUM('payload', 'chat') NOT NULL DEFAULT 'payload';

-- CreateTable
CREATE TABLE `WebchatSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'webchat',
    `responseMode` ENUM('payload', 'chat') NOT NULL DEFAULT 'payload',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
