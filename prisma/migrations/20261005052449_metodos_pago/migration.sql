-- CreateTable
CREATE TABLE `metodo_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(30) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `estado` VARCHAR(50) NOT NULL DEFAULT 'activo',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `metodo_pago_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
