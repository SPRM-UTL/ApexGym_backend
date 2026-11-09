import { BaseDao } from "./BaseDao.js";

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
  async getAll(additionalWhere = {}) {
    return this.model.findMany({
      where: {
        deletedAt: null,
        ...additionalWhere,
      },
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
}

export const productoDao = new ProductoDao();