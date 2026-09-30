-- CreateTable
CREATE TABLE `aperturas_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caja_id` INTEGER NOT NULL,
    `empleado_id` INTEGER NOT NULL,
    `monto_inicial` DECIMAL(10, 2) NOT NULL,
    `fecha_apertura` DATETIME(3) NOT NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    `observaciones` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apertura_caja_id` INTEGER NOT NULL,
    `empleado_id` INTEGER NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `concepto` VARCHAR(255) NOT NULL,
    `observaciones` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cortes_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apertura_caja_id` INTEGER NOT NULL,
    `empleado_id` INTEGER NOT NULL,
    `efectivo_contado` DECIMAL(10, 2) NOT NULL,
    `total_entradas` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_salidas` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `diferencia` DECIMAL(10, 2) NOT NULL,
    `observaciones` TEXT NULL,
    `fecha_corte` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `aperturas_caja` ADD CONSTRAINT `aperturas_caja_caja_id_fkey` FOREIGN KEY (`caja_id`) REFERENCES `cajas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aperturas_caja` ADD CONSTRAINT `aperturas_caja_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_caja` ADD CONSTRAINT `movimientos_caja_apertura_caja_id_fkey` FOREIGN KEY (`apertura_caja_id`) REFERENCES `aperturas_caja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_caja` ADD CONSTRAINT `movimientos_caja_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cortes_caja` ADD CONSTRAINT `cortes_caja_apertura_caja_id_fkey` FOREIGN KEY (`apertura_caja_id`) REFERENCES `aperturas_caja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cortes_caja` ADD CONSTRAINT `cortes_caja_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
