import { BaseDao } from "./BaseDao.js";

export class RolDao extends BaseDao {
    constructor() {
        super("rol", {});
    }

    async getAll() {
        const roles = await this.prisma.rol.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                permisos: {
                    where: { deletedAt: null, permiso: { deletedAt: null } },
                    select: {
                        permiso: {
                            select: {
                                id: true,
                                metodo: true,
                                descripcion: true,
                                modulo: {
                                    select: {
                                        id: true,
                                        nombre: true,
                                        seccion: { select: { id: true, nombre: true } },
                                    },
                                },
                                accion: { select: { id: true, nombre: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { nombre: 'asc' },
        });

        return roles.map(({ permisos, ...rol }) => ({
            ...rol,
            permisos: permisos.map(({ permiso }) => permiso),
        }));
    }

    async obtenerPermisos() {
        return this.prisma.permiso.findMany({
            where: { deletedAt: null, modulo: { deletedAt: null }, accion: { deletedAt: null } },
            select: {
                id: true,
                metodo: true,
                descripcion: true,
                modulo: {
                    select: {
                        id: true,
                        nombre: true,
                        seccion: { select: { id: true, nombre: true } },
                    },
                },
                accion: { select: { id: true, nombre: true } },
            },
            orderBy: [{ modulo: { nombre: 'asc' } }, { accion: { nombre: 'asc' } }],
        });
    }

    async crearRol(data) {
        return this.prisma.$transaction(async (tx) => {
            const rol = await tx.rol.create({
                data: {
                    nombre: data.nombre,
                    descripcion: data.descripcion || null,
                },
            });
            await this.sincronizarPermisos(tx, rol.id, data.permisosIds);
            return this.obtenerPorIdConPermisos(tx, rol.id);
        });
    }

    async actualizarRol(id, data) {
        return this.prisma.$transaction(async (tx) => {
            await tx.rol.update({
                where: { id },
                data: {
                    nombre: data.nombre,
                    descripcion: data.descripcion || null,
                },
            });
            await this.sincronizarPermisos(tx, id, data.permisosIds);
            return this.obtenerPorIdConPermisos(tx, id);
        });
    }

    async eliminarRol(id) {
        return this.prisma.rol.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async obtenerPorIdConPermisos(tx, id) {
        const rol = await tx.rol.findUnique({
            where: { id },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                permisos: {
                    where: { deletedAt: null, permiso: { deletedAt: null } },
                    select: {
                        permiso: {
                            select: {
                                id: true,
                                metodo: true,
                                modulo: {
                                    select: {
                                        id: true,
                                        nombre: true,
                                        seccion: { select: { id: true, nombre: true } },
                                    },
                                },
                                accion: { select: { id: true, nombre: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!rol) return null;
        return {
            ...rol,
            permisos: rol.permisos.map(({ permiso }) => permiso),
        };
    }

    async sincronizarPermisos(tx, rolId, permisosIds = []) {
        const ids = [...new Set(permisosIds.map(Number).filter(Number.isInteger))];
        const existentes = await tx.rolPermiso.findMany({ where: { rolId } });
        const existentesPorPermiso = new Map(existentes.map((item) => [item.permisoId, item]));

        for (const permisoId of ids) {
            const existente = existentesPorPermiso.get(permisoId);
            if (existente) {
                await tx.rolPermiso.update({
                    where: { rolId_permisoId: { rolId, permisoId } },
                    data: { deletedAt: null },
                });
            } else {
                await tx.rolPermiso.create({ data: { rolId, permisoId } });
            }
        }

        for (const existente of existentes) {
            if (!ids.includes(existente.permisoId)) {
                await tx.rolPermiso.update({
                    where: { rolId_permisoId: { rolId, permisoId: existente.permisoId } },
                    data: { deletedAt: new Date() },
                });
            }
        }
    }

    async asignarARol(usuarioId, rolId) {
        return this.prisma.usuarioRol.create({
            data: {
                usuarioId,
                rolId,
            },
        });
    }

    async removerDeUsuario(usuarioId, rolId) {
        return this.prisma.usuarioRol.update({
            where: {
                usuarioId_rolId: { usuarioId, rolId },
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
}

export const rolDao = new RolDao();
