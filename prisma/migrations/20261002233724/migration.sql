/*
  Warnings:

  - You are about to alter the column `estado` on the `categoria_productos` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(30)`.

*/
-- AlterTable
ALTER TABLE `categoria_productos` MODIFY `descripcion` TEXT NULL,
    MODIFY `estado` VARCHAR(30) NOT NULL DEFAULT 'activo';
