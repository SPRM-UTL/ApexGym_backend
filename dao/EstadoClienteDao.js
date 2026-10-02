import { BaseDao } from './BaseDao.js';

export class EstadoClienteDao extends BaseDao {
    constructor() {
        super('estadoCliente');
    }

}

export const estadoClienteDao = new EstadoClienteDao();
