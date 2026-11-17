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
}

export const clienteDao = new ClienteDao();
