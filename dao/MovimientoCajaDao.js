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
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async getAll() {
        return this.prisma.movimientoCaja.findMany({
            where: { deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: { createdAt: 'desc' },
        });
    }

    async getById(id) {
        return this.prisma.movimientoCaja.findUnique({
            where: { id, deletedAt: null },
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
