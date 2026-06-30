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

-- AddForeignKey
ALTER TABLE `ProductPreset` ADD CONSTRAINT `ProductPreset_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductPreset` ADD CONSTRAINT `ProductPreset_presetId_fkey` FOREIGN KEY (`presetId`) REFERENCES `Preset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
