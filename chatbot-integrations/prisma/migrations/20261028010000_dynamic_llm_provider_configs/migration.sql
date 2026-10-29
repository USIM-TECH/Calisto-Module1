CREATE TABLE `LlmProviderConfig_new` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `apiKeyEncrypted` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `LlmProviderConfig_active_enabled_idx`(`active`, `enabled`),
    INDEX `LlmProviderConfig_provider_enabled_idx`(`provider`, `enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `LlmProviderConfig_new` (`id`, `name`, `provider`, `model`, `apiKeyEncrypted`, `enabled`, `active`, `lastTestAt`, `lastTestStatus`, `createdAt`, `updatedAt`)
SELECT CONCAT('legacy-', `provider`), `provider`, `provider`, `model`, `apiKeyEncrypted`, `enabled`, `active`, `lastTestAt`, `lastTestStatus`, `createdAt`, `updatedAt`
FROM `LlmProviderConfig`;

DROP TABLE `LlmProviderConfig`;
RENAME TABLE `LlmProviderConfig_new` TO `LlmProviderConfig`;
