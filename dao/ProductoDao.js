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
}

export const productoDao = new ProductoDao();