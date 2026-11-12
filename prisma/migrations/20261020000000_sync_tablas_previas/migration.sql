-- AlterTable
ALTER TABLE `secciones` ADD COLUMN `orden` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `modulos` ADD COLUMN `orden` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `estados_clientes` ADD COLUMN `color` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `estados_membresias` ADD COLUMN `color` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `movimientos_caja` ADD COLUMN `desglose` TEXT NULL,
    ADD COLUMN `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE `cortes_caja` ADD COLUMN `total_ventas` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `total_ventas_efectivo` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `clientes_membresias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NOT NULL,
    `tipo_membresia_id` INTEGER NOT NULL,
    `estado_membresia_id` INTEGER NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,
    `renovacion_automatica` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `servicios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `precio` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `estado` VARCHAR(50) NOT NULL DEFAULT 'activo',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `servicios_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `clientes_membresias` ADD CONSTRAINT `clientes_membresias_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes_membresias` ADD CONSTRAINT `clientes_membresias_tipo_membresia_id_fkey` FOREIGN KEY (`tipo_membresia_id`) REFERENCES `tipos_membresias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes_membresias` ADD CONSTRAINT `clientes_membresias_estado_membresia_id_fkey` FOREIGN KEY (`estado_membresia_id`) REFERENCES `estados_membresias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
