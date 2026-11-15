-- ==============================================================================
-- ApexGym — Migración documentada: Módulo de Asistencias y Visitas
-- Fecha: 2026-11-03
-- Tarea: [ASIS-01] Base de datos y modelado relacional de Asistencias y Visitas
-- Nota: La base de datos se sincroniza automáticamente mediante `npx prisma db push`.
--       Este script documenta formalmente las sentencias DDL aplicadas.
-- ==============================================================================

-- 1. Tabla de Asistencias (Registro de entradas de socios con membresía)
CREATE TABLE IF NOT EXISTS `asistencias` (
  `id`                    INT            NOT NULL AUTO_INCREMENT,
  `cliente_id`            INT            NOT NULL,
  `cliente_membresia_id`  INT            NULL,
  `fecha_hora`            DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `observaciones`         TEXT           NULL,
  `created_at`            DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3)    NOT NULL,
  `deleted_at`            DATETIME(3)    NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_asistencias_cliente`
    FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_cliente_membresia`
    FOREIGN KEY (`cliente_membresia_id`) REFERENCES `clientes_membresias` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Visitas (Registro de accesos temporales / pases diarios)
CREATE TABLE IF NOT EXISTS `visitas` (
  `id`                    INT            NOT NULL AUTO_INCREMENT,
  `nombre_visitante`      VARCHAR(150)   NOT NULL,
  `tipo_visita_id`        INT            NOT NULL,
  `costo`                 DECIMAL(10,2)  NOT NULL,
  `fecha_hora`            DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `observaciones`         TEXT           NULL,
  `created_at`            DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3)    NOT NULL,
  `deleted_at`            DATETIME(3)    NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_visitas_tipo_visita`
    FOREIGN KEY (`tipo_visita_id`) REFERENCES `tipos_visitas` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Índices de optimización para búsquedas frecuentes y aforo
CREATE INDEX `idx_asistencias_cliente_id` ON `asistencias` (`cliente_id`);
CREATE INDEX `idx_asistencias_fecha_hora` ON `asistencias` (`fecha_hora`);
CREATE INDEX `idx_visitas_fecha_hora` ON `visitas` (`fecha_hora`);
CREATE INDEX `idx_visitas_tipo_visita_id` ON `visitas` (`tipo_visita_id`);
