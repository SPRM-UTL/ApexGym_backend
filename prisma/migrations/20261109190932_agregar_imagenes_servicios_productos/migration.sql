-- AlterTable
ALTER TABLE `producto` ADD COLUMN `imagen_public_id` VARCHAR(255) NULL,
    ADD COLUMN `imagen_url` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `servicios` ADD COLUMN `imagen_public_id` VARCHAR(255) NULL,
    ADD COLUMN `imagen_url` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `asistencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresa_id` INTEGER NOT NULL DEFAULT 1,
    `cliente_id` INTEGER NOT NULL,
    `cliente_membresia_id` INTEGER NULL,
    `fecha_hora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observaciones` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresa_id` INTEGER NOT NULL DEFAULT 1,
    `nombre_visitante` VARCHAR(150) NOT NULL,
    `tipo_visita_id` INTEGER NOT NULL,
    `costo` DECIMAL(10, 2) NOT NULL,
    `fecha_hora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observaciones` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_cliente_membresia_id_fkey` FOREIGN KEY (`cliente_membresia_id`) REFERENCES `clientes_membresias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitas` ADD CONSTRAINT `visitas_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitas` ADD CONSTRAINT `visitas_tipo_visita_id_fkey` FOREIGN KEY (`tipo_visita_id`) REFERENCES `tipos_visitas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
