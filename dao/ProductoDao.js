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
  async getAll(additionalWhere = {}, additionalOrderBy = { id: 'desc' }, empresaId, sucursalId) {
    return this.model.findMany({
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
  }
}

export const productoDao = new ProductoDao();