import { BaseDao } from "./BaseDao.js";

export class RolDao extends BaseDao {
    constructor() {
        super("rol", {});
    }

    async getAll() {
        return this.prisma.rol.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
            },
            orderBy: { nombre: 'asc' },
        });
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
