import { BaseDao } from "./BaseDao.js";

export class CategoriaProductoDao extends BaseDao {
    constructor() {
        super(
            "categoriaProducto",
            {
                omit: {
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                }
            }
        );
    }

    obtenerParaVenta() {
        return this.model.findMany({
            where: { deletedAt: null },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' },
        });
    }
}
export const categoriaProductoDao = new CategoriaProductoDao();