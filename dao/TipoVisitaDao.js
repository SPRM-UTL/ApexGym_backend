import { BaseDao } from './BaseDao.js';

export class TipoVisitaDao extends BaseDao {
    constructor() {
        super('tipoVisita');
    }
}

export const tipoVisitaDao = new TipoVisitaDao();
