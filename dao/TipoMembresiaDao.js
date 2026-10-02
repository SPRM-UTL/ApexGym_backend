import { BaseDao } from './BaseDao.js';

export class TipoMembresiaDao extends BaseDao {
    constructor() {
        super('tipoMembresia');
    }
}

export const tipoMembresiaDao = new TipoMembresiaDao();
