import { BaseDao } from './BaseDao.js';

export class BeneficioMembresiaDao extends BaseDao {
    constructor() {
        super('beneficioMembresia');
    }

    async getPorTipoMembresia(tipoMembresiaId) {
        return this.model.findMany({
            where: {
                tipoMembresiaId: Number(tipoMembresiaId),
                deletedAt: null
            },
            omit: this.omit
        });
    }
}

export const beneficioMembresiaDao = new BeneficioMembresiaDao();
