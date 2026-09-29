import { BaseDao } from './BaseDao.js';

export class ConfiguracionSistemaDao extends BaseDao {
    constructor() {
        super('configuracionSistema');
    }

    async getAll() {
        return this.prisma.configuracionSistema.findMany({
            where: { deletedAt: null },
            orderBy: { clave: 'asc' },
        });
    }

    async create(data) {
        return this.prisma.configuracionSistema.create({
            data: {
                clave: data.clave,
                valor: data.valor,
                tipoDato: data.tipoDato,
                descripcion: data.descripcion || null,
            },
        });
    }

    async update(id, data) {
        return this.prisma.configuracionSistema.update({
            where: { id },
            data: {
                clave: data.clave,
                valor: data.valor,
                tipoDato: data.tipoDato,
                descripcion: data.descripcion || null,
            },
        });
    }
}

export const configuracionSistemaDao = new ConfiguracionSistemaDao();
