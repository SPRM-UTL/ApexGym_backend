import { BaseDao } from './BaseDao.js';

export class EmpleadoDao extends BaseDao {
    constructor() {
        super('empleado', {
            // Omisión de información delicada y campos de auditoría (createdAt, updatedAt, deletedAt)
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            }
        });
    }

    async getAll(additionalWhere = {}, additionalOrderBy = { nombre: 'asc' }, empresaId, sucursalId) {
        return this.prisma.empleado.findMany({
            where: this.aplicarFiltrosContexto({ deletedAt: null, ...additionalWhere }, empresaId, sucursalId),
            omit: this.omit,
            include: {
                puesto: { select: { id: true, nombre: true } },
                areaTrabajo: { select: { id: true, nombre: true } },
                estadoEmpleado: { select: { id: true, nombre: true } },
                usuario: { select: { id: true, nombre: true, email: true } },
            },
            orderBy: additionalOrderBy,
        });
    }

    async getById(id, empresaId, sucursalId) {
        return this.prisma.empleado.findFirst({
            where: this.aplicarFiltrosContexto({ id: Number(id), deletedAt: null }, empresaId, sucursalId),
            omit: this.omit,
            include: {
                puesto: { select: { id: true, nombre: true } },
                areaTrabajo: { select: { id: true, nombre: true } },
                estadoEmpleado: { select: { id: true, nombre: true } },
                usuario: { select: { id: true, nombre: true, email: true } },
            },
        });
    }

    async create(data, empresaId, sucursalId) {
        return this.prisma.empleado.create({
            data: this.aplicarDatosContexto({
                puestoId: data.puestoId,
                areaTrabajoId: data.areaTrabajoId,
                estadoEmpleadoId: data.estadoEmpleadoId,
                usuarioId: data.usuarioId || null,
                nombre: data.nombre,
                apellidoPaterno: data.apellidoPaterno,
                apellidoMaterno: data.apellidoMaterno || null,
                telefono: data.telefono,
                correo: data.correo || null,
                direccion: data.direccion || null,
                fechaNacimiento: data.fechaNacimiento,
                fechaIngreso: data.fechaIngreso,
                imagenUrl: data.imagenUrl || null,
                imagenPublicId: data.imagenPublicId || null,
            }, empresaId, sucursalId),
            omit: this.omit,
            include: {
                puesto: { select: { id: true, nombre: true } },
                areaTrabajo: { select: { id: true, nombre: true } },
                estadoEmpleado: { select: { id: true, nombre: true } },
                usuario: { select: { id: true, nombre: true, email: true } },
            },
        });
    }

    async update(id, data) {
        return this.prisma.empleado.update({
            where: { id },
            data: {
                puestoId: data.puestoId,
                areaTrabajoId: data.areaTrabajoId,
                estadoEmpleadoId: data.estadoEmpleadoId,
                usuarioId: data.usuarioId || null,
                nombre: data.nombre,
                apellidoPaterno: data.apellidoPaterno,
                apellidoMaterno: data.apellidoMaterno !== undefined ? data.apellidoMaterno : undefined,
                telefono: data.telefono,
                correo: data.correo !== undefined ? data.correo : undefined,
                direccion: data.direccion !== undefined ? data.direccion : undefined,
                fechaNacimiento: data.fechaNacimiento,
                fechaIngreso: data.fechaIngreso,
                imagenUrl: data.imagenUrl !== undefined ? data.imagenUrl : undefined,
                imagenPublicId: data.imagenPublicId !== undefined ? data.imagenPublicId : undefined,
            },
            omit: this.omit,
            include: {
                puesto: { select: { id: true, nombre: true } },
                areaTrabajo: { select: { id: true, nombre: true } },
                estadoEmpleado: { select: { id: true, nombre: true } },
                usuario: { select: { id: true, nombre: true, email: true } },
            },
        });
    }
}

export const empleadoDao = new EmpleadoDao();
