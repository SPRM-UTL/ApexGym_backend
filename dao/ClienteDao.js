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

    /**
     * Busca clientes activos cuyo nombre, apellido paterno o apellido materno
     * contenga el término de búsqueda. Máximo 20 resultados.
     * @param {string} termino
     */
    async buscarPorNombre(termino) {
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
