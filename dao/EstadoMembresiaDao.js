import { BaseDao } from './BaseDao.js';

export class EstadoMembresiaDao extends BaseDao {
    constructor() {
        super('estadoMembresia');
    }
}

export const estadoMembresiaDao = new EstadoMembresiaDao();
