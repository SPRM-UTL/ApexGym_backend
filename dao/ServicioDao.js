import { BaseDao } from "./BaseDao.js";

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
        return this.model.findMany({
            where: {
                deletedAt: null,
                ...additionalWhere,
            },
            omit: this.omit,
        });
    }
}

export const servicioDao = new ServicioDao();
