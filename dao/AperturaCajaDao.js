import { BaseDao } from './BaseDao.js';

const INCLUDE_EMPLEADO = {
    select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
};

const INCLUDE_CAJA = {
    select: { id: true, nombre: true, ubicacion: true },
};

const INCLUDE_DEFAULT = {
    caja: INCLUDE_CAJA,
    empleado: INCLUDE_EMPLEADO,
};

export class AperturaCajaDao extends BaseDao {
    constructor() {
        super('aperturaCaja', {
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async getAll(additionalWhere = {}, additionalOrderBy = [{ id: 'desc' }, { fechaApertura: 'desc' }], empresaId, sucursalId) {
        return this.prisma.aperturaCaja.findMany({
            where: this.aplicarFiltrosContexto({ deletedAt: null, ...additionalWhere }, empresaId, sucursalId),
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: additionalOrderBy,
        });
    }

    async getById(id, empresaId, sucursalId) {
        return this.prisma.aperturaCaja.findFirst({
            where: this.aplicarFiltrosContexto({ id: Number(id), deletedAt: null }, empresaId, sucursalId),
            omit: this.omit,
            include: INCLUDE_DEFAULT,
        });
    }
}

export const aperturaCajaDao = new AperturaCajaDao();
