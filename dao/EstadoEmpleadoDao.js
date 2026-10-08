import { BaseDao } from './BaseDao.js';

export class EstadoEmpleadoDao extends BaseDao {
    constructor() {
        super('estadoEmpleado', {
            // Omisión de información delicada y campos de auditoría (createdAt, updatedAt, deletedAt)
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            }
        });
    }
}

export const estadoEmpleadoDao = new EstadoEmpleadoDao();
