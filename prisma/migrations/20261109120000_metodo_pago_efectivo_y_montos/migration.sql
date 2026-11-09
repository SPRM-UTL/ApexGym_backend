ALTER TABLE `metodo_pago`
    ADD COLUMN `codigo` VARCHAR(30) NULL;

UPDATE `metodo_pago`
SET `codigo` = 'EFECTIVO'
WHERE LOWER(TRIM(`nombre`)) = 'efectivo'
LIMIT 1;

CREATE UNIQUE INDEX `metodo_pago_codigo_key` ON `metodo_pago`(`codigo`);

ALTER TABLE `venta`
    ADD COLUMN `monto_recibido` DOUBLE NULL,
    ADD COLUMN `cambio` DOUBLE NULL;
