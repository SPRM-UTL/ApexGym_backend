import { BaseDao } from './BaseDao.js';

const INCLUDE_EMPLEADO = {
    select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true },
};

const INCLUDE_DEFAULT = {
    aperturaCaja: {
        select: {
            id: true,
            fechaApertura: true,
            montoInicial: true,
            estado: true,
            caja: { select: { id: true, nombre: true } },
        },
    },
    empleado: INCLUDE_EMPLEADO,
};

export class CorteCajaDao extends BaseDao {
    constructor() {
        super('corteCaja', {
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async getAll() {
        return this.prisma.corteCaja.findMany({
            where: { deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: { fechaCorte: 'desc' },
        });
    }

    async getById(id) {
        return this.prisma.corteCaja.findUnique({
            where: { id, deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
        });
    }

    async getByApertura(aperturaCajaId) {
        return this.prisma.corteCaja.findMany({
            where: { aperturaCajaId, deletedAt: null },
            omit: this.omit,
            include: INCLUDE_DEFAULT,
            orderBy: { fechaCorte: 'desc' },
        });
    }
}

export const corteCajaDao = new CorteCajaDao();
