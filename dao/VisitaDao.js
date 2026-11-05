import { BaseDao } from './BaseDao.js';

export class VisitaDao extends BaseDao {
    constructor() {
        super('visita');
    }

    // ─── Inclusión estándar para consultas ───────────────────────────────────
    get #include() {
        return { tipoVisita: true };
    }

    async getAll(additionalWhere = {}) {
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
    async obtenerVisitasPorPeriodo(fechaInicio, fechaFin) {
        const inicio = new Date(fechaInicio);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(fechaFin);
        fin.setHours(23, 59, 59, 999);

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
