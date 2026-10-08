import { BaseDao } from './BaseDao.js';

export class PuestoDao extends BaseDao {
    constructor() {
        super('puesto', {
            // Omisión de información delicada y campos de auditoría (createdAt, updatedAt, deletedAt)
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            }
        });
    }

    async getAll() {
        return this.prisma.puesto.findMany({
            where: { deletedAt: null },
            omit: this.omit,
            include: {
                areaTrabajo: {
                    select: { id: true, nombre: true },
                },
            },
            orderBy: { nombre: 'asc' },
        });
    }

    async getById(id) {
        return this.prisma.puesto.findUnique({
            where: { id, deletedAt: null },
            omit: this.omit,
            include: {
                areaTrabajo: {
                    select: { id: true, nombre: true },
                },
            },
        });
    }

    async create(data) {
        return this.prisma.puesto.create({
            data: {
                areaTrabajoId: data.areaTrabajoId,
                nombre: data.nombre,
                descripcion: data.descripcion || null,
                salarioBase: data.salarioBase,
                estado: data.estado,
            },
            omit: this.omit,
            include: {
                areaTrabajo: {
                    select: { id: true, nombre: true },
                },
            },
        });
    }

    async update(id, data) {
        return this.prisma.puesto.update({
            where: { id },
            data: {
                areaTrabajoId: data.areaTrabajoId,
                nombre: data.nombre,
                descripcion: data.descripcion !== undefined ? data.descripcion : undefined,
                salarioBase: data.salarioBase,
                estado: data.estado,
            },
            omit: this.omit,
            include: {
                areaTrabajo: {
                    select: { id: true, nombre: true },
                },
            },
        });
    }
}

export const puestoDao = new PuestoDao();
