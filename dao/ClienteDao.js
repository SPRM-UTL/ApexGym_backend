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
        const palabras = consulta.split(/\s+/).filter(Boolean);
        const where = {
            deletedAt: null,
            OR: [
                { nombre: { contains: consulta } },
                { apellidoPaterno: { contains: consulta } },
                { apellidoMaterno: { contains: consulta } },
                ...(palabras.length > 1 ? [{
                    AND: palabras.map((p) => ({
                        OR: [
                            { nombre: { contains: p } },
                            { apellidoPaterno: { contains: p } },
                            { apellidoMaterno: { contains: p } },
                        ],
                    })),
                }] : []),
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
