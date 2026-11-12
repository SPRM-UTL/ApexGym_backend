-- CreateTable
CREATE TABLE `transacciones_pagos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresa_id` INTEGER NOT NULL DEFAULT 1,
    `uuid_idempotencia` VARCHAR(100) NOT NULL,
    `proveedor` ENUM('SANDBOX_SIMULADO', 'MERCADO_PAGO', 'PAYPAL', 'STRIPE', 'TERMINAL_MANUAL', 'EFECTIVO') NOT NULL DEFAULT 'SANDBOX_SIMULADO',
    `referencia_externa` VARCHAR(150) NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `moneda` VARCHAR(10) NOT NULL DEFAULT 'MXN',
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'EXPIRADO', 'REEMBOLSADO') NOT NULL DEFAULT 'PENDIENTE',
    `concepto` VARCHAR(255) NOT NULL,
    `correo_cliente` VARCHAR(191) NULL,
    `datos_respuesta` TEXT NULL,
    `url_checkout` VARCHAR(500) NULL,
    `folio_voucher` VARCHAR(100) NULL,
    `metadatos` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `transacciones_pagos_uuid_idempotencia_key`(`uuid_idempotencia`),
    INDEX `transacciones_pagos_empresa_id_estado_idx`(`empresa_id`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transacciones_pagos` ADD CONSTRAINT `transacciones_pagos_empresa_id_fkey` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
