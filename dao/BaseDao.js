import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    allowPublicKeyRetrieval: true,
});

const adapter = new PrismaMariaDb(pool);
export const prisma = new PrismaClient({ adapter });

const MODELOS_SIN_EMPRESA = new Set([
    'empresa',
    'token',
    'seccion',
    'modulo',
    'accion',
    'permiso',
    'rolPermiso',
    'usuarioRol',
    'usuarioPermiso',
]);

export class BaseDao {
    /**
     * @param {string} modelName - Nombre del modelo Prisma
     * @param {object} [configuracion] - Opciones de configuración del DAO ({ omit, useEmpresa })
     */
    constructor(modelName, configuracion = {}) {
        const normalizedModelName =
            typeof modelName === 'string' && modelName.length > 0
                ? modelName.charAt(0).toLowerCase() + modelName.slice(1)
                : modelName;

        this.modelName = normalizedModelName;
        this.prisma = prisma;
        this.model = prisma[modelName] || prisma[normalizedModelName];

        // Por defecto true en modelos operativos; false en EmpresaDao, catálogos RBAC globales y tablas pivote
        this.useEmpresa =
            configuracion.useEmpresa !== undefined
                ? Boolean(configuracion.useEmpresa)
                : !MODELOS_SIN_EMPRESA.has(normalizedModelName);

        // Omisión automática de campos delicados / de auditoría (createdAt, updatedAt, deletedAt)
        // para evitar descargar información innecesaria o sensible en las respuestas.
        this.omit = {
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            ...(configuracion.omit || {})
        };
    }

    resolverEmpresaId(empresaId = 1) {
        const parsed = Number(empresaId);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }

    aplicarFiltroEmpresa(where = {}, empresaId = 1) {
        if (!this.useEmpresa) {
            return { ...where };
        }
        return {
            ...where,
            empresaId: where?.empresaId ?? this.resolverEmpresaId(empresaId),
        };
    }

    aplicarDatosEmpresa(data = {}, empresaId = 1) {
        if (!this.useEmpresa || !data || typeof data !== 'object') {
            return data;
        }
        return {
            ...data,
            empresaId: data.empresaId ?? this.resolverEmpresaId(empresaId),
        };
    }

    async getAll(additionalWhere = {}, additionalOrderBy = { id: 'desc' }, empresaId = 1) {
        return this.model.findMany({
            where: this.aplicarFiltroEmpresa(
                {
                    deletedAt: null,
                    ...additionalWhere,
                },
                empresaId
            ),
            orderBy: additionalOrderBy,
            omit: this.omit
        });
    }

    async getById(id, empresaId = 1) {
        return this.model.findUnique({
            where: this.aplicarFiltroEmpresa(
                {
                    id: Number(id),
                    deletedAt: null,
                },
                empresaId
            ),
            omit: this.omit
        });
    }

    async create(data, empresaId = 1) {
        return this.model.create({
            data: this.aplicarDatosEmpresa(data, empresaId),
            omit: this.omit
        });
    }

    async update(id, data, empresaId = 1) {
        const payload =
            this.useEmpresa && data && typeof data === 'object' && data.empresaId === undefined
                ? { ...data, empresaId: this.resolverEmpresaId(empresaId) }
                : data;

        return this.model.update({
            where: {
                id: Number(id),
            },
            data: payload,
            omit: this.omit
        });
    }

    async delete(id) {
        return this.model.update({
            where: {
                id: Number(id),
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
}
