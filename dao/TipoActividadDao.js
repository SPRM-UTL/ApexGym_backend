import { BaseDao } from './BaseDao.js';

export class TipoActividadDao extends BaseDao {
    constructor() {
        super('tipoActividad');
    }

    async getAll() {
        return this.prisma.tipoActividad.findMany({
            where: { deletedAt: null },
            include: {
                areaTrabajo: {
                    select: { id: true, nombre: true },
                },
            },
            orderBy: { nombre: 'asc' },
        });
    }

    async create(data) {
        return this.prisma.tipoActividad.create({
            data: {
                areaTrabajoId: data.areaTrabajoId || null,
                nombre: data.nombre,
                descripcion: data.descripcion || null,
                estado: data.estado,
            },
            include: { areaTrabajo: { select: { id: true, nombre: true } } },
        });
    }

    async update(id, data) {
        return this.prisma.tipoActividad.update({
            where: { id },
            data: {
                areaTrabajoId: data.areaTrabajoId || null,
                nombre: data.nombre,
                descripcion: data.descripcion || null,
                estado: data.estado,
            },
            include: { areaTrabajo: { select: { id: true, nombre: true } } },
        });
    }
}

export const tipoActividadDao = new TipoActividadDao();
