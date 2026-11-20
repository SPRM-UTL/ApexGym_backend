import { BaseDao } from "./BaseDao.js";
import {
  ESTADOS_ACTIVOS_CATALOGO,
  normalizarEstadoCatalogo,
} from "../utils/constantes.js";

export class ProductoDao extends BaseDao {
    constructor() {
        super(
            "Producto",
            {
                omit: {
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                }
            }
        );
    }
    // Sobrescribimos getAll para incluir los datos basicos de la categoria
  async getAll(additionalWhere = {}, additionalOrderBy = { id: 'desc' }, empresaId, sucursalId) {
    const registros = await this.model.findMany({
      where: this.aplicarFiltrosContexto({
        deletedAt: null,
        ...additionalWhere,
      }, empresaId, sucursalId),
      orderBy: additionalOrderBy,
      include: {
        categoria: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      omit: this.omit,
    });
    return registros.map((registro) => ({
      ...registro,
      estado: normalizarEstadoCatalogo(registro.estado),
    }));
  }

  async obtenerCatalogoPaginado({ termino, pagina, limite, categoriaId, orden }) {
    const where = {
      deletedAt: null,
      ...(categoriaId !== undefined && { categoriaProductoId: categoriaId }),
      ...(termino && {
        OR: [
          { nombre: { contains: termino } },
          { codigoBarras: { contains: termino } },
        ],
      }),
    };
    const skip = (pagina - 1) * limite;
    const orderBy = {
      'nombre-asc': [{ nombre: 'asc' }, { id: 'asc' }],
      'nombre-desc': [{ nombre: 'desc' }, { id: 'desc' }],
      'precio-asc': [{ precioVenta: 'asc' }, { id: 'asc' }],
      'precio-desc': [{ precioVenta: 'desc' }, { id: 'desc' }],
    }[orden];
    const select = {
      id: true,
      nombre: true,
      precioVenta: true,
      descuentoPorcentaje: true,
      imagenUrl: true,
      codigoBarras: true,
      categoriaProductoId: true,
      categoria: { select: { id: true, nombre: true } },
    };

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
      include: {
        categoria: {
          select: { id: true, nombre: true },
        },
      },
      omit: this.omit,
    });
    return registros.map((registro) => ({
      ...registro,
      estado: normalizarEstadoCatalogo(registro.estado),
    }));
  }
}

export const productoDao = new ProductoDao();