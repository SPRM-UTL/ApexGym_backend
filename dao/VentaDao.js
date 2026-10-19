import { BaseDao } from './BaseDao.js';

const SELECT_PERSONA = { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true };

const INCLUDE_BASE = {
    cliente: { select: SELECT_PERSONA },
    empleado: { select: SELECT_PERSONA },
    metodoPago: { select: { id: true, nombre: true } },
    aperturaCaja: {
        select: {
            id: true,
            estado: true,
            fechaApertura: true,
            caja: { select: { id: true, nombre: true } },
        },
    },
};

const INCLUDE_LISTADO = {
    ...INCLUDE_BASE,
    _count: { select: { detalles: { where: { deletedAt: null } } } },
};

const INCLUDE_DETALLE = {
    ...INCLUDE_BASE,
    detalles: {
        where: { deletedAt: null },
        orderBy: { id: 'asc' },
        omit: { createdAt: true, updatedAt: true, deletedAt: true },
        include: {
            producto: { select: { id: true, nombre: true, codigoBarras: true } },
        },
    },
};

export class VentaDao extends BaseDao {
    constructor() {
        super('venta');
    }

    /**
     * Lista ventas con filtros opcionales.
     * @param {object} [where] - Condiciones Prisma adicionales (fecha, cliente, método, estado...).
     */
    async getAll(where = {}) {
        return this.model.findMany({
            where: { deletedAt: null, ...where },
            include: INCLUDE_LISTADO,
            orderBy: [{ fechaVenta: 'desc' }, { id: 'desc' }],
            omit: this.omit,
        });
    }

    /** Detalle completo de una venta (cabecera + partidas). */
    async getById(id) {
        return this.model.findFirst({
            where: { id: Number(id), deletedAt: null },
            include: INCLUDE_DETALLE,
            omit: this.omit,
        });
    }
}

export const ventaDao = new VentaDao();
