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
}
export const categoriaProductoDao = new CategoriaProductoDao();