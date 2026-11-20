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

    async getByCodigoQr(codigoQr) {
        return this.model.findFirst({
            where: {
                codigoQr: String(codigoQr).trim(),
                deletedAt: null,
            },
            include: {
                estadoCliente: true
            },
            omit: this.omit
        });
    }

    async actualizarCodigoQr(clienteId, codigoQr) {
        return this.model.update({
            where: { id: Number(clienteId) },
            data: { codigoQr: String(codigoQr).trim() },
            include: {
                estadoCliente: true
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
        const consulta = String(termino ?? '').trim();
        const palabras = consulta.split(/\s+/).filter(Boolean);
        return this.model.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { nombre:          { contains: consulta } },
                    { apellidoPaterno: { contains: consulta } },
                    { apellidoMaterno: { contains: consulta } },
                    { correo:          { contains: consulta } },
                    { telefono:        { contains: consulta } },
                    ...(palabras.length > 1 ? [{
                        AND: palabras.map((p) => ({
                            OR: [
                                { nombre:          { contains: p } },
                                { apellidoPaterno: { contains: p } },
                                { apellidoMaterno: { contains: p } },
                            ]
                        }))
                    }] : []),
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
