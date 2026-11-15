import { BaseDao } from './BaseDao.js';

const INCLUDE_EMPLEADO = {
    select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
};

const INCLUDE_DEFAULT = {
    aperturaCaja: {
        select: {
            id: true,
            fechaApertura: true,
            estado: true,
            caja: { select: { id: true, nombre: true } },
        },
    },
    empleado: INCLUDE_EMPLEADO,
};

export class MovimientoCajaDao extends BaseDao {
    constructor() {
        super('movimientoCaja', {
            omit: {
                createdAt: false,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async getAll(additionalWhere = {}, additionalOrderBy = [{ id: 'desc' }, { createdAt: 'desc' }], empresaId, sucursalId) {
        return this.prisma.movimientoCaja.findMany({
            where: this.aplicarFiltrosContexto({ deletedAt: null, ...additionalWhere }, empresaId, sucursalId),
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: additionalOrderBy,
        });
    }

    async getById(id, empresaId, sucursalId) {
        return this.prisma.movimientoCaja.findFirst({
            where: this.aplicarFiltrosContexto({ id: Number(id), deletedAt: null }, empresaId, sucursalId),
            omit: this.omit,
            include: INCLUDE_DEFAULT,
        });
    }

    async getAllByApertura(aperturaCajaId) {
        return this.prisma.movimientoCaja.findMany({
            where: { aperturaCajaId, deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: { createdAt: 'asc' },
        });
    }
}

export const movimientoCajaDao = new MovimientoCajaDao();
