/*
  Warnings:

  - You are about to alter the column `estado` on the `categoria_productos` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(30)`.

*/
-- DropIndex
DROP INDEX `aperturas_caja_caja_id_fkey` ON `aperturas_caja`;

-- DropIndex
DROP INDEX `aperturas_caja_empleado_id_fkey` ON `aperturas_caja`;

-- DropIndex
DROP INDEX `clientes_estado_cliente_id_fkey` ON `clientes`;

-- DropIndex
DROP INDEX `cortes_caja_apertura_caja_id_fkey` ON `cortes_caja`;

-- DropIndex
DROP INDEX `cortes_caja_empleado_id_fkey` ON `cortes_caja`;

-- DropIndex
DROP INDEX `empleados_area_trabajo_id_fkey` ON `empleados`;

-- DropIndex
DROP INDEX `empleados_estado_empleado_id_fkey` ON `empleados`;

-- DropIndex
DROP INDEX `empleados_puesto_id_fkey` ON `empleados`;

-- DropIndex
DROP INDEX `empleados_usuario_id_fkey` ON `empleados`;

-- DropIndex
DROP INDEX `movimientos_caja_apertura_caja_id_fkey` ON `movimientos_caja`;

-- DropIndex
DROP INDEX `movimientos_caja_empleado_id_fkey` ON `movimientos_caja`;

-- DropIndex
DROP INDEX `permisos_accion_id_fkey` ON `permisos`;

-- DropIndex
DROP INDEX `puestos_area_trabajo_id_fkey` ON `puestos`;

-- DropIndex
DROP INDEX `roles_permisos_permiso_id_fkey` ON `roles_permisos`;

-- DropIndex
DROP INDEX `tipos_actividades_area_trabajo_id_fkey` ON `tipos_actividades`;

-- DropIndex
DROP INDEX `tokens_usuario_id_fkey` ON `tokens`;

-- DropIndex
DROP INDEX `usuarios_permisos_permiso_id_fkey` ON `usuarios_permisos`;

-- DropIndex
DROP INDEX `usuarios_roles_rol_id_fkey` ON `usuarios_roles`;

-- AlterTable
ALTER TABLE `categoria_productos` MODIFY `descripcion` TEXT NULL,
    MODIFY `estado` VARCHAR(30) NOT NULL DEFAULT 'activo';

-- AddForeignKey
ALTER TABLE `tokens` ADD CONSTRAINT `tokens_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `modulos` ADD CONSTRAINT `modulos_seccion_id_fkey` FOREIGN KEY (`seccion_id`) REFERENCES `secciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puestos` ADD CONSTRAINT `puestos_area_trabajo_id_fkey` FOREIGN KEY (`area_trabajo_id`) REFERENCES `areas_trabajos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_puesto_id_fkey` FOREIGN KEY (`puesto_id`) REFERENCES `puestos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_area_trabajo_id_fkey` FOREIGN KEY (`area_trabajo_id`) REFERENCES `areas_trabajos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_estado_empleado_id_fkey` FOREIGN KEY (`estado_empleado_id`) REFERENCES `estados_empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tipos_actividades` ADD CONSTRAINT `tipos_actividades_area_trabajo_id_fkey` FOREIGN KEY (`area_trabajo_id`) REFERENCES `areas_trabajos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permisos` ADD CONSTRAINT `permisos_modulo_id_fkey` FOREIGN KEY (`modulo_id`) REFERENCES `modulos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permisos` ADD CONSTRAINT `permisos_accion_id_fkey` FOREIGN KEY (`accion_id`) REFERENCES `acciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles_permisos` ADD CONSTRAINT `roles_permisos_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles_permisos` ADD CONSTRAINT `roles_permisos_permiso_id_fkey` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_roles` ADD CONSTRAINT `usuarios_roles_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_roles` ADD CONSTRAINT `usuarios_roles_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_permisos` ADD CONSTRAINT `usuarios_permisos_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_permisos` ADD CONSTRAINT `usuarios_permisos_permiso_id_fkey` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_estado_cliente_id_fkey` FOREIGN KEY (`estado_cliente_id`) REFERENCES `estados_clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
