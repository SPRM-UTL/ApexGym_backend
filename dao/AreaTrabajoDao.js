import { BaseDao } from './BaseDao.js';

export class AreaTrabajoDao extends BaseDao {
    constructor() {
        super('areaTrabajo');
    }

    async getAll() {
        return this.prisma.areaTrabajo.findMany({
            where: { deletedAt: null, estado: 'ACTIVO' },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' },
        });
    }
}

export const areaTrabajoDao = new AreaTrabajoDao();
