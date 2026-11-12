-- CreateTable
CREATE TABLE `empresas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_comercial` VARCHAR(150) NOT NULL,
    `razon_social` VARCHAR(200) NULL,
    `rfc` VARCHAR(20) NULL,
    `telefono` VARCHAR(30) NULL,
    `email` VARCHAR(191) NULL,
    `direccion` TEXT NULL,
    `ciudad` VARCHAR(100) NULL,
    `estado` VARCHAR(100) NULL,
    `codigo_postal` VARCHAR(20) NULL,
    `logo_url` LONGTEXT NULL,
    `color_primario` VARCHAR(20) NOT NULL DEFAULT '#FF6A00',
    `moneda` VARCHAR(10) NOT NULL DEFAULT 'MXN',
    `simbolo_moneda` VARCHAR(10) NOT NULL DEFAULT '$',
    `zona_horaria` VARCHAR(100) NOT NULL DEFAULT 'America/Mexico_City',
    `tolerancia_minutos` INTEGER NOT NULL DEFAULT 15,
    `mensaje_ticket` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- InsertDefaultEmpresa (Garantiza retrocompatibilidad antes de aplicar llaves foráneas en bases con datos existentes)
INSERT IGNORE INTO `empresas` (
    `id`,
    `nombre_comercial`,
    `razon_social`,
    `rfc`,
    `telefono`,
    `email`,
    `direccion`,
    `ciudad`,
    `estado`,
    `codigo_postal`,
    `logo_url`,
    `color_primario`,
    `moneda`,
    `simbolo_moneda`,
    `zona_horaria`,
    `tolerancia_minutos`,
    `mensaje_ticket`,
    `activo`,
    `created_at`,
    `updated_at`,
    `deleted_at`
) VALUES (
    1,
    'ApexGym',
    'ApexGym S.A. de C.V.',
    'APX260101AAA',
    '555-019-2834',
    'contacto@apexgym.com',
    'Av. Principal #100, Col. Centro',
    'Ciudad de México',
    'CDMX',
    '06000',
    NULL,
    '#FF6A00',
    'MXN',
    '$',
    'America/Mexico_City',
    15,
    '¡Gracias por entrenar en ApexGym!',
    1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
);

-- AlterTable
ALTER TABLE `aperturas_caja` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `areas_trabajos` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `cajas` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `categoria_productos` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `usuario_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `clientes_membresias` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `configuraciones_sistema` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `cortes_caja` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `empleados` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `estados_clientes` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `estados_empleados` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `estados_membresias` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `metodo_pago` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `movimientos_caja` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `producto` ADD COLUMN `disponible_compra` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `puestos` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `roles` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `servicios` ADD COLUMN `disponible_compra` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `tipos_actividades` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `tipos_membresias` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `tipos_visitas` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `empresa_id` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX `clientes_usuario_id_key` ON `clientes`(`usuario_id`);

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `areas_trabajos` ADD CONSTRAINT `areas_trabajos_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cajas` ADD CONSTRAINT `cajas_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puestos` ADD CONSTRAINT `puestos_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estados_empleados` ADD CONSTRAINT `estados_empleados_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tipos_actividades` ADD CONSTRAINT `tipos_actividades_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `configuraciones_sistema` ADD CONSTRAINT `configuraciones_sistema_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estados_clientes` ADD CONSTRAINT `estados_clientes_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes_membresias` ADD CONSTRAINT `clientes_membresias_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estados_membresias` ADD CONSTRAINT `estados_membresias_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tipos_membresias` ADD CONSTRAINT `tipos_membresias_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tipos_visitas` ADD CONSTRAINT `tipos_visitas_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categoria_productos` ADD CONSTRAINT `categoria_productos_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aperturas_caja` ADD CONSTRAINT `aperturas_caja_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_caja` ADD CONSTRAINT `movimientos_caja_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cortes_caja` ADD CONSTRAINT `cortes_caja_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto` ADD CONSTRAINT `producto_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metodo_pago` ADD CONSTRAINT `metodo_pago_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `servicios` ADD CONSTRAINT `servicios_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
