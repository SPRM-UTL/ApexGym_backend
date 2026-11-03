import { BaseDao } from './BaseDao.js';

export class ClienteDao extends BaseDao {
    constructor() {
        super('cliente');
    }

    async getAll(additionalWhere = {}) {
        return this.model.findMany({
            where: {
                deletedAt: null,
                ...additionalWhere
            },
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async getById(id) {
        return this.model.findUnique({
            where: {
                id: id,
                deletedAt: null,
            },
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }
    
    async getByUser(id) {
        return this.model.findUnique({
            where: {
                usuarioId: id,
                deletedAt: null,
            },
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async getByEmail(email) {
        return this.model.findFirst({
            where: {
                correo: email,
                deletedAt: null,
            },
            omit: this.omit
        });
    }
}

export const clienteDao = new ClienteDao();
