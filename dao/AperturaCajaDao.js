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

    async getAll() {
        return this.prisma.aperturaCaja.findMany({
            where: { deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: { fechaApertura: 'desc' },
        });
    }

    async getById(id) {
        return this.prisma.aperturaCaja.findUnique({
            where: { id, deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
        });
    }
}

export const aperturaCajaDao = new AperturaCajaDao();
