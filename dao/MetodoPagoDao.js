import { BaseDao } from "./BaseDao.js";

export class MetodoPagoDao extends BaseDao{
    constructor(){
        super(
            "metodoPago"
        )
    }
}

export const metodoPagoDao = new MetodoPagoDao();