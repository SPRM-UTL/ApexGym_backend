-- CreateTable
CREATE TABLE `estados_clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `estado_cliente_id` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `apellido_paterno` VARCHAR(150) NOT NULL,
    `apellido_materno` VARCHAR(150) NULL,
    `fecha_nacimiento` DATE NOT NULL,
    `genero` VARCHAR(50) NOT NULL,
    `telefono` VARCHAR(20) NOT NULL,
    `correo` VARCHAR(150) NULL,
    `direccion` TEXT NULL,
    `contacto_emergencia_nombre` VARCHAR(150) NULL,
    `contacto_emergencia_telefono` VARCHAR(20) NULL,
    `fecha_registro` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estados_membresias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_membresias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `duracion_dias` INTEGER NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `estado` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_visitas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `costo` DECIMAL(10, 2) NOT NULL,
    `estado` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_estado_cliente_id_fkey` FOREIGN KEY (`estado_cliente_id`) REFERENCES `estados_clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
