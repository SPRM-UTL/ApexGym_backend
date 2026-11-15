import { BaseDao } from './BaseDao.js';

const SUCURSAL_DEFAULT = {
    id: 1,
    empresaId: 1,
    nombre: 'Sucursal Matriz',
    codigo: 'MATRIZ-01',
    direccion: 'Av. Principal #100, Col. Centro',
    ciudad: 'León',
    estado: 'Guanajuato',
    codigoPostal: '37000',
    telefono: '477-123-4567',
    email: 'matriz@apexgym.com',
    activo: true,
};

export class SucursalDao extends BaseDao {
    constructor() {
        super('sucursal', {
            useEmpresa: true,
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async obtenerActual(sucursalId = 1, empresaId = 1) {
        const sId = Number(sucursalId) > 0 ? Number(sucursalId) : 1;
        const eId = this.resolverEmpresaId(empresaId);

        let sucursal = await this.model.findFirst({
            where: {
                id: sId,
                empresaId: eId,
                deletedAt: null,
            },
            omit: this.omit,
        });

        if (!sucursal && sId === 1) {
            sucursal = await this.model.upsert({
                where: { id: 1 },
                update: { deletedAt: null, activo: true },
                create: SUCURSAL_DEFAULT,
                omit: this.omit,
            });
        }

        return sucursal;
    }

    async obtenerPorEmpresa(empresaId = 1) {
        const eId = this.resolverEmpresaId(empresaId);
        return this.model.findMany({
            where: {
                empresaId: eId,
                deletedAt: null,
            },
            orderBy: { id: 'asc' },
            omit: this.omit,
        });
    }
}

export const sucursalDao = new SucursalDao();
