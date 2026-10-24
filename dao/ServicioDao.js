import { BaseDao } from "./BaseDao.js";

export class ServicioDao extends BaseDao {
    constructor() {
        super("servicio");
    }
}

export const servicioDao = new ServicioDao();
