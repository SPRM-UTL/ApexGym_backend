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

    async buscarPorNombreOId(termino, { pagina = 1, limite = 20 } = {}) {
        const consulta = String(termino ?? '').trim();
        const idNumerico = /^\d+$/.test(consulta) ? Number(consulta) : null;
        const where = {
            deletedAt: null,
            OR: [
                { nombre: { contains: consulta } },
                { apellidoPaterno: { contains: consulta } },
                { apellidoMaterno: { contains: consulta } },
                ...(Number.isSafeInteger(idNumerico) && idNumerico > 0 ? [{ id: idNumerico }] : []),
            ],
        };
        const skip = (pagina - 1) * limite;
        const select = {
            id: true,
            nombre: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
        };

        const [registros, total] = await Promise.all([
            this.model.findMany({
                where,
                select,
                orderBy: [{ nombre: 'asc' }, { apellidoPaterno: 'asc' }, { id: 'asc' }],
                skip,
                take: limite,
            }),
            this.model.count({ where }),
        ]);

        return { registros, total, pagina, limite };
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
