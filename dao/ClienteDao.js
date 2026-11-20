import { BaseDao } from './BaseDao.js';

export class ClienteDao extends BaseDao {
    constructor() {
        super('cliente');
    }

    async getAll(additionalWhere = {}, additionalOrderBy = { id: 'desc' }, empresaId, sucursalId) {
        return this.model.findMany({
            where: this.aplicarFiltrosContexto({
                deletedAt: null,
                ...additionalWhere
            }, empresaId, sucursalId),
            orderBy: additionalOrderBy,
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async getById(id, empresaId, sucursalId) {
        return this.model.findFirst({
            where: this.aplicarFiltrosContexto({
                id: Number(id),
                deletedAt: null,
            }, empresaId, sucursalId),
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async getByUser(usuarioId) {
        return this.model.findFirst({
            where: {
                usuarioId: Number(usuarioId),
                deletedAt: null,
            },
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async buscarPorNombre(termino, { sucursalId: _sucursalId = null } = {}) {
        return this.model.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { nombre:          { contains: termino } },
                    { apellidoPaterno: { contains: termino } },
                    { apellidoMaterno: { contains: termino } },
                ]
            },
            include: { estadoCliente: true },
            orderBy: { nombre: 'asc' },
            take: 20,
            omit: this.omit
        });
    }
}

export const clienteDao = new ClienteDao();
