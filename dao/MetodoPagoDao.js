import { BaseDao } from "./BaseDao.js";

export class MetodoPagoDao extends BaseDao{
    constructor(){
        super(
            "metodoPago"
        )
    }

    obtenerActivos() {
        return this.model.findMany({
            where: {
                deletedAt: null,
                estado: { in: ['activo', 'Activo', 'ACTIVO'] },
            },
            select: { id: true, nombre: true, codigo: true },
            orderBy: { id: 'asc' },
        });
    }
}

export const metodoPagoDao = new MetodoPagoDao();