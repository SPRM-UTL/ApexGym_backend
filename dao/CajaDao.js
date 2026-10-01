import { BaseDao } from './BaseDao.js';

export class CajaDao extends BaseDao {
    constructor() {
        super('caja', {
            // Omisión de información delicada y campos de auditoría (createdAt, updatedAt, deletedAt)
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            }
        });
    }
}

export const cajaDao = new CajaDao();
