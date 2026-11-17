import { BaseDao } from "./BaseDao.js";
import {
    ESTADOS_ACTIVOS_CATALOGO,
    normalizarEstadoCatalogo,
} from "../utils/constantes.js";

export class ServicioDao extends BaseDao {
    constructor() {
        super("servicio",
            {
                omit: {
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                }
            }
        );
    }

    async getAll(additionalWhere = {}) {
        const registros = await this.model.findMany({
            where: {
                deletedAt: null,
                ...additionalWhere,
            },
            omit: this.omit,
        });
        return registros.map((registro) => ({
            ...registro,
            estado: normalizarEstadoCatalogo(registro.estado),
        }));
    }

    async obtenerCatalogoPaginado({ termino, pagina, limite, orden }) {
        const where = {
            deletedAt: null,
            ...(termino && { nombre: { contains: termino } }),
        };
        const skip = (pagina - 1) * limite;
        const orderBy = {
            'nombre-asc': [{ nombre: 'asc' }, { id: 'asc' }],
            'nombre-desc': [{ nombre: 'desc' }, { id: 'desc' }],
            'precio-asc': [{ precio: 'asc' }, { id: 'asc' }],
            'precio-desc': [{ precio: 'desc' }, { id: 'desc' }],
        }[orden];
        const select = { id: true, nombre: true, precio: true, imagenUrl: true };

        const [registros, total] = await Promise.all([
            this.model.findMany({ where, select, orderBy, skip, take: limite }),
            this.model.count({ where }),
        ]);

        return { registros, total, pagina, limite };
    }

    async obtenerDisponiblesParaVenta(empresaId, sucursalId) {
        const registros = await this.model.findMany({
            where: this.aplicarFiltrosContexto({
                deletedAt: null,
                estado: { in: ESTADOS_ACTIVOS_CATALOGO },
                disponibleCompra: true,
            }, empresaId, sucursalId),
            orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
            omit: this.omit,
        });
        return registros.map((registro) => ({
            ...registro,
            estado: normalizarEstadoCatalogo(registro.estado),
        }));
    }
}

export const servicioDao = new ServicioDao();
