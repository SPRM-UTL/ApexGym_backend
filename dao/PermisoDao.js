import { BaseDao, prisma } from "./BaseDao.js";

export class PermisoDao extends BaseDao {
    constructor() {
        super("permiso");
    }

    /**
     * Obtiene todos los permisos efectivos de un usuario:
     * - Los que tiene por sus roles activos
     * - Los que tiene directamente asignados
     * Retorna un Set con claves "MODULO|ACCION|METODO" para búsqueda O(1).
     */
    async obtenerPermisosEfectivos(usuarioId) {

        // IDs de roles activos del usuario
        const usuarioRoles = await prisma.usuarioRol.findMany({
            where: {
                usuarioId,
                deletedAt: null,
            },
            select: { rolId: true },
        });

        const rolIds = usuarioRoles.map((ur) => ur.rolId);

        // Permisos activos de esos roles
        const permisosRol = rolIds.length > 0
            ? await prisma.permiso.findMany({
                where: {
                    deletedAt: null,
                    roles: {
                        some: {
                            rolId: { in: rolIds },
                            deletedAt: null,
                        },
                    },
                },
                include: {
                    modulo: true,
                    accion: true,
                },
            })
            : [];

        // Permisos directos del usuario
        const permisosDirectos = await prisma.permiso.findMany({
            where: {
                deletedAt: null,
                usuarios: {
                    some: {
                        usuarioId,
                        deletedAt: null,
                    },
                },
            },
            include: {
                modulo: true,
                accion: true,
            },
        });

        const todos = [...permisosRol, ...permisosDirectos];

        // Construir Set con clave compuesta MODULO|ACCION|METODO
        const claves = new Set(
            todos.map((p) => `${p.modulo.nombre}|${p.accion.nombre}|${p.metodo}`)
        );

        return claves;
    }

    /**
     * Verifica si un usuario tiene un permiso específico.
     * @param {number} usuarioId
     * @param {string} modulo  - Ej: "Usuarios"
     * @param {string} accion  - Ej: "Listar"
     * @param {string} metodo  - Ej: "GET"
     */
    async tienePermiso(usuarioId, modulo, accion, metodo) {
        const claves = await this.obtenerPermisosEfectivos(usuarioId);
        return claves.has(`${modulo}|${accion}|${metodo}`);
    }
}

export const permisoDao = new PermisoDao();
