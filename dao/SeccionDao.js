import { BaseDao, prisma } from "./BaseDao.js";

export class SeccionDao extends BaseDao {
    constructor() {
        super("seccion");
    }

    /**
     * Devuelve las secciones activas junto con los módulos a los que
     * el usuario tiene al menos un permiso (por rol o directo).
     * @param {number} usuarioId
     * @returns {Array} secciones con sus módulos permitidos
     */
    async obtenerSeccionesConModulosPermitidos(usuarioId) {

        // Roles activos del usuario
        const usuarioRoles = await prisma.usuarioRol.findMany({
            where: { usuarioId, deletedAt: null },
            select: { rolId: true },
        });
        const rolIds = usuarioRoles.map((ur) => ur.rolId);

        // IDs de módulos con permiso por rol
        const permisosRol = rolIds.length > 0
            ? await prisma.permiso.findMany({
                where: {
                    deletedAt: null,
                    roles: { some: { rolId: { in: rolIds }, deletedAt: null } },
                },
                select: { moduloId: true },
                distinct: ["moduloId"],
            })
            : [];

        // IDs de módulos con permiso directo
        const permisosDirectos = await prisma.permiso.findMany({
            where: {
                deletedAt: null,
                usuarios: { some: { usuarioId, deletedAt: null } },
            },
            select: { moduloId: true },
            distinct: ["moduloId"],
        });

        const moduloIdsPermitidos = [
            ...new Set([
                ...permisosRol.map((p) => p.moduloId),
                ...permisosDirectos.map((p) => p.moduloId),
            ]),
        ];

        if (moduloIdsPermitidos.length === 0) {
            return [];
        }

        // Secciones activas que tengan al menos un módulo permitido
        const secciones = await prisma.seccion.findMany({
            where: {
                deletedAt: null,
                modulos: {
                    some: {
                        id: { in: moduloIdsPermitidos },
                        deletedAt: null,
                    },
                },
            },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                imagenUrl: true,
                modulos: {
                    where: {
                        id: { in: moduloIdsPermitidos },
                        deletedAt: null,
                    },
                    select: {
                        id: true,
                        nombre: true,
                        descripcion: true,
                    },
                    orderBy: { nombre: "asc" },
                },
            },
            orderBy: { nombre: "asc" },
        });

        return secciones;
    }
}

export const seccionDao = new SeccionDao();
