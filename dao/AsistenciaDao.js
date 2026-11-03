import { BaseDao, prisma } from './BaseDao.js';

export class AsistenciaDao extends BaseDao {
    constructor() {
        super('asistencia');
    }

    // ─── Inclusión estándar para consultas ───────────────────────────────────
    get #include() {
        return {
            cliente: {
                select: {
                    id: true,
                    nombre: true,
                    apellidoPaterno: true,
                    apellidoMaterno: true,
                    telefono: true,
                    usuario: {
                        select: { fotoUrl: true }
                    }
                }
            },
            clienteMembresia: {
                include: {
                    tipoMembresia: true,
                    estadoMembresia: true
                }
            }
        };
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
     * Retorna el listado histórico de entradas de un socio.
     * @param {number} clienteId
     * @param {{ limite?: number, pagina?: number }} opciones
     */
    async obtenerHistorialPorCliente(clienteId, { limite = 20, pagina = 1 } = {}) {
        const skip = (pagina - 1) * limite;
        const [registros, total] = await Promise.all([
            this.model.findMany({
                where: { clienteId: Number(clienteId), deletedAt: null },
                include: this.#include,
                orderBy: { fechaHora: 'desc' },
                take: limite,
                skip,
                omit: this.omit
            }),
            this.model.count({
                where: { clienteId: Number(clienteId), deletedAt: null }
            })
        ]);
        return { registros, total, pagina, limite };
    }

    /**
     * Consulta todos los accesos registrados en una fecha.
     * Si no se pasa fecha usa el día de hoy.
     * @param {Date|string} [fecha]
     */
    async obtenerAsistenciasDelDia(fecha) {
        const dia = fecha ? new Date(fecha) : new Date();
        const inicio = new Date(dia);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(dia);
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

export const asistenciaDao = new AsistenciaDao();
