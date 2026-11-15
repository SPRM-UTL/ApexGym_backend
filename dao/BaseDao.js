import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { contextStorage } from '../middleware/contextoMiddleware.js';

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

const MODELOS_SIN_SUCURSAL = new Set([
    'empresa',
    'sucursal',
    'usuario',
    'token',
    'seccion',
    'modulo',
    'accion',
    'permiso',
    'rol',
    'rolPermiso',
    'usuarioRol',
    'usuarioPermiso',
]);

export class BaseDao {
    /**
     * @param {string} modelName - Nombre del modelo Prisma
     * @param {object} [configuracion] - Opciones de configuración del DAO ({ omit, useEmpresa, useSucursal })
     */
    constructor(modelName, configuracion = {}) {
        const normalizedModelName =
            typeof modelName === 'string' && modelName.length > 0
                ? modelName.charAt(0).toLowerCase() + modelName.slice(1)
                : modelName;

        this.modelName = normalizedModelName;
        this.prisma = prisma;
        this.model = prisma[modelName] || prisma[normalizedModelName];

        // Por defecto true en modelos operativos; false en catálogos RBAC globales
        this.useEmpresa =
            configuracion.useEmpresa !== undefined
                ? Boolean(configuracion.useEmpresa)
                : !MODELOS_SIN_EMPRESA.has(normalizedModelName);

        // Por defecto true en los 23 modelos operativos con sucursal; false en empresa, sucursal, usuario y RBAC
        this.useSucursal =
            configuracion.useSucursal !== undefined
                ? Boolean(configuracion.useSucursal)
                : !MODELOS_SIN_SUCURSAL.has(normalizedModelName);

        // Omisión automática de campos delicados / auditoría
        this.omit = {
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            ...(configuracion.omit || {}),
        };
    }

    obtenerContextoActual() {
        const store = contextStorage.getStore();
        return {
            empresaId: store?.empresaId ?? 1,
            sucursalId: store?.sucursalId ?? 1,
        };
    }

    resolverEmpresaId(empresaId) {
        if (empresaId !== undefined && empresaId !== null) {
            const parsed = Number(empresaId);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
        }
        return this.obtenerContextoActual().empresaId;
    }

    resolverSucursalId(sucursalId) {
        if (sucursalId === 'todas' || sucursalId === null) {
            return null; // No filtrar por sucursal específica
        }
        if (sucursalId !== undefined) {
            const parsed = Number(sucursalId);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
        }
        const ctxSucursal = this.obtenerContextoActual().sucursalId;
        return ctxSucursal !== null ? ctxSucursal : 1;
    }

    aplicarFiltrosContexto(where = {}, empresaId, sucursalId) {
        const resultado = { ...where };

        if (this.useEmpresa && resultado.empresaId === undefined) {
            resultado.empresaId = this.resolverEmpresaId(empresaId);
        }

        if (this.useSucursal && resultado.sucursalId === undefined) {
            const sId = this.resolverSucursalId(sucursalId);
            if (sId !== null) {
                resultado.sucursalId = sId;
            }
        }

        return resultado;
    }

    // Alias retrocompatible
    aplicarFiltroEmpresa(where = {}, empresaId, sucursalId) {
        return this.aplicarFiltrosContexto(where, empresaId, sucursalId);
    }

    aplicarDatosContexto(data = {}, empresaId, sucursalId) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const resultado = { ...data };

        if (this.useEmpresa && resultado.empresaId === undefined) {
            resultado.empresaId = this.resolverEmpresaId(empresaId);
        }

        if (this.useSucursal && resultado.sucursalId === undefined) {
            const sId = this.resolverSucursalId(sucursalId) ?? 1;
            resultado.sucursalId = sId;
        }

        return resultado;
    }

    // Alias retrocompatible
    aplicarDatosEmpresa(data = {}, empresaId, sucursalId) {
        return this.aplicarDatosContexto(data, empresaId, sucursalId);
    }

    async getAll(additionalWhere = {}, additionalOrderBy = { id: 'desc' }, empresaId, sucursalId) {
        return this.model.findMany({
            where: this.aplicarFiltrosContexto(
                {
                    deletedAt: null,
                    ...additionalWhere,
                },
                empresaId,
                sucursalId
            ),
            orderBy: additionalOrderBy,
            omit: this.omit,
        });
    }

    async getById(id, empresaId, sucursalId) {
        return this.model.findFirst({
            where: this.aplicarFiltrosContexto(
                {
                    id: Number(id),
                    deletedAt: null,
                },
                empresaId,
                sucursalId
            ),
            omit: this.omit,
        });
    }

    async create(data, empresaId, sucursalId) {
        return this.model.create({
            data: this.aplicarDatosContexto(data, empresaId, sucursalId),
            omit: this.omit,
        });
    }

    async update(id, data, empresaId, sucursalId) {
        const payload = this.aplicarDatosContexto(data, empresaId, sucursalId);

        return this.model.update({
            where: {
                id: Number(id),
            },
            data: payload,
            omit: this.omit,
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
