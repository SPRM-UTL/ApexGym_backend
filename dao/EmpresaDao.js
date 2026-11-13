import { BaseDao } from './BaseDao.js';

const EMPRESA_DEFAULT = {
    id: 1,
    nombreComercial: 'ApexGym',
    razonSocial: 'ApexGym S.A. de C.V.',
    rfc: 'APX260101AAA',
    telefono: '555-019-2834',
    email: 'contacto@apexgym.com',
    direccion: 'Av. Principal #100, Col. Centro',
    ciudad: 'Ciudad de México',
    estado: 'CDMX',
    codigoPostal: '06000',
    logoUrl: null,
    colorPrimario: '#FF6A00',
    moneda: 'MXN',
    simboloMoneda: '$',
    zonaHoraria: 'America/Mexico_City',
    toleranciaMinutos: 15,
    mensajeTicket: '¡Gracias por entrenar en ApexGym!',
    activo: true,
};

export class EmpresaDao extends BaseDao {
    constructor() {
        super('empresa', {
            useEmpresa: false,
            omit: {
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    async obtenerActual(empresaId = 1) {
        const id = this.resolverEmpresaId(empresaId);
        let empresa = await this.model.findUnique({
            where: { id, deletedAt: null },
            omit: this.omit,
        });

        if (!empresa && id === 1) {
            empresa = await this.model.upsert({
                where: { id: 1 },
                update: { deletedAt: null },
                create: EMPRESA_DEFAULT,
                omit: this.omit,
            });
        }

        return empresa;
    }

    async actualizarActual(empresaId = 1, data = {}) {
        const id = this.resolverEmpresaId(empresaId);
        await this.obtenerActual(id);

        return this.model.update({
            where: { id },
            data,
            omit: this.omit,
        });
    }
}

export const empresaDao = new EmpresaDao();
