import { BaseDao } from './BaseDao.js';

export class VisitaDao extends BaseDao {
    constructor() {
        super('visita');
    }

    // ─── Inclusión estándar para consultas ───────────────────────────────────
    get #include() {
        return { tipoVisita: true };
    }

    async getAll(additionalWhere = {}, _orderBy = undefined, _empresaId = undefined, { sucursalId: _sucursalId = null } = {}) {
        return this.model.findMany({
            where: { deletedAt: null, ...additionalWhere },
            include: this.#include,
            orderBy: { fechaHora: 'desc' },
            omit: this.omit
        });
    }

    async getById(id) {
        return this.model.findUnique({
            where: { id: Number(id), deletedAt: null },
            include: this.#include,
            omit: this.omit
        });
    }

    /**
     * Consulta visitas dentro de un rango de fechas para reportes y aforo.
     * @param {Date|string} fechaInicio
     * @param {Date|string} fechaFin
     */
    async obtenerVisitasPorPeriodo(fechaInicio, fechaFin, { sucursalId: _sucursalId = null } = {}) {
        // Las fechas del historial son días calendario de México (UTC-6).
        // Construir los límites explícitamente evita que el huso horario del
        // servidor convierta una visita nocturna al día siguiente.
        const inicio = new Date(`${fechaInicio}T00:00:00.000-06:00`);
        const fin = new Date(`${fechaFin}T23:59:59.999-06:00`);

        if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
            throw new Error('El rango de fechas de visitas no es válido');
        }

        return this.model.findMany({
            where: {
                deletedAt: null,
                fechaHora: { gte: inicio, lte: fin }
            },
            include: this.#include,
            orderBy: { fechaHora: 'desc' },
            omit: this.omit
        });
    }
}

export const visitaDao = new VisitaDao();
