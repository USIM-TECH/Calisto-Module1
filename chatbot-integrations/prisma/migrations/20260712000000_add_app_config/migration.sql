-- CreateTable: AppConfig
-- Stores Calisto app download links and branding image used in chatbot promo cards.
-- Only one row is used (id = 'default'). Edit via Prisma Studio or the /app-config API.

CREATE TABLE `AppConfig` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `playStoreUrl` VARCHAR(191) NULL,
    `appStoreUrl` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed default row
INSERT INTO `AppConfig` (`id`, `playStoreUrl`, `appStoreUrl`, `imageUrl`, `updatedAt`)
VALUES (
    'default',
    'https://play.google.com/store/apps/details?id=com.lenskart.app&hl=en_IN',
    'https://apps.apple.com/in/app/lenskart-eyewear/id970343205',
    'https://s3-eu-west-1.amazonaws.com/tpd/logos/66f14812d36fdcc4d52b2525/0x0.png',
    NOW()
) ON DUPLICATE KEY UPDATE `id` = `id`;
