-- =====================================================================
-- Módulo: Control de Accesos (Asistencias y Visitas)
-- Descripción: Creación de tablas asistencias y visitas con sus FKs
-- =====================================================================

-- 1. Tabla de Asistencias
CREATE TABLE IF NOT EXISTS `asistencias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cliente_id` INT NOT NULL,
  `cliente_membresia_id` INT NULL,
  `fecha_hora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `observaciones` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_asistencias_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_membresia` FOREIGN KEY (`cliente_membresia_id`) REFERENCES `clientes_membresias` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Visitas
CREATE TABLE IF NOT EXISTS `visitas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre_visitante` VARCHAR(150) NOT NULL,
  `tipo_visita_id` INT NOT NULL,
  `costo` DECIMAL(10,2) NOT NULL,
  `fecha_hora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `observaciones` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_visitas_tipo_visita` FOREIGN KEY (`tipo_visita_id`) REFERENCES `tipos_visitas` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;